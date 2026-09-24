
import { FieldValue } from 'firebase-admin/firestore';
import { mapSchema, poiSchema, type PoiParsed } from 'validation';
import {
  createAutoTranslationMetadata,
  type LocalizedText,
  type TranslationMetadata,
  type TranslationMetadataEntry,
  type PublicContentLanguage,
} from 'shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import type { TranslationProvider, TranslationRequest } from './provider.js';

export class PoiTranslationServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'PoiTranslationServiceError'; }
}

export interface GeneratePoiTranslationsInput {
  readonly mapId: string;
  readonly poiId: string;
  readonly sourceOverrides?: Partial<Record<'name' | 'description' | 'address', string>>;
}

export interface GeneratePoiTranslationsResult {
  readonly translations: PoiParsed['translations'];
  readonly translationMetadata: TranslationMetadata;
  readonly generatedLanguages: readonly PublicContentLanguage[];
}

export interface GeneratePoiTranslationsDependencies {
  readonly provider: TranslationProvider;
  readonly firestore: Firestore;
}

export function hasClientAdminClaims(claims: Readonly<Record<string, unknown>>): claims is { readonly role: 'CLIENT_ADMIN'; readonly customerId: string } {
  return claims.role === 'CLIENT_ADMIN' && typeof claims.customerId === 'string' && claims.customerId.length > 0;
}

export function resolvePoiSourceText(poi: PoiParsed, field: 'name' | 'description' | 'address', language: PublicContentLanguage): string | undefined {
  const localized = poi.translations?.[field]?.[language];
  if (localized?.trim()) return localized;
  const legacy = poi[field];
  return legacy?.trim() ? legacy : undefined;
}

export async function generatePoiTranslationsForPoi(
  input: GeneratePoiTranslationsInput,
  dependencies: GeneratePoiTranslationsDependencies,
): Promise<GeneratePoiTranslationsResult> {
  const firestore = dependencies.firestore;
  const provider = dependencies.provider;
  const mapRef = firestore.doc(`maps/${input.mapId}`);
  const poiRef = mapRef.collection('pois').doc(input.poiId);
  const [mapSnap, poiSnap] = await Promise.all([mapRef.get(), poiRef.get()]);
  const mapParsed = mapSchema.safeParse(mapSnap.data());
  const poiParsed = poiSchema.safeParse(poiSnap.data());
  if (!mapSnap.exists || !mapParsed.success || !poiSnap.exists || !poiParsed.success || poiParsed.data.mapId !== input.mapId) {
    throw new PoiTranslationServiceError('translation/poi-not-found', 'POI not found.');
  }
  const poi = poiParsed.data;
  const sourceLanguage = mapParsed.data.defaultLanguage;
  const targets = mapParsed.data.enabledLanguages.filter((language) => language !== sourceLanguage);
  if (targets.length === 0) throw new PoiTranslationServiceError('translation/no-target-languages', 'No target languages are enabled.');

  const jobs: { readonly field: 'name' | 'description' | 'address'; readonly request: TranslationRequest }[] = [];
  const sourceByField: Partial<Record<'name' | 'description' | 'address', string>> = {};
  const persistedSourceByField: Partial<Record<'name' | 'description' | 'address', string>> = {};
  let hasUnpersistedOverride = false;
  for (const field of ['name', 'address', 'description'] as const) {
    const persistedText = resolvePoiSourceText(poi, field, sourceLanguage);
    const override = input.sourceOverrides?.[field]?.trim();
    const text = poi.sourceType === 'CLIENT_CUSTOM' && override ? override : persistedText;
    if (poi.sourceType === 'CLIENT_CUSTOM' && override && override !== persistedText) hasUnpersistedOverride = true;
    if (!text) {
      if (field === 'name') throw new PoiTranslationServiceError('translation/no-source-content', 'POI name has no source content.');
      continue;
    }
    sourceByField[field] = text;
    if (persistedText !== undefined) persistedSourceByField[field] = persistedText;
    for (const targetLanguage of targets) {
      const existing = poi.translations?.[field]?.[targetLanguage];
      const metadata = poi.translationMetadata?.[field]?.[targetLanguage];
      if (existing && (!metadata || metadata.status === 'OVERRIDE')) continue;
      jobs.push({ field, request: { text, sourceLanguage, targetLanguage } });
    }
  }
  const requests = jobs.map((job) => job.request);
  const results = provider.translateBatch ? await provider.translateBatch(requests) : await Promise.all(requests.map((request) => provider.translateText(request)));
  const translations: { name?: LocalizedText; description?: LocalizedText; address?: LocalizedText } = {
    ...(poi.translations?.name ? { name: { ...poi.translations.name } } : {}),
    ...(poi.translations?.description ? { description: { ...poi.translations.description } } : {}),
    ...(poi.translations?.address ? { address: { ...poi.translations.address } } : {}),
  };
  const translationMetadata: Record<string, Record<string, TranslationMetadataEntry>> = {
    ...(poi.translationMetadata ?? {}),
    name: { ...(poi.translationMetadata?.name ?? {}) },
    description: { ...(poi.translationMetadata?.description ?? {}) },
  };
  for (const result of results) {
    const job = jobs[results.indexOf(result)];
    if (!job) continue;
    translations[job.field] = { ...(translations[job.field] ?? {}), [result.targetLanguage]: result.text };
    translationMetadata[job.field] = { ...(translationMetadata[job.field] ?? {}), [result.targetLanguage]: createAutoTranslationMetadata(job.request.text, result.provider, new Date().toISOString()) };
  }
  if (hasUnpersistedOverride) {
    return { translations, translationMetadata, generatedLanguages: [...new Set(results.map((result) => result.targetLanguage))] };
  }
  await firestore.runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(poiRef);
    const current = poiSchema.safeParse(currentSnap.data());
    if (!current.success || (persistedSourceByField.name !== undefined && resolvePoiSourceText(current.data, 'name', sourceLanguage) !== persistedSourceByField.name) || (persistedSourceByField.address !== undefined && resolvePoiSourceText(current.data, 'address', sourceLanguage) !== persistedSourceByField.address) || (persistedSourceByField.description !== undefined && resolvePoiSourceText(current.data, 'description', sourceLanguage) !== persistedSourceByField.description)) {
      throw new PoiTranslationServiceError('translation/concurrent-change', 'POI changed while translations were being generated.');
    }
    const currentTranslations = current.data.translations ?? {};
    const currentMetadata = current.data.translationMetadata ?? {};
    for (const job of jobs) {
      const metadata = currentMetadata[job.field]?.[job.request.targetLanguage];
      if (metadata?.status === 'OVERRIDE') {
        const overrideValue = currentTranslations[job.field]?.[job.request.targetLanguage];
        if (overrideValue) translations[job.field] = { ...(translations[job.field] ?? {}), [job.request.targetLanguage]: overrideValue };
        translationMetadata[job.field] = { ...(translationMetadata[job.field] ?? {}), [job.request.targetLanguage]: metadata };
        continue;
      }
      translations[job.field] = { ...(currentTranslations[job.field] ?? {}), ...(translations[job.field] ?? {}) };
      translationMetadata[job.field] = { ...(currentMetadata[job.field] ?? {}), ...(translationMetadata[job.field] ?? {}) };
    }
    transaction.update(poiRef, {
      translations,
      translationMetadata,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { translations, translationMetadata, generatedLanguages: [...new Set(results.map((result) => result.targetLanguage))] };
}

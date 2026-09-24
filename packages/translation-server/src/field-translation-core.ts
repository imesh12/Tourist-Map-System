import type { LocalizedText, PublicContentLanguage, TranslationMetadata, TranslationMetadataEntry } from 'shared-types';
import { createAutoTranslationMetadata } from 'shared-types';
import type { TranslationProvider, TranslationRequest } from './provider.js';

export interface TranslationFieldInput {
  readonly source: string;
  readonly translations?: LocalizedText;
  readonly metadata?: TranslationMetadata;
}

export interface GeneratedFieldTranslations {
  readonly translations: LocalizedText;
  readonly translationMetadata: TranslationMetadata;
  readonly generatedLanguages: readonly PublicContentLanguage[];
}

/** Shared server-only translation orchestration for non-POI editors. */
export async function generateFieldTranslations(
  fields: Readonly<Record<string, TranslationFieldInput>>,
  sourceLanguage: PublicContentLanguage,
  targetLanguages: readonly PublicContentLanguage[],
  provider: TranslationProvider,
): Promise<{ readonly fields: Readonly<Record<string, GeneratedFieldTranslations>>; readonly generatedLanguages: readonly PublicContentLanguage[] }> {
  const jobs: { readonly field: string; readonly request: TranslationRequest }[] = [];
  for (const [field, input] of Object.entries(fields)) {
    const source = input.source.trim();
    if (!source) continue;
    for (const targetLanguage of targetLanguages) {
      const existing = input.translations?.[targetLanguage];
      const metadata = input.metadata?.[field]?.[targetLanguage];
      if (existing && (!metadata || metadata.status === 'OVERRIDE')) continue;
      jobs.push({ field, request: { text: source, sourceLanguage, targetLanguage } });
    }
  }
  const results = provider.translateBatch
    ? await provider.translateBatch(jobs.map((job) => job.request))
    : await Promise.all(jobs.map((job) => provider.translateText(job.request)));
  const output: Record<string, GeneratedFieldTranslations> = {};
  for (const [field, input] of Object.entries(fields)) {
    output[field] = {
      translations: { ...(input.translations ?? {}) },
      translationMetadata: { ...(input.metadata ?? {}) },
      generatedLanguages: [],
    };
  }
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const job = jobs[index];
    if (!result || !job) continue;
    const current = output[job.field];
    if (!current) continue;
    const metadata: TranslationMetadataEntry = createAutoTranslationMetadata(job.request.text, result.provider, new Date().toISOString());
    output[job.field] = {
      translations: { ...current.translations, [result.targetLanguage]: result.text },
      translationMetadata: {
        ...current.translationMetadata,
        [job.field]: { ...(current.translationMetadata[job.field] ?? {}), [result.targetLanguage]: metadata },
      },
      generatedLanguages: [...current.generatedLanguages, result.targetLanguage],
    };
  }
  return { fields: output, generatedLanguages: [...new Set(results.map((result) => result.targetLanguage))] };
}

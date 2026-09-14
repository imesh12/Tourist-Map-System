import type { PublicContentLanguage } from './language.js';

/** Provider-neutral lifecycle state for a generated field translation. */
export const TRANSLATION_STATUSES = ['AUTO', 'OVERRIDE', 'STALE'] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

/** Metadata is separate from the LocalizedText string bag by design. */
export interface TranslationMetadataEntry {
  readonly status: TranslationStatus;
  readonly sourceFingerprint: string;
  readonly provider?: string;
  readonly generatedAt?: string;
}

export type TranslationMetadata = Readonly<
  Record<string, Readonly<Partial<Record<PublicContentLanguage, TranslationMetadataEntry>>>>
>;

/** A small deterministic, server/browser-safe fingerprint (no timestamps or randomness). */
export function fingerprintSourceText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function markTranslationStale(
  metadata: TranslationMetadataEntry,
  sourceText: string,
): TranslationMetadataEntry {
  if (metadata.status === 'OVERRIDE') return metadata;
  return metadata.sourceFingerprint === fingerprintSourceText(sourceText)
    ? metadata
    : { ...metadata, status: 'STALE' };
}

export function createAutoTranslationMetadata(
  sourceText: string,
  provider: string,
  generatedAt?: string,
): TranslationMetadataEntry {
  return { status: 'AUTO', sourceFingerprint: fingerprintSourceText(sourceText), provider, ...(generatedAt ? { generatedAt } : {}) };
}

export function markTranslationOverride(metadata: TranslationMetadataEntry, sourceText: string): TranslationMetadataEntry {
  return { ...metadata, status: 'OVERRIDE', sourceFingerprint: fingerprintSourceText(sourceText) };
}

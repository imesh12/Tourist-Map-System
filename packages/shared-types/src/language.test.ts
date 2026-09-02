import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLIC_CONTENT_LANGUAGE,
  PUBLIC_CONTENT_LANGUAGE_CODES,
  PUBLIC_CONTENT_LANGUAGE_REGISTRY,
  getPublicContentLanguageRegistryEntry,
  isPublicContentLanguage,
  listPublicContentLanguages,
  normalizeLegacyPublicContentLanguageCode,
  resolveLocalizedText,
} from './language';

/**
 * Public-content language registry + fallback resolver unit tests —
 * checkpoint 1B.17A. Scenarios 1–2 (registry) and 13–17 (fallback resolver)
 * of the checkpoint's required 27-scenario minimum.
 */

describe('PUBLIC_CONTENT_LANGUAGE_REGISTRY — checkpoint 1B.17A (scenario 1)', () => {
  it('contains exactly the initial 7-language registry, each with a code/englishLabel/nativeLabel', () => {
    expect(PUBLIC_CONTENT_LANGUAGE_CODES).toEqual(['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es']);
    for (const code of PUBLIC_CONTENT_LANGUAGE_CODES) {
      const entry = PUBLIC_CONTENT_LANGUAGE_REGISTRY[code];
      expect(entry.code).toBe(code);
      expect(entry.englishLabel.length).toBeGreaterThan(0);
      expect(entry.nativeLabel.length).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_PUBLIC_CONTENT_LANGUAGE is a real registered code', () => {
    expect(isPublicContentLanguage(DEFAULT_PUBLIC_CONTENT_LANGUAGE)).toBe(true);
  });

  it('listPublicContentLanguages() enumerates every entry in the registry\'s own deterministic declaration order', () => {
    expect(listPublicContentLanguages().map((entry) => entry.code)).toEqual(PUBLIC_CONTENT_LANGUAGE_CODES);
  });

  it('getPublicContentLanguageRegistryEntry() returns undefined for an unregistered/arbitrary code (scenario 2)', () => {
    expect(getPublicContentLanguageRegistryEntry('de')).toBeUndefined();
    expect(getPublicContentLanguageRegistryEntry('')).toBeUndefined();
    expect(getPublicContentLanguageRegistryEntry('EN')).toBeUndefined();
  });

  it('isPublicContentLanguage() distinguishes registered codes from lookalikes/legacy codes', () => {
    expect(isPublicContentLanguage('en')).toBe(true);
    expect(isPublicContentLanguage('zh-CN')).toBe(true);
    expect(isPublicContentLanguage('EN')).toBe(false);
    expect(isPublicContentLanguage('zh_CN')).toBe(false);
    expect(isPublicContentLanguage('xx')).toBe(false);
  });
});

describe('normalizeLegacyPublicContentLanguageCode() — checkpoint 1B.17A', () => {
  it('maps every pre-1B.17A legacy code to its current equivalent', () => {
    expect(normalizeLegacyPublicContentLanguageCode('EN')).toBe('en');
    expect(normalizeLegacyPublicContentLanguageCode('JA')).toBe('ja');
    expect(normalizeLegacyPublicContentLanguageCode('ZH_CN')).toBe('zh-CN');
    expect(normalizeLegacyPublicContentLanguageCode('KO')).toBe('ko');
  });

  it('passes an already-current code through unchanged', () => {
    expect(normalizeLegacyPublicContentLanguageCode('fr')).toBe('fr');
  });

  it('returns undefined for a genuinely unrecognized code', () => {
    expect(normalizeLegacyPublicContentLanguageCode('DE')).toBeUndefined();
    expect(normalizeLegacyPublicContentLanguageCode('not-a-code')).toBeUndefined();
  });
});

describe('resolveLocalizedText() — checkpoint 1B.17A §7 (scenarios 13–17)', () => {
  it('scenario 13: resolves to the requested language\'s translation when present', () => {
    const result = resolveLocalizedText({
      requestedLanguage: 'en',
      defaultLanguage: 'ja',
      translations: { ja: '東京タワー', en: 'Tokyo Tower' },
      legacyValue: '東京タワー',
    });
    expect(result).toBe('Tokyo Tower');
  });

  it('scenario 14: the checkpoint\'s own worked example — requested=ko missing, default=ja present, falls back to default language', () => {
    const result = resolveLocalizedText({
      requestedLanguage: 'ko',
      defaultLanguage: 'ja',
      translations: { ja: '東京タワー', en: 'Tokyo Tower' },
      legacyValue: '東京タワー',
    });
    expect(result).toBe('東京タワー');
  });

  it('scenario 15: falls back to the legacy scalar value when neither requested nor default language has a translation', () => {
    const result = resolveLocalizedText({
      requestedLanguage: 'ko',
      defaultLanguage: 'fr',
      translations: { en: 'Tokyo Tower' },
      legacyValue: 'Tokyo Tower (legacy)',
    });
    expect(result).toBe('Tokyo Tower (legacy)');
  });

  it('scenario 16: with no legacy value and no requested/default translation, deterministically falls back to an available translation in registry order', () => {
    const result = resolveLocalizedText({
      requestedLanguage: 'ko',
      defaultLanguage: 'fr',
      translations: { es: 'Torre de Tokio', en: 'Tokyo Tower' },
      legacyValue: undefined,
    });
    // Registry order is ja, en, zh-CN, zh-TW, ko, fr, es — 'en' comes before 'es'.
    expect(result).toBe('Tokyo Tower');
  });

  it('scenario 17: returns \'\' (never throws, never undefined) when there is no translation and no legacy value at all', () => {
    const result = resolveLocalizedText({ requestedLanguage: 'en', defaultLanguage: 'ja', translations: undefined, legacyValue: undefined });
    expect(result).toBe('');
  });

  it('treats an empty-string legacyValue the same as an absent one', () => {
    const result = resolveLocalizedText({ requestedLanguage: 'en', defaultLanguage: 'ja', translations: { fr: 'Tour de Tokyo' }, legacyValue: '' });
    expect(result).toBe('Tour de Tokyo');
  });

  it('is a pure function: repeated calls with the same input produce the same output', () => {
    const input = { requestedLanguage: 'ko' as const, defaultLanguage: 'ja' as const, translations: { ja: '東京タワー' }, legacyValue: '東京タワー' };
    expect(resolveLocalizedText(input)).toBe(resolveLocalizedText(input));
  });
});

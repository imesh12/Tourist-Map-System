import { describe, expect, it } from 'vitest';
import {
  legacyPublicContentLanguageInputSchema,
  localizedTextSchema,
  mapLanguageConfigSchema,
  publicContentLanguageSchema,
  supportedPublicContentLanguagesSchema,
} from './language';

/**
 * Language validation unit tests — checkpoint 1B.17A. Covers scenarios 3–12
 * of the checkpoint's required 27-scenario minimum: map language settings
 * (3–8) and localized text (9–12).
 */

describe('publicContentLanguageSchema', () => {
  it('accepts every current registry code', () => {
    for (const code of ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es']) {
      expect(publicContentLanguageSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects an arbitrary, unregistered code (not a controlled-registry member)', () => {
    expect(publicContentLanguageSchema.safeParse('de').success).toBe(false);
  });

  it('rejects a legacy pre-1B.17A code (this schema does not normalize)', () => {
    expect(publicContentLanguageSchema.safeParse('EN').success).toBe(false);
  });
});

describe('legacyPublicContentLanguageInputSchema', () => {
  it('normalizes every pre-1B.17A legacy code to its current equivalent', () => {
    expect(legacyPublicContentLanguageInputSchema.parse('EN')).toBe('en');
    expect(legacyPublicContentLanguageInputSchema.parse('JA')).toBe('ja');
    expect(legacyPublicContentLanguageInputSchema.parse('ZH_CN')).toBe('zh-CN');
    expect(legacyPublicContentLanguageInputSchema.parse('KO')).toBe('ko');
  });

  it('accepts an already-current code unchanged', () => {
    expect(legacyPublicContentLanguageInputSchema.parse('fr')).toBe('fr');
  });

  it('rejects a genuinely unrecognized/malformed code', () => {
    expect(legacyPublicContentLanguageInputSchema.safeParse('xx').success).toBe(false);
    expect(legacyPublicContentLanguageInputSchema.safeParse(123).success).toBe(false);
    expect(legacyPublicContentLanguageInputSchema.safeParse(null).success).toBe(false);
  });
});

describe('supportedPublicContentLanguagesSchema — checkpoint 1B.17A §3 (scenarios 3–6)', () => {
  it('scenario 3: accepts a single supported language', () => {
    expect(supportedPublicContentLanguagesSchema.safeParse(['en']).success).toBe(true);
  });

  it('scenario 4: accepts multiple distinct supported languages, normalizing legacy codes per-element', () => {
    const result = supportedPublicContentLanguagesSchema.safeParse(['EN', 'ja', 'ko']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(['en', 'ja', 'ko']);
    }
  });

  it('scenario 5: rejects an empty array (at least one language required)', () => {
    expect(supportedPublicContentLanguagesSchema.safeParse([]).success).toBe(false);
  });

  it('scenario 6: rejects duplicate entries (including a legacy/current duplicate pair)', () => {
    expect(supportedPublicContentLanguagesSchema.safeParse(['en', 'en']).success).toBe(false);
    expect(supportedPublicContentLanguagesSchema.safeParse(['EN', 'en']).success).toBe(false);
  });

  it('rejects an unregistered code anywhere in the array', () => {
    expect(supportedPublicContentLanguagesSchema.safeParse(['en', 'de']).success).toBe(false);
  });

  it('rejects more entries than the registry has languages (deterministic upper bound)', () => {
    const tooMany = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es', 'ja'];
    expect(supportedPublicContentLanguagesSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe('mapLanguageConfigSchema — checkpoint 1B.17A §3/§8 (scenarios 7–8)', () => {
  it('scenario 7: accepts a config where the default is included in supported', () => {
    const result = mapLanguageConfigSchema.safeParse({ defaultLanguage: 'ja', supportedLanguages: ['ja', 'en'] });
    expect(result.success).toBe(true);
  });

  it('scenario 8: rejects a config where the default is NOT included in supported', () => {
    const result = mapLanguageConfigSchema.safeParse({ defaultLanguage: 'ko', supportedLanguages: ['ja', 'en'] });
    expect(result.success).toBe(false);
  });

  it('normalizes a legacy-coded default alongside legacy-coded supported entries consistently', () => {
    const result = mapLanguageConfigSchema.safeParse({ defaultLanguage: 'EN', supportedLanguages: ['EN', 'JA'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] });
    }
  });

  it('rejects a config missing supportedLanguages entirely', () => {
    expect(mapLanguageConfigSchema.safeParse({ defaultLanguage: 'en' }).success).toBe(false);
  });

  it('rejects a config missing defaultLanguage entirely', () => {
    expect(mapLanguageConfigSchema.safeParse({ supportedLanguages: ['en'] }).success).toBe(false);
  });

  it('rejects an unknown extra field (.strict() — mirrors mapThemeSchema/mapBrandingSchema\'s own convention)', () => {
    const result = mapLanguageConfigSchema.safeParse({ defaultLanguage: 'en', supportedLanguages: ['en'], mapId: 'map_attackerControlled01' });
    expect(result.success).toBe(false);
  });
});

describe('localizedTextSchema() — checkpoint 1B.17A §4/§13 (scenarios 9–12)', () => {
  const schema = localizedTextSchema(10);

  it('scenario 9: accepts a partial map of registered-language keys to trimmed non-empty strings', () => {
    const result = schema.safeParse({ ja: '東京', en: 'Tokyo' });
    expect(result.success).toBe(true);
  });

  it('scenario 10: accepts an empty object (nothing translated yet — Partial by design)', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('scenario 11: rejects an unregistered/unknown language key', () => {
    const result = schema.safeParse({ de: 'Tokio' });
    expect(result.success).toBe(false);
  });

  it('scenario 12: rejects an explicit empty string value (distinguishing "missing" from "empty-invalid")', () => {
    const result = schema.safeParse({ en: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only value even though it would trim to empty', () => {
    expect(schema.safeParse({ en: '   ' }).success).toBe(false);
  });

  it('trims a value with surrounding whitespace', () => {
    const result = schema.safeParse({ en: '  Tokyo  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.en).toBe('Tokyo');
    }
  });

  it('enforces the caller-supplied max length bound', () => {
    expect(schema.safeParse({ en: 'this value is far too long' }).success).toBe(false);
  });

  it('rejects a malformed (non-string) translation value', () => {
    expect(schema.safeParse({ en: 12345 }).success).toBe(false);
  });

  it('rejects a malformed (non-object) input entirely', () => {
    expect(schema.safeParse('not-an-object').success).toBe(false);
    expect(schema.safeParse(['ja', 'en']).success).toBe(false);
  });
});

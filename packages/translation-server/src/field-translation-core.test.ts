import { describe, expect, it } from 'vitest';
import { generateFieldTranslations } from './field-translation-core.js';
import type { TranslationProvider } from './provider.js';

const provider: TranslationProvider = {
  name: 'FAKE_TRANSLATION',
  async translateText(request) {
    return { ...request, text: `${request.text}-${request.targetLanguage}`, provider: 'FAKE_TRANSLATION' };
  },
};

describe('generateFieldTranslations', () => {
  it('translates current fields and preserves existing overrides', async () => {
    const result = await generateFieldTranslations(
      {
        name: { source: 'Harbor', translations: { ko: '항구' }, metadata: { name: { ko: { status: 'OVERRIDE', sourceFingerprint: 'deadbeef' } } } },
        description: { source: 'View', translations: {} },
      },
      'en',
      ['en', 'ko', 'fr'],
      provider,
    );
    expect(result.fields.name?.translations.ko).toBe('항구');
    expect(result.fields.name?.translations.fr).toBe('Harbor-fr');
    expect(result.fields.description?.translations.ko).toBe('View-ko');
    expect(result.fields.description?.translationMetadata.description?.ko?.status).toBe('AUTO');
  });
});

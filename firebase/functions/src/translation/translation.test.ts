import { describe, expect, it } from 'vitest';
import { FakeTranslationProvider } from './fake-provider.js';
import { GoogleCloudTranslationProvider } from './google-cloud-provider.js';
import { toGoogleCloudLanguageCode } from './google-language-map.js';
import { TranslationError } from './provider.js';

describe('Google language mapping', () => {
  it.each(['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es'] as const)('maps %s explicitly', (language) => {
    expect(toGoogleCloudLanguageCode(language)).toBe(language);
  });

  it('rejects an unsupported language clearly', () => {
    expect(() => toGoogleCloudLanguageCode('de')).toThrowError(TranslationError);
  });
});

describe('translation providers', () => {
  it('provides a deterministic fake provider without network access', async () => {
    const provider = new FakeTranslationProvider();
    await expect(provider.translateText({ text: 'こんにちは', sourceLanguage: 'ja', targetLanguage: 'en' })).resolves.toMatchObject({ text: '[en] こんにちは' });
    expect(provider.requests).toHaveLength(1);
    await expect(provider.translateText({ text: ' ', sourceLanguage: 'ja', targetLanguage: 'en' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('constructs the Advanced v3 request with explicit source and target languages', async () => {
    const calls: unknown[] = [];
    const client = {
      translateText: async (request: unknown) => {
        calls.push(request);
        return [{ translations: [{ translatedText: 'Hello' }] }] as const;
      },
    };
    const provider = new GoogleCloudTranslationProvider({ projectId: 'translation-project', client });
    await expect(provider.translateText({ text: 'こんにちは', sourceLanguage: 'ja', targetLanguage: 'en' })).resolves.toMatchObject({ text: 'Hello' });
    expect(calls[0]).toEqual({
      parent: 'projects/translation-project/locations/global',
      contents: ['こんにちは'],
      mimeType: 'text/plain',
      sourceLanguageCode: 'ja',
      targetLanguageCode: 'en',
    });
  });

  it('normalizes provider failures without exposing credentials', async () => {
    const client = { translateText: async () => { throw new Error('service account private key'); } };
    const provider = new GoogleCloudTranslationProvider({ projectId: 'translation-project', client });
    await expect(provider.translateText({ text: 'hello', sourceLanguage: 'en', targetLanguage: 'ja' })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE', message: 'Google Cloud Translation failed.' });
  });
});

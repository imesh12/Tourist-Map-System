import { TranslationServiceClient } from '@google-cloud/translate';
import type { TranslationRequest, TranslationResult, TranslationProvider } from './provider.js';
import { TranslationError, validateTranslationRequest } from './provider.js';
import { toGoogleCloudLanguageCode } from './google-language-map.js';

interface TranslationClient {
  translateText(request: {
    readonly parent: string;
    readonly contents: string[];
    readonly mimeType: string;
    readonly sourceLanguageCode: string;
    readonly targetLanguageCode: string;
  }): Promise<readonly [{ readonly translations?: readonly { readonly translatedText?: string | null }[] | null }, ...unknown[]]>;
}

export interface GoogleCloudTranslationProviderOptions {
  readonly projectId?: string;
  readonly location?: string;
  readonly client?: TranslationClient;
}

export class GoogleCloudTranslationProvider implements TranslationProvider {
  readonly name = 'GOOGLE_CLOUD_TRANSLATION_ADVANCED_V3';
  private readonly projectId: string;
  private readonly location: string;
  private readonly client: TranslationClient;

  constructor(options: GoogleCloudTranslationProviderOptions = {}) {
    const projectId = options.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID;
    if (!projectId) throw new TranslationError('CONFIGURATION', 'Google Cloud Translation requires GOOGLE_CLOUD_PROJECT configuration.');
    this.projectId = projectId;
    this.location = options.location ?? 'global';
    this.client = options.client ?? new TranslationServiceClient();
  }

  async translateText(request: TranslationRequest): Promise<TranslationResult> {
    validateTranslationRequest(request);
    const sourceLanguageCode = toGoogleCloudLanguageCode(request.sourceLanguage);
    const targetLanguageCode = toGoogleCloudLanguageCode(request.targetLanguage);
    try {
      const [response] = await this.client.translateText({
        parent: `projects/${this.projectId}/locations/${this.location}`,
        contents: [request.text],
        mimeType: 'text/plain',
        sourceLanguageCode,
        targetLanguageCode,
      });
      const translatedText = response.translations?.[0]?.translatedText;
      if (!translatedText) throw new Error('Provider returned no translated text.');
      return { text: translatedText, sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage, provider: this.name };
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      throw new TranslationError('PROVIDER_FAILURE', 'Google Cloud Translation failed.', { cause: error });
    }
  }

  async translateBatch(requests: readonly TranslationRequest[]): Promise<readonly TranslationResult[]> {
    const results: TranslationResult[] = [];
    for (const request of requests) results.push(await this.translateText(request));
    return results;
  }
}

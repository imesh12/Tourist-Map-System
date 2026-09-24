import type { TranslationRequest, TranslationResult, TranslationProvider } from './provider.js';
import { validateTranslationRequest } from './provider.js';

export class FakeTranslationProvider implements TranslationProvider {
  readonly name = 'FAKE_TRANSLATION';
  readonly requests: TranslationRequest[] = [];
  private readonly translate: (request: TranslationRequest) => string;

  constructor(translate: (request: TranslationRequest) => string = (request) => `[${request.targetLanguage}] ${request.text}`) {
    this.translate = translate;
  }

  async translateText(request: TranslationRequest): Promise<TranslationResult> {
    validateTranslationRequest(request);
    this.requests.push(request);
    return { text: this.translate(request), sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage, provider: this.name };
  }

  async translateBatch(requests: readonly TranslationRequest[]): Promise<readonly TranslationResult[]> {
    const results: TranslationResult[] = [];
    for (const request of requests) results.push(await this.translateText(request));
    return results;
  }
}

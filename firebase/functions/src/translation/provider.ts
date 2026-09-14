import type { PublicContentLanguage } from 'shared-types';

export interface TranslationRequest {
  readonly text: string;
  readonly sourceLanguage: PublicContentLanguage;
  readonly targetLanguage: PublicContentLanguage;
}

export interface TranslationResult {
  readonly text: string;
  readonly sourceLanguage: PublicContentLanguage;
  readonly targetLanguage: PublicContentLanguage;
  readonly provider: string;
}

export interface TranslationProvider {
  readonly name: string;
  translateText(request: TranslationRequest): Promise<TranslationResult>;
  translateBatch?(requests: readonly TranslationRequest[]): Promise<readonly TranslationResult[]>;
}

export type TranslationErrorCode = 'CONFIGURATION' | 'UNSUPPORTED_LANGUAGE' | 'INVALID_REQUEST' | 'PROVIDER_FAILURE';

export class TranslationError extends Error {
  readonly code: TranslationErrorCode;

  constructor(code: TranslationErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function validateTranslationRequest(request: TranslationRequest): void {
  if (!request.text.trim()) throw new TranslationError('INVALID_REQUEST', 'Translation text must not be empty.');
  if (request.sourceLanguage === request.targetLanguage) {
    throw new TranslationError('INVALID_REQUEST', 'Source and target languages must differ.');
  }
}

import { isPublicContentLanguage, type PublicContentLanguage } from 'shared-types';
import { TranslationError } from './provider.js';

const GOOGLE_LANGUAGE_CODES: Readonly<Record<PublicContentLanguage, string>> = {
  ja: 'ja',
  en: 'en',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  ko: 'ko',
  fr: 'fr',
  es: 'es',
};

export function toGoogleCloudLanguageCode(language: string): string {
  if (!isPublicContentLanguage(language)) {
    throw new TranslationError('UNSUPPORTED_LANGUAGE', `Language '${language}' is not supported by the Google Cloud translation provider.`);
  }
  return GOOGLE_LANGUAGE_CODES[language];
}

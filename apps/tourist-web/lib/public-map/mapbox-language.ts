import type { PublicContentLanguage } from 'shared-types';

/** Applies canonical BCP-47 public language codes to a Mapbox runtime. */
export interface MapboxLanguageRuntime {
  getLanguage: () => string | string[] | null | undefined;
  setLanguage: (language: string) => unknown;
}

/** Mapbox's vector-tile language tags use script subtags for Chinese. */
export function mapboxLanguageCode(language: PublicContentLanguage): string {
  if (language === 'zh-CN') return 'zh-Hans';
  if (language === 'zh-TW') return 'zh-Hant';
  return language;
}

export function syncMapboxLanguage(runtime: MapboxLanguageRuntime, language: PublicContentLanguage): boolean {
  const providerLanguage = mapboxLanguageCode(language);
  if (runtime.getLanguage() === providerLanguage) return false;
  runtime.setLanguage(providerLanguage);
  return true;
}

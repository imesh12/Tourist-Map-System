import { describe, expect, it, vi } from 'vitest';
import { mapboxLanguageCode, syncMapboxLanguage } from './mapbox-language';

describe('syncMapboxLanguage', () => {
  it.each(['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es'] as const)('forwards %s', (language) => {
    const setLanguage = vi.fn();
    expect(syncMapboxLanguage({ getLanguage: () => undefined, setLanguage }, language)).toBe(true);
    expect(setLanguage).toHaveBeenCalledWith(mapboxLanguageCode(language));
  });

  it('uses Mapbox script tags for simplified and traditional Chinese', () => {
    expect(mapboxLanguageCode('zh-CN')).toBe('zh-Hans');
    expect(mapboxLanguageCode('zh-TW')).toBe('zh-Hant');
  });

  it('does not update an already matching language', () => {
    const setLanguage = vi.fn();
    expect(syncMapboxLanguage({ getLanguage: () => 'ko', setLanguage }, 'ko')).toBe(false);
    expect(setLanguage).not.toHaveBeenCalled();
  });
});

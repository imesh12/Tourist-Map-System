import { describe, expect, it } from 'vitest';
import { resolveTouristMessages, TOURIST_MESSAGES } from './messages';

describe('tourist UI messages', () => {
  it.each(['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es'] as const)('provides a complete dictionary for %s', (language) => {
    const messages = resolveTouristMessages(language, 'en');
    expect(messages.searchPlaces).not.toBe('');
    expect(messages.playLive).not.toBe('');
    expect(messages.closePlaceDetails).not.toBe('');
    expect(messages.mapLoadError).not.toBe('');
    expect(messages.readMore).not.toBe('');
    expect(messages.readLess).not.toBe('');
    expect(messages.photoBy).not.toBe('');
    expect(messages.myLocationMarker).not.toBe('');
  });

  it('uses the selected language before the map default', () => {
    expect(resolveTouristMessages('ko', 'ja').searchPlaces).toBe(TOURIST_MESSAGES.ko.searchPlaces);
  });

  it('falls back deterministically to the map default and English', () => {
    expect(resolveTouristMessages('en', 'ja').all).toBe('All');
    expect(resolveTouristMessages('ja', 'en').all).toBe('すべて');
  });
});

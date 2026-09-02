import { describe, expect, it } from 'vitest';
import type { PublicContentLanguage } from 'shared-types';
import {
  matchBcp47TagToPublicContentLanguage,
  matchBrowserLanguages,
  parseAcceptLanguageHeader,
  resolveExplicitLangParam,
  resolveInitialLanguage,
} from './language-selection';

const ALL_LANGUAGES: readonly PublicContentLanguage[] = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es'];

describe('parseAcceptLanguageHeader — checkpoint 1B.17B §12/§13', () => {
  it('parses a simple header into an ordered tag list', () => {
    expect(parseAcceptLanguageHeader('ja,en-US;q=0.9,fr;q=0.5')).toEqual(['ja', 'en-US', 'fr']);
  });

  it('sorts by quality descending, preserving relative order for ties', () => {
    expect(parseAcceptLanguageHeader('fr;q=0.5,en;q=0.9,ja')).toEqual(['ja', 'en', 'fr']);
  });

  it('returns an empty array for a missing/empty header, never throwing', () => {
    expect(parseAcceptLanguageHeader(undefined)).toEqual([]);
    expect(parseAcceptLanguageHeader(null)).toEqual([]);
    expect(parseAcceptLanguageHeader('')).toEqual([]);
  });

  it('skips a wildcard/malformed entry rather than crashing', () => {
    expect(parseAcceptLanguageHeader('*,,ja')).toEqual(['ja']);
  });
});

describe('matchBcp47TagToPublicContentLanguage — §13 exact examples', () => {
  it('ja-JP → ja', () => {
    expect(matchBcp47TagToPublicContentLanguage('ja-JP', ALL_LANGUAGES, 'en')).toBe('ja');
  });

  it('en-US → en', () => {
    expect(matchBcp47TagToPublicContentLanguage('en-US', ALL_LANGUAGES, 'en')).toBe('en');
  });

  it('ko-KR → ko', () => {
    expect(matchBcp47TagToPublicContentLanguage('ko-KR', ALL_LANGUAGES, 'en')).toBe('ko');
  });

  it('fr-FR → fr', () => {
    expect(matchBcp47TagToPublicContentLanguage('fr-FR', ALL_LANGUAGES, 'en')).toBe('fr');
  });

  it('zh-CN and zh-SG → zh-CN when supported', () => {
    expect(matchBcp47TagToPublicContentLanguage('zh-CN', ALL_LANGUAGES, 'en')).toBe('zh-CN');
    expect(matchBcp47TagToPublicContentLanguage('zh-SG', ALL_LANGUAGES, 'en')).toBe('zh-CN');
  });

  it('zh-TW, zh-HK, and zh-MO → zh-TW when supported', () => {
    expect(matchBcp47TagToPublicContentLanguage('zh-TW', ALL_LANGUAGES, 'en')).toBe('zh-TW');
    expect(matchBcp47TagToPublicContentLanguage('zh-HK', ALL_LANGUAGES, 'en')).toBe('zh-TW');
    expect(matchBcp47TagToPublicContentLanguage('zh-MO', ALL_LANGUAGES, 'en')).toBe('zh-TW');
  });

  it('plain zh prefers the publication default when it is itself a supported Chinese variant', () => {
    expect(matchBcp47TagToPublicContentLanguage('zh', ALL_LANGUAGES, 'zh-TW')).toBe('zh-TW');
    expect(matchBcp47TagToPublicContentLanguage('zh', ALL_LANGUAGES, 'zh-CN')).toBe('zh-CN');
  });

  it('plain zh falls back to a deterministic supported Chinese variant when the default is not Chinese', () => {
    expect(matchBcp47TagToPublicContentLanguage('zh', ALL_LANGUAGES, 'en')).toBe('zh-CN');
    expect(matchBcp47TagToPublicContentLanguage('zh', ['zh-TW', 'en'], 'en')).toBe('zh-TW');
  });

  it('plain zh returns undefined when no Chinese variant is supported at all', () => {
    expect(matchBcp47TagToPublicContentLanguage('zh', ['en', 'ja'], 'en')).toBeUndefined();
  });

  it('a specific Chinese region the map does not support falls back to the same generic-zh resolution', () => {
    expect(matchBcp47TagToPublicContentLanguage('zh-CN', ['zh-TW', 'en'], 'en')).toBe('zh-TW');
  });

  it('a language not in the registry at all resolves to undefined', () => {
    expect(matchBcp47TagToPublicContentLanguage('de-DE', ALL_LANGUAGES, 'en')).toBeUndefined();
  });

  it('a registry-valid language the map does not support resolves to undefined', () => {
    expect(matchBcp47TagToPublicContentLanguage('ko-KR', ['ja', 'en'], 'en')).toBeUndefined();
  });
});

describe('matchBrowserLanguages', () => {
  it('tries each tag in order and returns the first supported match', () => {
    expect(matchBrowserLanguages(['de-DE', 'ko-KR', 'en-US'], ALL_LANGUAGES, 'en')).toBe('ko');
  });

  it('returns undefined when nothing in the list matches', () => {
    expect(matchBrowserLanguages(['de-DE', 'it-IT'], ALL_LANGUAGES, 'en')).toBeUndefined();
  });
});

describe('resolveExplicitLangParam — §12', () => {
  it('accepts an explicit, registry-valid, supported code', () => {
    expect(resolveExplicitLangParam('ja', ALL_LANGUAGES)).toBe('ja');
    expect(resolveExplicitLangParam('zh-CN', ALL_LANGUAGES)).toBe('zh-CN');
  });

  it('rejects an unrecognized code without throwing', () => {
    expect(resolveExplicitLangParam('xx', ALL_LANGUAGES)).toBeUndefined();
    expect(resolveExplicitLangParam('de', ALL_LANGUAGES)).toBeUndefined();
  });

  it('rejects a registry-valid code the map does not currently support', () => {
    expect(resolveExplicitLangParam('fr', ['ja', 'en'])).toBeUndefined();
  });

  it('treats a missing/empty param as absent', () => {
    expect(resolveExplicitLangParam(undefined, ALL_LANGUAGES)).toBeUndefined();
    expect(resolveExplicitLangParam(null, ALL_LANGUAGES)).toBeUndefined();
    expect(resolveExplicitLangParam('', ALL_LANGUAGES)).toBeUndefined();
  });
});

describe('resolveInitialLanguage — full §12 precedence', () => {
  it('an explicit valid+supported ?lang wins over everything else', () => {
    expect(
      resolveInitialLanguage({
        langParam: 'fr',
        browserLanguages: ['ja-JP'],
        supportedLanguages: ALL_LANGUAGES,
        defaultLanguage: 'en',
      }),
    ).toBe('fr');
  });

  it('falls back to a supported browser-preferred language when ?lang is absent/invalid', () => {
    expect(
      resolveInitialLanguage({
        langParam: undefined,
        browserLanguages: ['ko-KR'],
        supportedLanguages: ALL_LANGUAGES,
        defaultLanguage: 'en',
      }),
    ).toBe('ko');

    expect(
      resolveInitialLanguage({
        langParam: 'de',
        browserLanguages: ['ko-KR'],
        supportedLanguages: ALL_LANGUAGES,
        defaultLanguage: 'en',
      }),
    ).toBe('ko');
  });

  it('falls back to the publication default when neither ?lang nor the browser match', () => {
    expect(
      resolveInitialLanguage({
        langParam: 'de',
        browserLanguages: ['it-IT'],
        supportedLanguages: ALL_LANGUAGES,
        defaultLanguage: 'en',
      }),
    ).toBe('en');
  });

  it('never crashes on an unsupported ?lang=de and safely falls back', () => {
    expect(() =>
      resolveInitialLanguage({ langParam: 'de', supportedLanguages: ALL_LANGUAGES, defaultLanguage: 'ja' }),
    ).not.toThrow();
    expect(resolveInitialLanguage({ langParam: 'de', supportedLanguages: ALL_LANGUAGES, defaultLanguage: 'ja' })).toBe('ja');
  });

  it('always returns a real supported language even with no browserLanguages given', () => {
    expect(resolveInitialLanguage({ supportedLanguages: ALL_LANGUAGES, defaultLanguage: 'ja' })).toBe('ja');
  });
});

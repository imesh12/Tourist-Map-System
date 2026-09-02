import { isPublicContentLanguage, type PublicContentLanguage } from 'shared-types';

/**
 * Checkpoint 1B.17B §12/§13 — the tourist public-content language selection
 * logic. Every function here is PURE (no `Intl`, no browser API, no
 * randomness/time dependency) and deterministic, so the exact same inputs
 * always produce the exact same output regardless of where they run — this
 * is what lets a single call resolve identically during server-side
 * rendering (using the request's own `Accept-Language` header, read by
 * `app/maps/[mapId]/page.tsx` via `next/headers`) and, if ever needed again,
 * client-side, with zero risk of a post-hydration flash/mismatch (§12: "must
 * not crash, must not expose internal errors").
 *
 * §12's explicit requirement — "avoid heavy Intl dependency if unnecessary"
 * — is met by hand-parsing BCP-47 tags with a plain `split('-')` rather than
 * `Intl.Locale`, which is more than this checkpoint's matching rules need.
 *
 * IMPORTANT (§12): this module never reads the live map DRAFT's
 * `enabledLanguages` — every function below takes `supportedLanguages` as a
 * plain parameter, always sourced by the caller from the immutable
 * PUBLICATION snapshot's own `supportedLanguages` field, never from
 * `TouristMap.enabledLanguages` directly.
 */

/**
 * Parses an HTTP `Accept-Language` header value into an ordered list of bare
 * language tags, highest-quality first — `'ja,en-US;q=0.9,fr;q=0.5'` →
 * `['ja', 'en-US', 'fr']`. Malformed/empty entries are simply skipped, never
 * thrown — a browser's own header is not fully within this app's control,
 * and a parse failure here must never crash the page (§12).
 */
export function parseAcceptLanguageHeader(headerValue: string | null | undefined): readonly string[] {
  if (!headerValue) {
    return [];
  }

  const entries: { readonly tag: string; readonly quality: number }[] = [];
  for (const part of headerValue.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const [rawTag, ...params] = trimmed.split(';');
    const tag = rawTag?.trim();
    if (!tag || tag === '*') {
      continue;
    }
    let quality = 1;
    for (const param of params) {
      const [key, value] = param.split('=').map((piece) => piece.trim());
      if (key === 'q' && value !== undefined) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          quality = parsed;
        }
      }
    }
    entries.push({ tag, quality });
  }

  // Stable sort by quality descending — `Array.prototype.sort` is a stable
  // sort in every JS engine this project targets, so tags of equal quality
  // keep the header's own original relative order.
  return entries.sort((a, b) => b.quality - a.quality).map((entry) => entry.tag);
}

type ChineseVariantMatch = 'zh-CN' | 'zh-TW' | 'zh-generic';

/** §13's explicit Chinese-region mapping: `CN`/`SG` → Simplified, `TW`/`HK`/`MO` → Traditional, anything else (including no region at all) → "generic" Chinese, resolved by `resolveChineseLanguage()` below. */
function classifyChineseTag(lowerCaseTag: string): ChineseVariantMatch {
  const region = lowerCaseTag.split('-')[1];
  if (region === 'cn' || region === 'sg') {
    return 'zh-CN';
  }
  if (region === 'tw' || region === 'hk' || region === 'mo') {
    return 'zh-TW';
  }
  return 'zh-generic';
}

/**
 * §13's "plain zh" rule: prefer the map's own PUBLICATION `defaultLanguage`
 * if it is itself a supported Chinese variant; otherwise fall back to
 * whichever Chinese variant is supported, in a fixed, deterministic order
 * (Simplified before Traditional — matching `PUBLIC_CONTENT_LANGUAGE_CODES`'s
 * own registry declaration order, shared-types/src/language.ts); otherwise
 * no Chinese match at all.
 */
function resolveGenericChinese(
  supportedLanguages: readonly PublicContentLanguage[],
  defaultLanguage: PublicContentLanguage,
): PublicContentLanguage | undefined {
  if ((defaultLanguage === 'zh-CN' || defaultLanguage === 'zh-TW') && supportedLanguages.includes(defaultLanguage)) {
    return defaultLanguage;
  }
  if (supportedLanguages.includes('zh-CN')) {
    return 'zh-CN';
  }
  if (supportedLanguages.includes('zh-TW')) {
    return 'zh-TW';
  }
  return undefined;
}

/**
 * Matches ONE BCP-47 tag (`'ja-JP'`, `'en-US'`, `'zh-CN'`, `'zh'`, ...)
 * against the registry, honoring §13's exact examples: `ja-JP`→`ja`,
 * `en-US`→`en`, `ko-KR`→`ko`, `fr-FR`→`fr`, plus the Chinese-specific rules
 * above. Returns `undefined` when the tag matches nothing supported —
 * callers try the next tag in preference order (`matchBrowserLanguages`).
 */
export function matchBcp47TagToPublicContentLanguage(
  tag: string,
  supportedLanguages: readonly PublicContentLanguage[],
  defaultLanguage: PublicContentLanguage,
): PublicContentLanguage | undefined {
  const lower = tag.trim().toLowerCase();
  if (!lower) {
    return undefined;
  }
  const primary = lower.split('-')[0];

  if (primary === 'zh') {
    const variant = classifyChineseTag(lower);
    if (variant === 'zh-CN' && supportedLanguages.includes('zh-CN')) {
      return 'zh-CN';
    }
    if (variant === 'zh-TW' && supportedLanguages.includes('zh-TW')) {
      return 'zh-TW';
    }
    // A recognized-but-unsupported specific region (e.g. `zh-CN` on a map
    // that only supports `zh-TW`), or no region at all — both fall back to
    // the same deterministic "generic Chinese" resolution.
    return resolveGenericChinese(supportedLanguages, defaultLanguage);
  }

  // Every non-Chinese registry code IS its own bare primary subtag (`ja`,
  // `en`, `ko`, `fr`, `es`) — see `PUBLIC_CONTENT_LANGUAGE_CODES`
  // (shared-types/src/language.ts) — so a region-stripped comparison is all
  // that's needed here.
  if (primary && isPublicContentLanguage(primary) && supportedLanguages.includes(primary)) {
    return primary;
  }
  return undefined;
}

/** Tries each browser-preferred tag, in order, returning the first that resolves to a supported language — `undefined` if none do. */
export function matchBrowserLanguages(
  browserLanguages: readonly string[],
  supportedLanguages: readonly PublicContentLanguage[],
  defaultLanguage: PublicContentLanguage,
): PublicContentLanguage | undefined {
  for (const tag of browserLanguages) {
    const match = matchBcp47TagToPublicContentLanguage(tag, supportedLanguages, defaultLanguage);
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * §12 — validates an explicit `?lang=` URL param. A value that isn't a real
 * registry code, or is a real registry code the map's publication doesn't
 * currently support, both resolve to `undefined` (never thrown) — the
 * caller falls through to the next resolution step.
 */
export function resolveExplicitLangParam(
  langParam: string | null | undefined,
  supportedLanguages: readonly PublicContentLanguage[],
): PublicContentLanguage | undefined {
  if (!langParam) {
    return undefined;
  }
  return isPublicContentLanguage(langParam) && supportedLanguages.includes(langParam) ? langParam : undefined;
}

export interface ResolveInitialLanguageInput {
  readonly langParam?: string | null;
  readonly browserLanguages?: readonly string[];
  readonly supportedLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
}

/**
 * §12's full resolution order, in one place: (1) an explicit, valid,
 * supported `?lang=`; (2) the visitor's browser-preferred language, if
 * supported; (3) the publication's own `defaultLanguage`. Always returns a
 * real, supported `PublicContentLanguage` — never `undefined`, never throws.
 */
export function resolveInitialLanguage(input: ResolveInitialLanguageInput): PublicContentLanguage {
  const { langParam, browserLanguages, supportedLanguages, defaultLanguage } = input;

  const explicit = resolveExplicitLangParam(langParam, supportedLanguages);
  if (explicit) {
    return explicit;
  }

  const browserMatch = browserLanguages ? matchBrowserLanguages(browserLanguages, supportedLanguages, defaultLanguage) : undefined;
  if (browserMatch) {
    return browserMatch;
  }

  return defaultLanguage;
}

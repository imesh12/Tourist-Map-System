/**
 * The public-content language registry — checkpoint 1B.17A "Multilingual
 * Data Foundation". See docs/architecture (if/when a dedicated doc is
 * added) — this file is the single source of truth for `PublicContentLanguage`,
 * mirroring `PUBLIC_FEATURE_REGISTRY` (./public-feature.js) and
 * `PLATFORM_CATEGORY_REGISTRY` (./platform-category.js)'s exact shape: a
 * small, code-owned, closed catalog — not a Super-Admin-managed collection,
 * not arbitrary browser-supplied locale strings.
 *
 * TWO SEPARATE LANGUAGE CONCEPTS — do not conflate them:
 *
 * 1. Admin application UI language — Japanese/English ONLY, not modeled by
 *    this file at all. No admin-web localization framework exists yet (out
 *    of scope for this checkpoint); when it is built, it must NOT reuse
 *    `PublicContentLanguage` — an admin operator's own UI language and the
 *    set of languages a *map's public content* is translated into are
 *    independent questions with independent answers (a Japan-based Client
 *    Admin using an English admin UI might still publish a map in
 *    Japanese/English/Korean, for example).
 * 2. Public Tourist Map content language — THIS file. Each map configures
 *    its own `defaultLanguage`/`enabledLanguages` (see `TouristMap`,
 *    ./map.js) from this registry, and translatable content
 *    (`Category.name`, `Poi.name`/`description`, `Page.title`/`content`,
 *    `MenuItem.label`) may carry a `translations` bag keyed by these same
 *    codes (see `LocalizedText` below).
 *
 * BCP-47-compatible codes, matching real-world locale identifiers a future
 * `Intl`/`next-intl`-style consumer could use directly (`zh-CN`/`zh-TW`, not
 * an underscore-joined `ZH_CN`) — deliberately NOT the pre-existing
 * `Language`/`LANGUAGES` enum (./enums.js), which predates any actual
 * multilingual content model (Phase 1A, before Categories/POIs/Pages/
 * Publication existed) and uses non-BCP-47, all-caps, underscore-style codes
 * (`EN`/`JA`/`ZH_CN`/`KO`). That legacy enum is left untouched (still
 * exported, still valid TypeScript) in case anything unforeseen still
 * imports it, but `TouristMap.defaultLanguage`/`enabledLanguages` (the only
 * two things that ever actually used it) now point at `PublicContentLanguage`
 * instead — see `normalizeLegacyPublicContentLanguageCode()` below for how a
 * map document stored with the old codes keeps parsing safely.
 *
 * Extending the registry later (adding a new supported public language)
 * never requires a Firestore migration or a change to `LocalizedText`'s own
 * shape — `LocalizedText` is a `Partial<Record<PublicContentLanguage, string>>`,
 * so existing stored translation maps simply never populate a not-yet-added
 * key; adding one only widens what a *future* write may include.
 */

export const PUBLIC_CONTENT_LANGUAGE_CODES = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'es'] as const;
export type PublicContentLanguage = (typeof PUBLIC_CONTENT_LANGUAGE_CODES)[number];

export interface PublicContentLanguageRegistryEntry {
  readonly code: PublicContentLanguage;
  /** The language's own name, in English — for a future Admin selector UI (still English-only per this checkpoint's own Admin-UI-language product requirement). */
  readonly englishLabel: string;
  /** The language's own name, written in itself — for a future public tourist-facing language selector (1B.17B). */
  readonly nativeLabel: string;
}

export const PUBLIC_CONTENT_LANGUAGE_REGISTRY: Readonly<Record<PublicContentLanguage, PublicContentLanguageRegistryEntry>> = {
  ja: { code: 'ja', englishLabel: 'Japanese', nativeLabel: '日本語' },
  en: { code: 'en', englishLabel: 'English', nativeLabel: 'English' },
  'zh-CN': { code: 'zh-CN', englishLabel: 'Simplified Chinese', nativeLabel: '简体中文' },
  'zh-TW': { code: 'zh-TW', englishLabel: 'Traditional Chinese', nativeLabel: '繁體中文' },
  ko: { code: 'ko', englishLabel: 'Korean', nativeLabel: '한국어' },
  fr: { code: 'fr', englishLabel: 'French', nativeLabel: 'Français' },
  es: { code: 'es', englishLabel: 'Spanish', nativeLabel: 'Español' },
};

/**
 * The go-forward canonical default — used both (a) as the value a brand-new
 * map is created with (`POST /api/maps`, `registerClient`'s provisioning),
 * and (b) as the safe fallback a legacy map/publication document is
 * normalized to if it somehow lacked a resolvable language value.
 *
 * Deliberately `'en'`, NOT `'ja'` (this checkpoint's own suggested default) —
 * documented deviation, per this checkpoint's own "if existing fixtures
 * clearly imply another safe default, document that before using it"
 * instruction: EVERY map this codebase has ever created (`POST /api/maps`,
 * `registerClient` provisioning, the E2E tenant fixture) has always
 * hardcoded `defaultLanguage: 'EN'` since Phase 1A — there is no existing
 * data or fixture anywhere in this repository that assumes a Japanese
 * default. `'en'` is the value that keeps every current map's *effective*
 * default language unchanged after this checkpoint's normalization runs.
 */
export const DEFAULT_PUBLIC_CONTENT_LANGUAGE: PublicContentLanguage = 'en';

/** Safe lookup by an untrusted/arbitrary string — returns `undefined` rather than throwing for any value not in the registry, mirroring `getPublicFeatureRegistryEntry()`/`getPlatformCategoryRegistryEntry()`. */
export function getPublicContentLanguageRegistryEntry(code: string): PublicContentLanguageRegistryEntry | undefined {
  return (PUBLIC_CONTENT_LANGUAGE_REGISTRY as Readonly<Record<string, PublicContentLanguageRegistryEntry | undefined>>)[code];
}

/** Every registered public content language, in the registry's own deterministic declaration order — what a future Admin/public language selector iterates over (mirrors `listReleasedFeatures()`). */
export function listPublicContentLanguages(): readonly PublicContentLanguageRegistryEntry[] {
  return PUBLIC_CONTENT_LANGUAGE_CODES.map((code) => PUBLIC_CONTENT_LANGUAGE_REGISTRY[code]);
}

export function isPublicContentLanguage(value: string): value is PublicContentLanguage {
  return Object.prototype.hasOwnProperty.call(PUBLIC_CONTENT_LANGUAGE_REGISTRY, value);
}

/**
 * Maps a PRE-1B.17A `Language` (./enums.js) code to its `PublicContentLanguage`
 * equivalent — `EN`→`en`, `JA`→`ja`, `ZH_CN`→`zh-CN`, `KO`→`ko`. This is the
 * entire backward-compatibility surface `TouristMap.defaultLanguage`/
 * `enabledLanguages` needs: every map document in this system has ALWAYS had
 * these two fields populated (they are, and always have been, required —
 * never optional/absent — on `TouristMap`), so the only compatibility
 * concern is the VALUE FORMAT, not the field's presence. `packages/validation`'s
 * `legacyPublicContentLanguageInputSchema` is the parsing-boundary consumer
 * of this map.
 */
const LEGACY_LANGUAGE_CODE_MAP: Readonly<Record<string, PublicContentLanguage>> = {
  EN: 'en',
  JA: 'ja',
  ZH_CN: 'zh-CN',
  KO: 'ko',
};

/**
 * Normalizes an arbitrary stored/input string into a `PublicContentLanguage`
 * — accepting either a current registry code (returned as-is) or one of the
 * four pre-1B.17A legacy codes (mapped via `LEGACY_LANGUAGE_CODE_MAP`).
 * Returns `undefined` for anything else (an unregistered/malformed code),
 * never throwing — the caller (a zod `.preprocess()` step) is responsible
 * for turning `undefined` into a real validation failure.
 */
export function normalizeLegacyPublicContentLanguageCode(value: string): PublicContentLanguage | undefined {
  if (isPublicContentLanguage(value)) {
    return value;
  }
  return LEGACY_LANGUAGE_CODE_MAP[value];
}

/**
 * A reusable localized-content value — checkpoint 1B.17A §4. `Partial` (not
 * every registered language required) is the entire point: a translation
 * that hasn't been written yet is simply an ABSENT key, cleanly distinct
 * from an explicit empty string (which `packages/validation`'s
 * `localizedTextSchema()` rejects as invalid — see that function's own doc
 * comment for why "present but empty" and "absent" must not be conflated).
 *
 * Reused verbatim by every translatable content domain this checkpoint
 * prepares (`Category.translations`, `Poi.translations`, `Page.translations`,
 * `MenuItem` variants' `translations` — see each of those files' own small
 * `*Translations` interface, which is just `LocalizedText` per translatable
 * field) rather than each domain inventing its own map type.
 */
export type LocalizedText = Partial<Record<PublicContentLanguage, string>>;

/**
 * The single shared fallback-resolution algorithm — checkpoint 1B.17A §7. A
 * PURE function (no Firestore, no React, no I/O) so it can be unit-tested
 * exhaustively and reused identically everywhere resolved content is needed
 * (a future tourist-web language selector, 1B.17B's translation-completeness
 * UX, and this checkpoint's own "existing tourist behavior continues using
 * resolved/default content" requirement — §11) — never re-implemented ad hoc
 * inside a React component or route handler.
 *
 * Resolution order, deterministic at every step:
 *
 * 1. `translations[requestedLanguage]`, if present.
 * 2. `translations[defaultLanguage]` (the map's own configured default
 *    public content language), if present. This is what makes the
 *    checkpoint's own worked example resolve the way it does: requested
 *    `'ko'`, default `'ja'`, `translations = { ja: '東京タワー', en: 'Tokyo Tower' }`
 *    (no `ko` entry) → resolves to `'東京タワー'`, the DEFAULT language's
 *    translation, not the English one — "map default" outranks "some other
 *    translation that happens to exist."
 * 3. `legacyValue` (the entity's existing single-language scalar field —
 *    `Category.name`, `Poi.name`, `Page.title`, `MenuItem.label`, etc.), if
 *    it is a non-empty string. This is what keeps every pre-1B.17A
 *    document's content resolving to exactly what it always rendered as,
 *    the moment neither of the two translation lookups above found
 *    anything.
 * 4. Any remaining entry in `translations`, chosen by the registry's own
 *    fixed declaration order (`PUBLIC_CONTENT_LANGUAGE_CODES`) — a
 *    deterministic, reproducible choice ("using an available translation
 *    deterministically, not unpredictable" — §7), never an arbitrary
 *    `Object.keys()` iteration order or a random pick. Reached only when
 *    steps 1–3 all missed (no requested/default translation AND no legacy
 *    value) but at least one OTHER language was translated.
 * 5. `''` — the final, safe, always-terminating fallback, for the
 *    (`translations` empty/absent) AND (`legacyValue` empty/absent) case —
 *    e.g. an optional field, like `Poi.description`, that was never filled
 *    in at all. Never `undefined`, never throws: every caller gets a plain
 *    `string` back unconditionally.
 */
export interface ResolveLocalizedTextInput {
  readonly requestedLanguage: PublicContentLanguage;
  readonly defaultLanguage: PublicContentLanguage;
  readonly translations?: LocalizedText;
  /** The entity's existing single-language scalar value, e.g. `Category.name` — `undefined`/`''` are treated identically (both "no legacy value"). */
  readonly legacyValue?: string;
}

export function resolveLocalizedText(input: ResolveLocalizedTextInput): string {
  const { requestedLanguage, defaultLanguage, translations, legacyValue } = input;

  if (translations) {
    const requested = translations[requestedLanguage];
    if (requested !== undefined) {
      return requested;
    }

    const fallbackToDefault = translations[defaultLanguage];
    if (fallbackToDefault !== undefined) {
      return fallbackToDefault;
    }
  }

  if (legacyValue) {
    return legacyValue;
  }

  if (translations) {
    for (const code of PUBLIC_CONTENT_LANGUAGE_CODES) {
      const value = translations[code];
      if (value !== undefined) {
        return value;
      }
    }
  }

  return '';
}

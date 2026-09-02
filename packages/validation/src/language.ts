import { z } from 'zod';
import { PUBLIC_CONTENT_LANGUAGE_CODES, normalizeLegacyPublicContentLanguageCode } from 'shared-types';

/**
 * checkpoint 1B.17A "Multilingual Data Foundation" — validation for the
 * public-content language registry (`PublicContentLanguage`, shared-types/
 * src/language.ts) and the reusable `LocalizedText` value model. Mirrors
 * this package's own established conventions: a closed `z.enum` over a
 * shared-types `readonly [...] as const` array (exactly like
 * `categoryIconSchema`/`menuItemFeatureKeySchema`), never a bare
 * `z.string()` accepting arbitrary browser-supplied codes.
 */

/** A CURRENT (post-1B.17A) public content language code only — rejects any pre-1B.17A legacy code (`EN`/`JA`/`ZH_CN`/`KO`) outright. Use this for anything that never needs to read old-format data (new-only input schemas); use `legacyPublicContentLanguageInputSchema` below for anything that reads `TouristMap.defaultLanguage`/`enabledLanguages`, which has always existed and may still be stored in the old format. */
export const publicContentLanguageSchema = z.enum(PUBLIC_CONTENT_LANGUAGE_CODES);

/**
 * Backward-compatible input for `TouristMap.defaultLanguage`/`enabledLanguages`
 * specifically — every map document in this system has always had these two
 * fields populated (they are, and always have been, required on
 * `TouristMap`; see that interface's own doc comment), so the only
 * compatibility concern is the VALUE FORMAT: a map document written before
 * this checkpoint stores the pre-1B.17A `Language` codes (`EN`/`JA`/`ZH_CN`/`KO`,
 * shared-types/src/enums.ts). `z.preprocess()` normalizes a legacy code to
 * its current equivalent (`normalizeLegacyPublicContentLanguageCode()`)
 * BEFORE the real `publicContentLanguageSchema` enum check runs, so both a
 * legacy-shaped and a canonical-shaped stored value parse to the exact same
 * `PublicContentLanguage` output — nothing downstream of parsing ever needs
 * to know the old format existed. An already-current code, or anything that
 * normalizes to `undefined` (a genuinely unrecognized string), passes
 * through unchanged to the enum check, which is what actually rejects it.
 */
export const legacyPublicContentLanguageInputSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return normalizeLegacyPublicContentLanguageCode(value) ?? value;
}, publicContentLanguageSchema);

const MAX_SUPPORTED_LANGUAGES = PUBLIC_CONTENT_LANGUAGE_CODES.length;

/**
 * `TouristMap.enabledLanguages` — checkpoint 1B.17A §3. At least one
 * language, no duplicates (compared on the NORMALIZED/current-format value,
 * so a legacy payload that somehow listed both `'EN'` and `'en'` is still
 * caught), and bounded by the registry's own size (a deterministic, always-
 * correct upper bound that never needs updating by hand when the registry
 * grows — `MAX_SUPPORTED_LANGUAGES` is derived from
 * `PUBLIC_CONTENT_LANGUAGE_CODES.length`, not a hardcoded number).
 */
export const supportedPublicContentLanguagesSchema = z
  .array(legacyPublicContentLanguageInputSchema)
  .min(1, { message: 'At least one supported language is required' })
  .max(MAX_SUPPORTED_LANGUAGES, { message: `At most ${MAX_SUPPORTED_LANGUAGES} supported languages are allowed` })
  .refine((languages) => new Set(languages).size === languages.length, {
    message: 'supportedLanguages must not contain duplicates',
  });

/**
 * A reusable, atomic "default + supported" language configuration schema —
 * checkpoint 1B.17A §3/§8. Used both by `mapSchema` (the full stored
 * document) and `mapSettingsUpdateSchema` (the untrusted Map Settings PATCH
 * input, as a single optional `languages` field — see that schema's own doc
 * comment for why default+supported are always sent TOGETHER, atomically,
 * never as two independently-optional top-level fields: this is what makes
 * "default must always be supported" fully checkable by the schema alone,
 * with no dependency on already-stored state the schema itself can't see).
 */
export const mapLanguageConfigSchema = z
  .object({
    defaultLanguage: legacyPublicContentLanguageInputSchema,
    supportedLanguages: supportedPublicContentLanguagesSchema,
  })
  // `.strict()` BEFORE `.refine()` — same rule `menu-item.ts`'s own doc
  // comment documents at length (Repair Round 1, checkpoint 1B.6): zod's
  // default object mode silently STRIPS unknown keys rather than rejecting
  // them, and `.refine()` returns a `ZodEffects` that no longer exposes
  // `.strict()` at all, so it must be applied here, on the plain object,
  // first. Without it, an injected ownership field (`mapId`) nested under
  // `languages` would be silently dropped rather than rejected.
  .strict()
  .refine((config) => config.supportedLanguages.includes(config.defaultLanguage), {
    message: 'supportedLanguages must include defaultLanguage',
    path: ['supportedLanguages'],
  });
export type MapLanguageConfig = z.infer<typeof mapLanguageConfigSchema>;

/**
 * `LocalizedText` (shared-types) validation — checkpoint 1B.17A §4/§13. A
 * factory (not one shared instance) so every translatable field keeps its
 * OWN existing scalar field's length bound (§13: "preserve existing field
 * length constraints") — e.g. `localizedTextSchema(PAGE_TITLE_MAX_LENGTH)`
 * for `Page.translations.title`, matching `pageTitleSchema`'s own bound
 * exactly, rather than one shared arbitrary limit.
 *
 * `z.record(publicContentLanguageSchema, valueSchema)` — zod validates
 * every KEY of the input object against `publicContentLanguageSchema`
 * itself, so an unrecognized language key is rejected at parse time (§13:
 * "unknown language keys" → rejected), not merely stripped. Deliberately
 * `publicContentLanguageSchema` (current codes only) here, NOT the
 * legacy-normalizing variant — a `translations` map is a NEW concept with no
 * pre-1B.17A stored shape to be backward compatible with, so there is
 * nothing to normalize.
 *
 * Each present value is `z.string().trim().min(1).max(maxLength)` — trimmed
 * (§13: "trimming"), and `min(1)` on the TRIMMED string is what makes an
 * explicit empty (or whitespace-only) string a VALIDATION FAILURE rather
 * than silently accepted — §4's "distinguish missing translation from empty
 * invalid content" requirement: a language simply absent from the object is
 * "not translated yet" (valid, `LocalizedText` is `Partial`), while a
 * language present with an empty value is malformed input, not a
 * placeholder — a future translation editor (1B.17B) must send `null`/omit
 * the key entirely to represent "not translated", never `''`.
 */
export function localizedTextSchema(maxLength: number) {
  return z.record(publicContentLanguageSchema, z.string().trim().min(1).max(maxLength));
}
export type LocalizedTextParsed = z.infer<ReturnType<typeof localizedTextSchema>>;

import { z } from 'zod';
import { CATEGORY_ICONS, DEFAULT_PUBLIC_CONTENT_LANGUAGE, PUBLISHED_POI_PRICE_LEVELS } from 'shared-types';
import { mapBrandingSchema } from './branding.js';
import { categoryTranslationsSchema } from './category.js';
import {
  categoryIdSchema,
  customerIdSchema,
  liveCameraIdSchema,
  mapIdSchema,
  pageIdSchema,
  poiIdSchema,
  publicationIdSchema,
  uidSchema,
} from './ids.js';
import { legacyPublicContentLanguageInputSchema, publicContentLanguageSchema, supportedPublicContentLanguagesSchema } from './language.js';
import { latitudeSchema, longitudeSchema, mapAreaSchema, mapProviderConfigSchema } from './map.js';
import { mapThemeSchema } from './map-theme.js';
import { menuItemTranslationsSchema } from './menu-item.js';
import { pageTranslationsSchema } from './page.js';
import { liveCameraLocationSchema, liveCameraPlaybackSchema, liveCameraTranslationsSchema } from './live-camera.js';
import { poiProviderPlaceIdSchema, poiProviderSchema, poiTranslationsSchema } from './poi.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * Defense-in-depth validation for a stored `maps/{mapId}/publications/{publicationId}`
 * snapshot document — checkpoint 1B.8, mirrors `mapSchema`/`categorySchema`/
 * `poiSchema`'s identical role for their own collections. Every field here
 * matches shared-types' `MapPublicationSnapshot` exactly (see that file's
 * own doc comment for why every id field is a plain, format-validated
 * string rather than the branded alias).
 *
 * `mapId`/`categoryId`/`featureKey` inside `menu`/`categories`/`pois` are
 * intentionally NOT re-checked for cross-referential consistency here (e.g.
 * "does every POI's `categoryId` actually appear in `categories`") — that
 * invariant is enforced once, at BUILD time, by
 * `buildPublicationContent()` (apps/admin-web/lib/tenant/build-publication-snapshot.ts),
 * which is the only code path that ever constructs a publication document.
 * This schema's job is shape validation for anything that READS a stored
 * snapshot back (the public read endpoint), the same "trust the writer,
 * still validate the shape on every read" posture every other `*Schema` in
 * this package already takes.
 */

// checkpoint 1B.17A — every `translations` field below is optional and
// backward compatible: a publication written before this checkpoint has
// none of them, and parses exactly as it always has (see
// `mapPublicationSnapshotSchema`'s own `defaultLanguage`/`supportedLanguages`
// doc comment for the analogous top-level-field story). Reused directly from
// each domain's own file (`category.ts`/`poi.ts`/`page.ts`/`menu-item.ts`)
// rather than redeclared here, so a translated field's bound can never drift
// between the admin-facing stored schema and this public-facing published
// schema — both are literally the same schema value.
const publicationMenuItemSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('CATEGORY'),
      label: z.string().trim().min(1),
      icon: z.enum(CATEGORY_ICONS),
      categoryId: categoryIdSchema,
      translations: menuItemTranslationsSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('FEATURE'),
      label: z.string().trim().min(1),
      icon: z.enum(CATEGORY_ICONS),
      featureKey: z.string().trim().min(1),
      translations: menuItemTranslationsSchema.optional(),
    })
    .strict(),
  // checkpoint 1B.11.
  z
    .object({
      type: z.literal('PAGE'),
      label: z.string().trim().min(1),
      icon: z.enum(CATEGORY_ICONS),
      pageId: pageIdSchema,
      translations: menuItemTranslationsSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('LIVE_CAMERAS'),
      label: z.string().trim().min(1),
      icon: z.enum(CATEGORY_ICONS),
      translations: menuItemTranslationsSchema.optional(),
    })
    .strict(),
]);

const publishedCategorySchema = z
  .object({
    categoryId: categoryIdSchema,
    name: z.string().trim().min(1),
    icon: z.enum(CATEGORY_ICONS),
    translations: categoryTranslationsSchema.optional(),
  })
  .strict();

/** checkpoint 1B.11 — mirrors `publishedCategorySchema`'s role for `PublishedPage`. */
const publishedPageSchema = z
  .object({
    pageId: pageIdSchema,
    title: z.string().trim().min(1),
    content: z.string().trim().min(1),
    translations: pageTranslationsSchema.optional(),
  })
  .strict();

/**
 * LIVE CAMERAS FOUNDATION checkpoint — mirrors `publishedPageSchema`'s role
 * for `PublishedLiveCamera`. `playback` is OPTIONAL (MANDATORY
 * ARCHITECTURE CORRECTION 1 — a published camera with no playback
 * configuration is valid); when present it is validated by the SAME
 * `liveCameraPlaybackSchema` the draft document uses (already public-safe
 * by construction, so no separate narrower published variant is needed).
 */
const publishedLiveCameraSchema = z
  .object({
    cameraId: liveCameraIdSchema,
    name: z.string().trim().min(1),
    translations: liveCameraTranslationsSchema.optional(),
    description: z.string().optional(),
    location: liveCameraLocationSchema,
    playback: liveCameraPlaybackSchema.optional(),
  })
  .strict();

/** Photo Experience Prototype checkpoint — mirrors shared-types' `PublishedPoiPhoto` exactly: a presence flag only, never a photo reference. */
const publishedPoiPhotoSchema = z
  .object({
    available: z.literal(true),
  })
  .strict();

/** Photo Experience Prototype checkpoint (rich-detail expansion) — mirrors shared-types' `PublishedPoiOpeningPeriod`. `day` 0–6, `hour` 0–23, `minute` 0–59; `close` absent for a 24 h day. */
const publishedPoiOpeningPeriodSchema = z
  .object({
    open: z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict(),
    close: z
      .object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) })
      .strict()
      .optional(),
  })
  .strict();

/** Photo Experience Prototype checkpoint (rich-detail expansion) — mirrors shared-types' `PublishedPoiPlace`. Every field optional; `.strict()` still rejects any Google field this checkpoint did not deliberately opt into (e.g. review text, `providerPlaceId`). */
const publishedPoiPlaceSchema = z
  .object({
    rating: z.number().min(0).max(5).optional(),
    userRatingCount: z.number().int().min(0).optional(),
    priceLevel: z.enum(PUBLISHED_POI_PRICE_LEVELS).optional(),
    priceLevelDisplay: z.string().trim().min(1).max(16).optional(),
    primaryTypeDisplayName: z.string().trim().min(1).max(120).optional(),
    openingHours: z
      .object({
        periods: z.array(publishedPoiOpeningPeriodSchema),
        weekdayDescriptions: z.array(z.string()),
      })
      .strict()
      .optional(),
    utcOffsetMinutes: z.number().int().min(-720).max(840).optional(),
    websiteUri: z.string().trim().url().max(2048).optional(),
    nationalPhoneNumber: z.string().trim().min(1).max(64).optional(),
    dineIn: z.boolean().optional(),
    takeout: z.boolean().optional(),
    delivery: z.boolean().optional(),
  })
  .strict();

const publishedPoiSchema = z
  .object({
    poiId: poiIdSchema,
    categoryId: categoryIdSchema,
    name: z.string().trim().min(1),
    location: z.object({ latitude: latitudeSchema, longitude: longitudeSchema }),
    address: z.string().optional(),
    description: z.string().optional(),
    translations: poiTranslationsSchema.optional(),
    photo: publishedPoiPhotoSchema.optional(),
    place: publishedPoiPlaceSchema.optional(),
  })
  .strict();

const publishedMapSummarySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mapProvider: mapProviderConfigSchema,
    area: mapAreaSchema,
    branding: mapBrandingSchema.optional(),
    theme: mapThemeSchema,
  })
  .strict();

/** Photo Experience Prototype checkpoint — mirrors shared-types' `PublishedPoiPhotoProviderRef`. Server-only; see that type's own doc comment (packages/shared-types/src/publication.ts) for why this never reaches `publicMapSnapshotSchema` below. */
const publishedPoiPhotoProviderRefSchema = z
  .object({
    provider: poiProviderSchema,
    providerPlaceId: poiProviderPlaceIdSchema,
  })
  .strict();

export const mapPublicationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    publicationId: publicationIdSchema,
    mapId: mapIdSchema,
    customerId: customerIdSchema,
    version: z.number().int().min(1),
    publishedAt: firestoreTimestampLikeSchema,
    publishedByUid: uidSchema,
    map: publishedMapSummarySchema,
    // checkpoint 1B.17A regression-safe addition, mirrors the `pages`
    // `.default([])` precedent immediately below: `.default(...)` keeps both
    // fields REQUIRED on the parsed/output type
    // (MapPublicationSnapshotParsed.defaultLanguage/.supportedLanguages are
    // always present, matching shared-types' non-optional
    // `readonly defaultLanguage: PublicContentLanguage` /
    // `readonly supportedLanguages: readonly PublicContentLanguage[]`) while
    // making the KEYS optional on the input side only. A stored publication
    // document written before this checkpoint (no `defaultLanguage`/
    // `supportedLanguages` fields at all — these were never part of the
    // narrow 1B.8 publication projection) still parses successfully and is
    // normalized to the platform default language. `defaultLanguage` also
    // runs through `legacyPublicContentLanguageInputSchema` rather than the
    // bare enum, so a hypothetical legacy-coded value (`'EN'`) normalizes the
    // same way `mapSchema.defaultLanguage` does — belt-and-suspenders, since
    // no publication was ever actually written with the old codes (the field
    // didn't exist yet), but keeps this schema consistent with every other
    // place a public-content-language code is parsed. `supportedLanguages`
    // does NOT need the same legacy-code preprocessing per element for the
    // same reason (field never existed pre-1B.17A), but reuses
    // `publicContentLanguageSchema` (not the legacy-preprocessing variant) to
    // stay a plain, easily-`.default()`-able array schema. This does NOT
    // weaken validation of a *present* value — a malformed or unsupported
    // code still fails parsing exactly as before. `.strict()` is unaffected:
    // it only governs unrecognized top-level keys, not these fields'
    // optionality.
    defaultLanguage: legacyPublicContentLanguageInputSchema.default(DEFAULT_PUBLIC_CONTENT_LANGUAGE),
    supportedLanguages: z.array(publicContentLanguageSchema).min(1).default([DEFAULT_PUBLIC_CONTENT_LANGUAGE]),
    menu: z.array(publicationMenuItemSchema),
    categories: z.array(publishedCategorySchema),
    pois: z.array(publishedPoiSchema),
    // checkpoint 1B.11 regression fix: `.default([])` keeps `pages` REQUIRED
    // on the parsed/output type (MapPublicationSnapshotParsed.pages is
    // always `PublishedPage[]`, never undefined — matching shared-types'
    // non-optional `readonly pages: readonly PublishedPage[]`) while making
    // the KEY optional on the input side only. A stored/legacy publication
    // document written before checkpoint 1B.11 (no `pages` field at all)
    // still parses successfully and is normalized to `pages: []`. This does
    // NOT weaken validation of a *present* `pages` field — an array that is
    // the wrong type, or whose entries fail `publishedPageSchema`, still
    // fails parsing exactly as before. `.strict()` is unaffected: it only
    // governs unrecognized top-level keys, not this field's optionality.
    pages: z.array(publishedPageSchema).default([]),
    // LIVE CAMERAS FOUNDATION checkpoint regression-safe addition, mirrors
    // the `pages` `.default([])` precedent immediately above: `.default(...)`
    // keeps `liveCameras` REQUIRED on the parsed/output type
    // (MapPublicationSnapshotParsed.liveCameras is always
    // `PublishedLiveCamera[]`, never undefined — matching shared-types'
    // non-optional `readonly liveCameras: readonly PublishedLiveCamera[]`)
    // while making the KEY optional on the input side only. A stored
    // publication document written before this checkpoint (no `liveCameras`
    // field at all) still parses successfully and is normalized to
    // `liveCameras: []`. This does NOT weaken validation of a *present*
    // `liveCameras` field — an array that is the wrong type, or whose
    // entries fail `publishedLiveCameraSchema`, still fails parsing exactly
    // as before. `.strict()` is unaffected: it only governs unrecognized
    // top-level keys, not this field's optionality.
    liveCameras: z.array(publishedLiveCameraSchema).default([]),
    // Photo Experience Prototype checkpoint — server-only, optional, no
    // `.default()` (an absent key stays absent on the parsed type, matching
    // shared-types' `readonly photoProviderRefs?: ...` — there is no
    // meaningful "default" for a record keyed by arbitrary POI ids the way
    // there is for `pages`/`supportedLanguages`).
    photoProviderRefs: z.record(z.string(), publishedPoiPhotoProviderRefSchema).optional(),
  })
  .strict();

export type MapPublicationSnapshotParsed = z.infer<typeof mapPublicationSnapshotSchema>;

/**
 * Checkpoint 1B.9 — the schema for what `GET /api/public/maps/{mapId}`
 * actually returns over the wire: the same snapshot shape with
 * `customerId`/`publishedByUid`/`photoProviderRefs` removed, mirroring
 * shared-types'
 * `PublicMapSnapshot = Omit<MapPublicationSnapshot, 'customerId' | 'publishedByUid' | 'photoProviderRefs'>`
 * exactly (see that type's own doc comment, packages/shared-types/src/publication.ts)
 * — derived from `mapPublicationSnapshotSchema` via `.omit()`, never a
 * hand-duplicated second copy of every field. This is what `tourist-web`'s
 * public-map client (apps/tourist-web/lib/public-map/public-map-client.ts)
 * parses an untrusted HTTP response body with before treating any of it as
 * real map data — the same "trust the writer, still validate the shape on
 * every read" posture `mapPublicationSnapshotSchema`'s own doc comment
 * already establishes, now applied at the public/unauthenticated boundary
 * too, where the caller is a separate app over a real network hop rather
 * than a same-process Firestore read.
 */
export const publicMapSnapshotSchema = mapPublicationSnapshotSchema.omit({
  customerId: true,
  publishedByUid: true,
  photoProviderRefs: true,
});

export type PublicMapSnapshotParsed = z.infer<typeof publicMapSnapshotSchema>;

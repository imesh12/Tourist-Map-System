import {
  DEFAULT_MAP_THEME,
  type PublicationMenuItem,
  type PublicContentLanguage,
  type PublishedCategory,
  type PublishedLiveCamera,
  type PublishedMapSummary,
  type PublishedPage,
  type PublishedPoi,
  type PublishedPoiPhotoProviderRef,
  type PublishedPoiPlace,
  type PublishedPoiPriceLevel,
  type PoiProviderLocalization,
} from 'shared-types';
import type { CategoryParsed, LiveCameraParsed, MapParsed, MenuItemParsed, PageParsed, PoiParsed } from 'validation';
import type { ExternalPoiPlaceMetadata } from '@/lib/pois/external-provider';
import { buildPublicMenuProjection } from './menu-projection';

/** `$`-glyph string for the price levels that have one; FREE deliberately has no glyph (the client shows the word "Free" from `priceLevel === 'FREE'`). */
const PRICE_LEVEL_GLYPHS: Readonly<Record<PublishedPoiPriceLevel, string | undefined>> = {
  FREE: undefined,
  INEXPENSIVE: '$',
  MODERATE: '$$',
  EXPENSIVE: '$$$',
  VERY_EXPENSIVE: '$$$$',
};

/**
 * `ExternalPoiPlaceMetadata` (adapter-normalized Google data) → the
 * public-safe `PublishedPoiPlace` frozen onto the snapshot. Adds only the
 * DERIVED `priceLevelDisplay` glyph; every other field passes through
 * unchanged. Returns `undefined` when nothing public-safe survived (so the
 * caller omits `place` entirely rather than storing an empty object).
 */
function toPublishedPlace(metadata: ExternalPoiPlaceMetadata): PublishedPoiPlace | undefined {
  const priceLevelDisplay = metadata.priceLevel ? PRICE_LEVEL_GLYPHS[metadata.priceLevel] : undefined;
  const place: PublishedPoiPlace = {
    ...(metadata.rating !== undefined ? { rating: metadata.rating } : {}),
    ...(metadata.userRatingCount !== undefined ? { userRatingCount: metadata.userRatingCount } : {}),
    ...(metadata.priceLevel ? { priceLevel: metadata.priceLevel } : {}),
    ...(priceLevelDisplay ? { priceLevelDisplay } : {}),
    ...(metadata.primaryTypeDisplayName ? { primaryTypeDisplayName: metadata.primaryTypeDisplayName } : {}),
    ...(metadata.openingHours
      ? {
          openingHours: {
            periods: metadata.openingHours.periods.map((period) => ({
              open: { ...period.open },
              ...(period.close ? { close: { ...period.close } } : {}),
            })),
            weekdayDescriptions: [...metadata.openingHours.weekdayDescriptions],
          },
        }
      : {}),
    ...(metadata.utcOffsetMinutes !== undefined ? { utcOffsetMinutes: metadata.utcOffsetMinutes } : {}),
    ...(metadata.websiteUri ? { websiteUri: metadata.websiteUri } : {}),
    ...(metadata.nationalPhoneNumber ? { nationalPhoneNumber: metadata.nationalPhoneNumber } : {}),
    ...(metadata.dineIn !== undefined ? { dineIn: metadata.dineIn } : {}),
    ...(metadata.takeout !== undefined ? { takeout: metadata.takeout } : {}),
    ...(metadata.delivery !== undefined ? { delivery: metadata.delivery } : {}),
  };
  return Object.keys(place).length > 0 ? place : undefined;
}

/**
 * Pure content-selection for a Publish — checkpoint 1B.8 §13. No Firestore,
 * no network, no randomness/time dependency (mirrors
 * `buildPublicMenuProjection()`'s own "pure function, heavily unit-testable"
 * design) — takes the caller's already-loaded, already-tenant-scoped draft
 * content and derives exactly the subset a Publish should persist, applying
 * every "fail closed" content rule the checkpoint specifies:
 *
 * - Categories: only `enabled` categories are ever included (§13: "only
 *   valid enabled categories relevant to public content").
 * - Menu: `buildPublicMenuProjection()`'s own existing exclusion rules —
 *   disabled menu item, broken/disabled category reference, retired feature
 *   key — reused verbatim (§11 of this checkpoint: "Use existing
 *   buildPublicMenuProjection(). Do NOT recreate menu projection logic."),
 *   never reimplemented here.
 * - POIs: only `status === 'ENABLED'` POIs whose `categoryId` resolves to
 *   one of the categories already selected above — a POI referencing a
 *   disabled or nonexistent category is silently excluded, never published
 *   with a dangling reference (§13: "must reference valid included
 *   category... broken references: exclude safely").
 * - "Only IMPORTED Google Places POIs are persisted and eligible" / "Temporary
 *   Discover Places candidates: never published" (§13/§8) hold automatically
 *   here, by construction, not by an extra check: a Discover candidate is
 *   never written to `maps/{mapId}/pois/*` in the first place (see
 *   `POST /api/maps/{mapId}/pois/discover`, which only ever returns
 *   ephemeral results — nothing is persisted until a separate
 *   `POST .../pois/import` call), so it can never appear in this function's
 *   `pois` input to begin with.
 * - `theme` is always fully resolved (`DEFAULT_MAP_THEME` substituted when
 *   the draft map has no `theme` field at all) — the exact same read-side
 *   fallback every other admin-web reader of `MapTheme` already applies
 *   (see that type's own doc comment, shared-types/src/map.ts) — so a
 *   future public consumer of a published snapshot never has to re-implement
 *   that fallback itself; the contract guarantees `theme` is always present.
 * - Photo Experience Prototype checkpoint: a POI publishes `photo: {
 *   available: true }` (the narrow public-safe hint, see shared-types'
 *   `PublishedPoiPhoto` doc comment) — and a matching entry is added to the
 *   separately-returned, SERVER-ONLY `photoProviderRefs` map — exactly when
 *   it is `sourceType === 'GOOGLE_PLACES'`, was stamped `hasPhoto: true` at
 *   import time, and still carries `provider`/`providerPlaceId` (always
 *   true together for a `GOOGLE_PLACES` POI, checked explicitly rather than
 *   assumed). No network call is made here — this stays a pure function;
 *   see `Poi.hasPhoto`'s own doc comment for why a possibly-stale
 *   import-time hint is an acceptable, documented tradeoff, and why the
 *   ACTUAL photo is always re-resolved fresh, later, by the public photo
 *   endpoint, never trusted from this hint.
 */

export interface PublicationContent {
  readonly map: PublishedMapSummary;
  /**
   * checkpoint 1B.17A — sourced from the map's own `defaultLanguage`/
   * `enabledLanguages` (see shared-types' `TouristMap` doc comment for why
   * those field names, unchanged, now hold `PublicContentLanguage` values).
   * Captured onto the publication itself, not merely referenced from the
   * live map document, so an already-published snapshot's language config
   * stays exactly what it was at publish time even if the map's OWN
   * draft language settings are changed afterward (§10: "changing draft
   * translations/language settings later must not mutate an already-
   * published version").
   */
  readonly defaultLanguage: PublicContentLanguage;
  readonly supportedLanguages: readonly PublicContentLanguage[];
  readonly menu: readonly PublicationMenuItem[];
  readonly categories: readonly PublishedCategory[];
  readonly pois: readonly PublishedPoi[];
  readonly pages: readonly PublishedPage[];
  /**
   * LIVE CAMERAS FOUNDATION checkpoint — only `ENABLED` cameras, see
   * `PublishedLiveCamera`'s own doc comment (packages/shared-types/src/
   * publication.ts). Always present (possibly `[]`) — the publish route
   * writes this key unconditionally, mirroring `pages`, never conditionally
   * like `photoProviderRefs`.
   */
  readonly liveCameras: readonly PublishedLiveCamera[];
  /** Photo Experience Prototype checkpoint — see this file's header comment. Always present (possibly `{}`); the caller (the publish route) decides whether to write the key at all onto the stored document, matching `MapPublicationSnapshot.photoProviderRefs`'s own "absent, not empty" convention. */
  readonly photoProviderRefs: Readonly<Record<string, PublishedPoiPhotoProviderRef>>;
}

export function buildPublicationContent(
  map: MapParsed,
  categories: readonly CategoryParsed[],
  pois: readonly PoiParsed[],
  menuItems: readonly MenuItemParsed[],
  pages: readonly PageParsed[] = [],
  /**
   * Photo Experience Prototype checkpoint (rich-detail expansion) — the
   * Google place metadata the PUBLISH ROUTE resolved (one live Place Details
   * call per `GOOGLE_PLACES` POI), keyed by `poiId`. This function stays
   * pure — it never makes the network call itself; it only projects what it
   * is handed onto `PublishedPoi.place`. Empty / a POI absent from it (a
   * lookup that failed or returned nothing public-safe) → `place` is simply
   * omitted for that POI, exactly like a pre-expansion publication.
   */
  placeMetadataByPoiId: ReadonlyMap<string, ExternalPoiPlaceMetadata> = new Map(),
  /**
   * LIVE CAMERAS FOUNDATION checkpoint — appended as the LAST parameter
   * (not inserted between `pages` and `placeMetadataByPoiId`) specifically
   * so no existing positional call site (including every existing test in
   * build-publication-snapshot.test.ts) needs to change. Defaults to `[]`
   * so an old caller that never learned about cameras still gets a
   * publication with an empty `liveCameras` array, never `undefined`.
   */
  liveCameras: readonly LiveCameraParsed[] = [],
  providerLocalizationByPoiId: ReadonlyMap<string, PoiProviderLocalization> = new Map(),
): PublicationContent {
  const publishedCategories: PublishedCategory[] = categories
    .filter((category) => category.enabled)
    .map((category) => ({
      categoryId: category.categoryId,
      name: category.name,
      icon: category.icon,
      // checkpoint 1B.17A — passed through unchanged from the source
      // document; absent for every category no editor has translated yet
      // (1B.17B builds that editor).
      ...(category.translations ? { translations: category.translations } : {}),
    }));

  const publishedCategoryIds = new Set(publishedCategories.map((category) => category.categoryId));

  const photoProviderRefs: Record<string, PublishedPoiPhotoProviderRef> = {};
  const publishedPois: PublishedPoi[] = pois
    .filter((poi) => poi.status === 'ENABLED' && publishedCategoryIds.has(poi.categoryId))
    .map((poi) => {
      // Photo Experience Prototype checkpoint — see this file's header
      // comment. `provider`/`providerPlaceId` are only ever set together on
      // a real `GOOGLE_PLACES` POI (shared-types' `Poi` doc comment), but
      // both are checked explicitly rather than assumed from `sourceType`
      // alone — defense-in-depth against a malformed/partial document.
      const hasResolvablePhoto = poi.sourceType === 'GOOGLE_PLACES' && poi.hasPhoto === true && Boolean(poi.provider) && Boolean(poi.providerPlaceId);
      if (hasResolvablePhoto && poi.provider && poi.providerPlaceId) {
        photoProviderRefs[poi.poiId] = { provider: poi.provider, providerPlaceId: poi.providerPlaceId };
      }
      // Rich-detail expansion — `place` is independent of `photo`: a
      // `GOOGLE_PLACES` POI can have rating/hours/phone but no photo, and
      // vice versa. Only the publish route's resolved metadata is projected;
      // a non-`GOOGLE_PLACES` POI never gets a `place`, even if the map
      // somehow held a stray entry for its id.
      const placeMetadata = poi.sourceType === 'GOOGLE_PLACES' ? placeMetadataByPoiId.get(poi.poiId) : undefined;
      const place = placeMetadata ? toPublishedPlace(placeMetadata) : undefined;
      return {
        poiId: poi.poiId,
        categoryId: poi.categoryId,
        name: poi.name,
        location: poi.location,
        ...(poi.address ? { address: poi.address } : {}),
        ...(poi.description ? { description: poi.description } : {}),
        ...(poi.translations ? { translations: poi.translations } : {}),
        ...((providerLocalizationByPoiId.get(poi.poiId) ?? poi.providerLocalization) ? { providerLocalization: providerLocalizationByPoiId.get(poi.poiId) ?? poi.providerLocalization } : {}),
        ...(hasResolvablePhoto ? { photo: { available: true as const } } : {}),
        ...(place ? { place } : {}),
      };
    });

  // checkpoint 1B.11 — only `ENABLED` Pages are ever published, mirroring
  // `publishedCategories`'s identical "only enabled" filter above. A Page
  // creates no marker and has no category relationship, so — unlike POIs —
  // there is no cross-reference to validate here; a Page's PUBLIC visibility
  // depends only on its own `status`.
  const publishedPages: PublishedPage[] = pages
    .filter((page) => page.status === 'ENABLED')
    .map((page) => ({
      pageId: page.pageId,
      title: page.title,
      content: page.content,
      ...(page.translations ? { translations: page.translations } : {}),
    }));

  // LIVE CAMERAS FOUNDATION checkpoint — only `ENABLED` cameras are ever
  // published, mirroring `publishedCategories`/`publishedPages`'s identical
  // "only enabled" filter above. A camera creates its own marker and has no
  // category relationship, so — like a Page — there is no cross-reference
  // to validate here. `playback` (when present) is passed through
  // unchanged: it is already public-safe by construction (a browser-safe
  // WEBRTC/HLS relay URL only — see shared-types' `LiveCameraPlayback` doc
  // comment), so this is a straight projection, not a sanitizing step.
  const publishedLiveCameras: PublishedLiveCamera[] = liveCameras
    .filter((camera) => camera.status === 'ENABLED')
    .map((camera) => ({
      cameraId: camera.cameraId,
      name: camera.name,
      ...(camera.translations ? { translations: camera.translations } : {}),
      ...(camera.description ? { description: camera.description } : {}),
      location: camera.location,
      ...(camera.playback ? { playback: camera.playback } : {}),
    }));

  // `buildPublicMenuProjection()` is given every category/page (not just the
  // already-enabled subsets above) — it applies its own, already-correct
  // enabled/disabled check per menu item internally; passing the full lists
  // lets it make that decision itself rather than this function
  // second-guessing it.
  const menu = buildPublicMenuProjection(menuItems, categories, pages);

  const publishedMap: PublishedMapSummary = {
    name: map.name,
    mapProvider: map.mapProvider,
    area: map.area,
    ...(map.branding ? { branding: map.branding } : {}),
    theme: map.theme ?? DEFAULT_MAP_THEME,
  };

  return {
    map: publishedMap,
    defaultLanguage: map.defaultLanguage,
    supportedLanguages: map.enabledLanguages,
    menu,
    categories: publishedCategories,
    pois: publishedPois,
    pages: publishedPages,
    liveCameras: publishedLiveCameras,
    photoProviderRefs,
  };
}

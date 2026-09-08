/**
 * `ExternalPoiProvider` — checkpoint 1B.4's server-side adapter abstraction
 * for an external POI source, see docs/architecture/CATEGORY_ARCHITECTURE.md
 * §11. Mirrors the existing map-provider-abstraction discipline this
 * codebase already established for Google Maps rendering
 * (`lib/map-preview/types.ts`'s `MapPreviewProps`/`LocationPickerProps`) —
 * provider-specific code stays behind one small interface, never imported
 * directly by route handlers.
 *
 * The ENTIRE point of this abstraction is that `app/api/map/pois/discover/route.ts`
 * and `app/api/map/pois/import/route.ts` never import `GooglePlacesProvider`
 * (or any other concrete adapter) directly — they only ever call
 * `getExternalPoiProvider()` (./provider-registry.ts) and program against
 * this interface. That is what makes the hermetic E2E fake
 * (./fake-external-provider.ts) a true drop-in substitute rather than a
 * parallel, divergent code path, and what makes a second future provider
 * (a different external source, or a second Google API version) an
 * additive change here, not a rewrite of the two route handlers.
 *
 * Every method returns already-NORMALIZED shapes — never the provider's own
 * raw response object. A raw Google Places response must never reach the
 * browser or get persisted to Firestore (checkpoint 1B.4's own explicit
 * instruction) — the normalization happens inside the concrete adapter,
 * before its result ever crosses back out of this interface.
 *
 * PHOTO EXPERIENCE PROTOTYPE checkpoint — `getPlacePhotoRef()` /
 * `getPlacePhotoMedia()` extend this SAME abstraction for Google Places
 * photo resolution, for exactly the reason the file header above already
 * establishes: the public photo endpoints
 * (apps/admin-web/app/api/public/maps/[mapId]/pois/[poiId]/photo{,-meta}/route.ts)
 * must never import `GooglePlacesProvider` directly either, and must be
 * hermetically E2E-testable the same way discover/import already are — see
 * `fake-external-provider.ts`'s own updated doc comment.
 *
 * ARCHITECTURAL NOTE (freshness): neither of these two methods is ever
 * called from the discover/import flow, and their result is NEVER
 * persisted to Firestore or to any publication snapshot — they exist
 * SOLELY to let the trusted public photo endpoints resolve a photo
 * on-demand, per request, from a FRESH Google Places response.
 *
 * Conservative caching posture (no official Google Places Photos
 * documentation is available to this implementation to say otherwise): the
 * only Google identifier this codebase ever persists is
 * `providerPlaceId`/`provider` (stored already on `Poi` and copied onto the
 * immutable publication snapshot). A Places photo *resource name* and any
 * temporary/redirected media URL are treated as non-durable and are never
 * stored — `getPlacePhotoRefs()` always makes its own live Places request
 * keyed off `providerPlaceId` and never reads a previously-stored photo
 * reference, and the public byte endpoint applies no application/proxy
 * caching to the image it returns.
 *
 * PHOTO EXPERIENCE PROTOTYPE checkpoint (rich-detail expansion) —
 * `getPlaceMetadata()` is the ONE exception to "never persist a Google
 * response": the checkpoint's §4 explicitly requires stable, public-safe
 * place metadata (rating, hours, price, phone, ...) to be SNAPSHOTTED at
 * Publish so a later draft/Google change stays invisible until the next
 * Publish. It is called ONLY from the publish route, never a public request
 * path, and what it returns is already narrowed to public-safe display
 * fields — never `providerPlaceId`, a photo resource name, or review text.
 * Photos stay fully dynamic; only this flat metadata is frozen.
 */

export interface ExternalPoiLocation {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * A single discovery result — the shape `POST /api/map/pois/discover`
 * returns to the browser. Matches `externalPoiCandidateSchema`
 * (packages/validation/src/external-poi.ts) exactly; the discover route
 * re-validates every candidate against that schema before responding
 * (defense-in-depth against a malformed provider response).
 */
export interface ExternalPoiCandidate {
  readonly provider: 'GOOGLE';
  readonly providerPlaceId: string;
  readonly name: string;
  readonly location: ExternalPoiLocation;
  readonly address?: string;
  readonly distanceMeters?: number;
}

/**
 * Authoritative, server-resolved details for ONE specific place — what
 * `POST /api/map/pois/import` uses to populate the `Poi` document it
 * writes. Deliberately re-fetched by the import route itself from
 * `providerPlaceId` alone, never trusted from whatever the browser last
 * displayed in a discovery result (checkpoint 1B.4 §"import endpoint spec":
 * "server resolves authoritative place details itself").
 *
 * `hasPhoto` — Photo Experience Prototype checkpoint. Whether this Details
 * response reported at least one photo, read from the SAME response this
 * method already fetches (no extra Google request) — see shared-types'
 * `Poi.hasPhoto` doc comment for the full "hint, not authority" contract
 * this value is stamped into on import.
 */
export interface ExternalPoiDetails {
  readonly provider: 'GOOGLE';
  readonly providerPlaceId: string;
  readonly name: string;
  readonly location: ExternalPoiLocation;
  readonly address?: string;
  readonly hasPhoto?: boolean;
}

export interface ExternalPoiSearchParams {
  readonly center: ExternalPoiLocation;
  readonly radiusMeters: number;
  /** Provider-specific type vocabulary for this search (e.g. Google Places "included types") — sourced from the linked `PlatformCategoryRegistryEntry.googlePlaces.includedTypes` (packages/shared-types/src/platform-category.ts), never from client input. */
  readonly includedTypes: readonly string[];
}

/** One credited author of a Google Places photo — Photo Experience Prototype checkpoint. Mirrors the Places API (New) `Photo.authorAttributions[]` shape exactly (`displayName`/`uri`/`photoUri` per Google's docs); `photoUri` is deliberately NOT modeled here — it is Google's own ephemeral attribution-linked image URL, distinct from (and never a substitute for) `getPlacePhotoMedia()`'s own fresh `getMedia` fetch, and this codebase never persists or forwards it anywhere. */
export interface ExternalPoiPhotoAttribution {
  readonly displayName: string;
  readonly uri?: string;
}

/** A freshly-resolved reference to ONE Google Places photo from a live Details response — Photo Experience Prototype checkpoint. `name` is Google's own opaque photo resource identifier, needed only to immediately call `getPlacePhotoMedia()`; per this file's header comment it is never cached/persisted by any caller. */
export interface ExternalPoiPhotoRef {
  readonly name: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly attributions: readonly ExternalPoiPhotoAttribution[];
}

/** The actual resolved photo bytes for ONE `ExternalPoiPhotoRef`, ready to stream back as an HTTP response body — Photo Experience Prototype checkpoint. */
export interface ExternalPoiPhotoMedia {
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface ExternalPoiPhotoRequestOptions {
  readonly maxWidthPx: number;
  readonly maxHeightPx: number;
}

/** One `regularOpeningHours` period — Photo Experience Prototype checkpoint (rich-detail expansion). Mirrors shared-types' `PublishedPoiOpeningPeriod` / Google Places (New) `Place.OpeningHours.Period`. */
export interface ExternalPoiOpeningPeriod {
  readonly open: { readonly day: number; readonly hour: number; readonly minute: number };
  readonly close?: { readonly day: number; readonly hour: number; readonly minute: number };
}

/**
 * Photo Experience Prototype checkpoint (rich-detail expansion) — the
 * ALREADY-NORMALIZED, public-safe Google Places place metadata the PUBLISH
 * route snapshots onto `PublishedPoi.place`. Never carries `providerPlaceId`,
 * a photo resource name, or review text — only display-oriented public
 * fields. Every field optional (Google returns them piecemeal). `priceLevel`
 * has its `PRICE_LEVEL_` prefix already stripped and `..._UNSPECIFIED`
 * mapped to `undefined`.
 */
export interface ExternalPoiPlaceMetadata {
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly priceLevel?: 'FREE' | 'INEXPENSIVE' | 'MODERATE' | 'EXPENSIVE' | 'VERY_EXPENSIVE';
  readonly primaryTypeDisplayName?: string;
  readonly openingHours?: {
    readonly periods: readonly ExternalPoiOpeningPeriod[];
    readonly weekdayDescriptions: readonly string[];
  };
  readonly utcOffsetMinutes?: number;
  readonly websiteUri?: string;
  readonly nationalPhoneNumber?: string;
  readonly dineIn?: boolean;
  readonly takeout?: boolean;
  readonly delivery?: boolean;
}

export interface ExternalPoiProvider {
  discoverNearby(params: ExternalPoiSearchParams): Promise<readonly ExternalPoiCandidate[]>;
  getPlaceDetails(providerPlaceId: string): Promise<ExternalPoiDetails | undefined>;
  /**
   * Fresh (never cached) resolution of ALL of a place's usable photos, in
   * Google's own order, capped to a bounded gallery size by the adapter. An
   * empty array when the place currently has no photo. Photo N is
   * `result[N]`. See this file's header comment for the freshness
   * requirement.
   */
  getPlacePhotoRefs(providerPlaceId: string): Promise<readonly ExternalPoiPhotoRef[]>;
  /** Fetches the actual image bytes for an `ExternalPoiPhotoRef.name` obtained from `getPlacePhotoRefs()` moments earlier. `undefined` on any resolution failure (expired resource, upstream error, ...) — the caller (the public photo route) turns that into a safe, generic 404, never a leaked provider error. */
  getPlacePhotoMedia(photoName: string, options: ExternalPoiPhotoRequestOptions): Promise<ExternalPoiPhotoMedia | undefined>;
  /**
   * Photo Experience Prototype checkpoint (rich-detail expansion) — a fresh
   * Google Place Details call resolving the public-safe rich metadata for
   * `PublishedPoi.place`. Called ONLY at Publish time, never from a public
   * request path. `undefined` on 404 / any upstream failure — the publish
   * route then simply omits `place` for that POI (never fails the publish).
   */
  getPlaceMetadata(providerPlaceId: string): Promise<ExternalPoiPlaceMetadata | undefined>;
}

/** Bounded gallery size — the maximum number of photos any provider adapter ever returns from `getPlacePhotoRefs()`, and the exclusive upper bound the public photo endpoints accept for `?index=`. Keeps per-place billing and client memory bounded regardless of how many photos Google actually has. */
export const MAX_GALLERY_PHOTOS = 10;

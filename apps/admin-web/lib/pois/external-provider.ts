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
 */
export interface ExternalPoiDetails {
  readonly provider: 'GOOGLE';
  readonly providerPlaceId: string;
  readonly name: string;
  readonly location: ExternalPoiLocation;
  readonly address?: string;
}

export interface ExternalPoiSearchParams {
  readonly center: ExternalPoiLocation;
  readonly radiusMeters: number;
  /** Provider-specific type vocabulary for this search (e.g. Google Places "included types") — sourced from the linked `PlatformCategoryRegistryEntry.googlePlaces.includedTypes` (packages/shared-types/src/platform-category.ts), never from client input. */
  readonly includedTypes: readonly string[];
}

export interface ExternalPoiProvider {
  discoverNearby(params: ExternalPoiSearchParams): Promise<readonly ExternalPoiCandidate[]>;
  getPlaceDetails(providerPlaceId: string): Promise<ExternalPoiDetails | undefined>;
}

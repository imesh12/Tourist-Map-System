import { z } from 'zod';
import { categoryIdSchema } from './ids.js';
import { latitudeSchema, longitudeSchema } from './map.js';
import { poiAddressSchema, poiNameSchema, poiProviderSchema, poiProviderPlaceIdSchema } from './poi.js';

/**
 * Google Places source integration input/output schemas — checkpoint 1B.4,
 * see docs/architecture/CATEGORY_ARCHITECTURE.md §11. A separate file from
 * poi.ts (not appended there) because these govern a genuinely different
 * trust boundary: `poi.ts`'s `poiCreateInputSchema`/`poiUpdateInputSchema`
 * are the manual-POI mutation boundary (`POST`/`PATCH /api/map/pois*`);
 * these three schemas are the DISCOVERY/IMPORT boundary
 * (`POST /api/map/pois/discover`, `POST /api/map/pois/import`) — reusing the
 * same primitive field schemas (`poiNameSchema`, `poiAddressSchema`,
 * `latitudeSchema`/`longitudeSchema`, `categoryIdSchema`) rather than
 * redeclaring them, but never merging the two `.strict()` object shapes
 * together.
 */

const MIN_DISCOVERY_RADIUS_METERS = 50;
const MAX_DISCOVERY_RADIUS_METERS = 5000;

/** checkpoint 1B.4 §"cost-control safeguards" — a hard server-side ceiling on how wide a single discovery search may be, independent of whatever fixed preset options the Discover Places UI's radius `<select>` offers. */
export const poiDiscoverRadiusMetersSchema = z.number().int().min(MIN_DISCOVERY_RADIUS_METERS).max(MAX_DISCOVERY_RADIUS_METERS);

/**
 * `POST /api/map/pois/discover` input. Deliberately minimal — no client-
 * supplied center/coordinates: the route always searches around the
 * tenant's OWN configured map center (or a harmless fallback viewport when
 * none is configured yet), never an arbitrary browser-supplied location,
 * which would otherwise let an authenticated tenant use this endpoint as a
 * free-form, billable Google Places proxy for any location on Earth.
 */
export const poiDiscoverInputSchema = z
  .object({
    categoryId: categoryIdSchema,
    radiusMeters: poiDiscoverRadiusMetersSchema,
  })
  .strict();
export type PoiDiscoverInput = z.infer<typeof poiDiscoverInputSchema>;

/**
 * A single normalized external result — checkpoint 1B.4's
 * `ExternalPoiCandidate` (apps/admin-web/lib/pois/external-provider.ts).
 * This is the ONLY shape `POST /api/map/pois/discover` is ever allowed to
 * return to the browser — the raw Google Places API response never reaches
 * the client or gets persisted anywhere; every candidate returned is
 * revalidated against this schema server-side before the response is sent
 * (defense-in-depth against a malformed/unexpected provider response), same
 * "skip, don't crash, on a bad shape" convention `load-pois.ts`/
 * `load-categories.ts` already establish for stored documents.
 */
export const externalPoiCandidateSchema = z.object({
  provider: poiProviderSchema,
  providerPlaceId: poiProviderPlaceIdSchema,
  name: poiNameSchema,
  location: z.object({ latitude: latitudeSchema, longitude: longitudeSchema }),
  address: poiAddressSchema.optional(),
  /** Present only when the provider itself reports a distance from the search center — a UI convenience, never re-derived/trusted for anything security-relevant. */
  distanceMeters: z.number().min(0).optional(),
});
export type ExternalPoiCandidateParsed = z.infer<typeof externalPoiCandidateSchema>;

/**
 * `POST /api/map/pois/import` input — deliberately minimal (§"import
 * endpoint spec": "server resolves authoritative place details itself").
 * The browser supplies only WHICH place to import (`provider` +
 * `providerPlaceId`) and WHICH tenant category to file it under
 * (`categoryId`) — never a name/address/coordinates the server would then
 * have to decide whether to trust; those are always re-fetched from the
 * provider by the route handler itself.
 */
export const poiImportInputSchema = z
  .object({
    categoryId: categoryIdSchema,
    provider: poiProviderSchema,
    providerPlaceId: poiProviderPlaceIdSchema,
  })
  .strict();
export type PoiImportInput = z.infer<typeof poiImportInputSchema>;

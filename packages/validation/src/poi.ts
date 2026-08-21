import { z } from 'zod';
import { POI_PROVIDERS, POI_SOURCE_TYPES, POI_STATUSES } from 'shared-types';
import { categoryIdSchema, customerIdSchema, mapIdSchema, poiIdSchema } from './ids.js';
import { latitudeSchema, longitudeSchema } from './map.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * POI domain + input schemas — checkpoint 1B.3, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md's POI section. Mirrors
 * category.ts's shape (full-document schema for defense-in-depth reads,
 * plus separate `.strict()` create/update input schemas for the untrusted
 * mutation boundary).
 */

const NAME_MAX_LENGTH = 150;
const ADDRESS_MAX_LENGTH = 300;
const DESCRIPTION_MAX_LENGTH = 2000;

export const poiNameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);
export const poiAddressSchema = z.string().trim().max(ADDRESS_MAX_LENGTH);
export const poiDescriptionSchema = z.string().trim().max(DESCRIPTION_MAX_LENGTH);
export const poiStatusSchema = z.enum(POI_STATUSES);
export const poiSourceTypeSchema = z.enum(POI_SOURCE_TYPES);
/** checkpoint 1B.4 — see shared-types' `Poi.provider` doc comment. */
export const poiProviderSchema = z.enum(POI_PROVIDERS);
/** checkpoint 1B.4 — an opaque external identifier (Google's own Place `id`/resource name), not one of this codebase's own branded ID formats, so only a length bound is enforced, not a prefix/character-class regex. */
export const poiProviderPlaceIdSchema = z.string().trim().min(1).max(300);

/** Stored `location` shape — a plain `{latitude, longitude}` object, see shared-types' `Poi` doc comment for why not a Firestore `GeoPoint`. */
export const poiLocationSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

/**
 * Full stored document — defense-in-depth validation for reads, mirroring
 * `categorySchema`'s role. `provider`/`providerPlaceId` — checkpoint 1B.4,
 * both optional (backward compatible with every 1B.3 `CLIENT_CUSTOM`
 * document, which has neither field) — see shared-types' `Poi` doc comment.
 */
export const poiSchema = z.object({
  poiId: poiIdSchema,
  customerId: customerIdSchema,
  mapId: mapIdSchema,
  categoryId: categoryIdSchema,
  name: poiNameSchema,
  location: poiLocationSchema,
  address: poiAddressSchema.optional(),
  description: poiDescriptionSchema.optional(),
  sourceType: poiSourceTypeSchema,
  provider: poiProviderSchema.optional(),
  providerPlaceId: poiProviderPlaceIdSchema.optional(),
  status: poiStatusSchema,
  createdAt: firestoreTimestampLikeSchema,
  updatedAt: firestoreTimestampLikeSchema,
});
export type PoiParsed = z.infer<typeof poiSchema>;

/**
 * `POST /api/map/pois` input. `.strict()` rejects `poiId`/`customerId`/
 * `mapId`/`sourceType`/`createdAt`/`updatedAt` outright — none of those are
 * ever client-suppliable; the server derives/generates/stamps them (see the
 * route handler, which always writes `sourceType: 'CLIENT_CUSTOM'`).
 * `categoryId` is validated for FORMAT only here — the route handler is
 * additionally responsible for verifying the referenced category actually
 * exists under the caller's own authenticated map before writing anything
 * (checkpoint 1B.3 §6): a well-formed but nonexistent, or cross-tenant,
 * `categoryId` must never be accepted merely because it matches this regex.
 * `latitude`/`longitude` are flat top-level fields (not a nested `location`
 * object) — matching the create/edit drawer's separate Latitude/Longitude
 * inputs; the route assembles the stored `location` object from them.
 *
 * Checkpoint 1B.4: this schema also has no `provider`/`providerPlaceId`
 * fields — `.strict()` rejects them the same way it rejects `sourceType`.
 * This endpoint only ever creates `CLIENT_CUSTOM` POIs; a client can never
 * reach `GOOGLE_PLACES` content through it, by construction, not by a
 * runtime check — see `poiImportInputSchema` (packages/validation/src/external-poi.ts)
 * for the actual, separate, minimal-input import path.
 */
export const poiCreateInputSchema = z
  .object({
    name: poiNameSchema,
    categoryId: categoryIdSchema,
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    address: poiAddressSchema.optional(),
    description: poiDescriptionSchema.optional(),
    status: poiStatusSchema.optional(),
  })
  .strict();
export type PoiCreateInput = z.infer<typeof poiCreateInputSchema>;

/**
 * `PATCH /api/map/pois/{poiId}` input — every field optional (a partial
 * update), but at least one must be present. `poiId`/`customerId`/`mapId`/
 * `sourceType`/`createdAt`/`updatedAt` are not fields on this schema at all,
 * exactly like `categoryUpdateInputSchema`. `latitude`/`longitude` must be
 * supplied together or not at all — the stored `location` is a single
 * nested field, and the create/edit drawer's coordinate inputs are always
 * edited as a pair (typing or a map click always produces both), so a
 * request that changes only one half of a location is rejected as
 * malformed input rather than guessing what to do with it.
 *
 * Checkpoint 1B.4: no `provider`/`providerPlaceId` fields here either, same
 * reasoning as `poiCreateInputSchema` above. The route handler additionally
 * restricts which of THESE fields may be sent when the target POI's own
 * stored `sourceType` is `GOOGLE_PLACES` (only `status`) — a check this
 * schema itself cannot make, since it has no way to know which POI a given
 * request targets.
 */
export const poiUpdateInputSchema = z
  .object({
    name: poiNameSchema.optional(),
    categoryId: categoryIdSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    address: poiAddressSchema.optional(),
    description: poiDescriptionSchema.optional(),
    status: poiStatusSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' })
  .refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
    message: 'latitude and longitude must be provided together',
    path: ['latitude'],
  });
export type PoiUpdateInput = z.infer<typeof poiUpdateInputSchema>;

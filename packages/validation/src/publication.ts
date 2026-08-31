import { z } from 'zod';
import { CATEGORY_ICONS } from 'shared-types';
import { mapBrandingSchema } from './branding.js';
import { categoryIdSchema, customerIdSchema, mapIdSchema, poiIdSchema, publicationIdSchema, uidSchema } from './ids.js';
import { latitudeSchema, longitudeSchema, mapAreaSchema, mapProviderConfigSchema } from './map.js';
import { mapThemeSchema } from './map-theme.js';
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

const publicationMenuItemSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('CATEGORY'),
      label: z.string().trim().min(1),
      icon: z.enum(CATEGORY_ICONS),
      categoryId: categoryIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('FEATURE'),
      label: z.string().trim().min(1),
      icon: z.enum(CATEGORY_ICONS),
      featureKey: z.string().trim().min(1),
    })
    .strict(),
]);

const publishedCategorySchema = z
  .object({
    categoryId: categoryIdSchema,
    name: z.string().trim().min(1),
    icon: z.enum(CATEGORY_ICONS),
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
    menu: z.array(publicationMenuItemSchema),
    categories: z.array(publishedCategorySchema),
    pois: z.array(publishedPoiSchema),
  })
  .strict();

export type MapPublicationSnapshotParsed = z.infer<typeof mapPublicationSnapshotSchema>;

/**
 * Checkpoint 1B.9 — the schema for what `GET /api/public/maps/{mapId}`
 * actually returns over the wire: the same snapshot shape with
 * `customerId`/`publishedByUid` removed, mirroring shared-types'
 * `PublicMapSnapshot = Omit<MapPublicationSnapshot, 'customerId' | 'publishedByUid'>`
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
});

export type PublicMapSnapshotParsed = z.infer<typeof publicMapSnapshotSchema>;

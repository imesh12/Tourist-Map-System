import { z } from 'zod';
import { LANGUAGES, MAP_AREA_TYPES, MAP_PROVIDER_NAMES, MAP_STATUSES, MAP_STYLES } from 'shared-types';
import { mapBrandingSchema } from './branding.js';
import { customerIdSchema, mapIdSchema } from './ids.js';
import { mapThemeSchema } from './map-theme.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * Map area geometry — checkpoint 1B.1, see
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md §2. Exported (not inlined into
 * `mapSchema`) so the same validated shape — including the coordinate/zoom
 * ranges and the BOUNDED/UNBOUNDED invariants below — is reused for both
 * reading a stored map doc (defense-in-depth, via `mapSchema`) and
 * validating the untrusted map-settings mutation input (`mapSettingsUpdateSchema`
 * in map-settings.ts), rather than duplicating the rules in two places.
 *
 * A provider-independent zoom range (0–22) is used deliberately — this is
 * not a Google-Maps- or Mapbox-specific concept, just the common range both
 * currently-supported `MapProviderName`s (see shared-types/enums.ts)
 * support without clipping.
 */
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

// Exported (not module-private) — checkpoint 1B.3's `poiLocationSchema`
// (poi.ts) reuses these exact same coordinate ranges rather than
// re-declaring them, so "what counts as a valid latitude/longitude" stays
// defined in exactly one place across map area bounds AND POI locations.
export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);
const zoomSchema = z.number().min(MIN_ZOOM).max(MAX_ZOOM);

const mapAreaBoundsSchema = z
  .object({
    north: latitudeSchema,
    south: latitudeSchema,
    east: longitudeSchema,
    west: longitudeSchema,
  })
  .refine((bounds) => bounds.north > bounds.south, { message: 'north must be greater than south', path: ['north'] })
  // Standard, non-antimeridian-crossing bounds only for Phase 1B — see
  // docs/stages/STAGE_1B_TECHNICAL_PLAN.md; antimeridian-crossing bounds
  // (east < west) are not supported.
  .refine((bounds) => bounds.east > bounds.west, { message: 'east must be greater than west', path: ['east'] });

export const mapAreaSchema = z
  .object({
    type: z.enum(MAP_AREA_TYPES),
    center: z.object({ lat: latitudeSchema, lng: longitudeSchema }).optional(),
    defaultZoom: zoomSchema.optional(),
    bounds: mapAreaBoundsSchema.optional(),
  })
  // BOUNDED requires a fully-specified viewport + extent (§6 of the 1B.1
  // prompt/plan); UNBOUNDED may still carry center/defaultZoom as an
  // initial viewport, and any `bounds` present is still validated above
  // but is not required and is ignored by UNBOUNDED-aware readers.
  .refine((area) => area.type !== 'BOUNDED' || (area.center !== undefined && area.defaultZoom !== undefined && area.bounds !== undefined), {
    message: 'A BOUNDED map area requires center, defaultZoom, and bounds',
    path: ['type'],
  });

/**
 * Mirrors shared-types' `TouristMap` interface. `customerId` is the
 * ownership field — this schema validates its *format* (via
 * `customerIdSchema`) but, per docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10,
 * the *value* itself must always come from trusted backend context (the
 * `customerId` the authenticated caller's custom claims resolve to), never
 * from client-supplied input, even where this schema is reused for
 * defense-in-depth validation before a write.
 */
export const mapSchema = z
  .object({
    mapId: mapIdSchema,
    customerId: customerIdSchema,
    name: z.string().trim().min(1).max(200),
    status: z.enum(MAP_STATUSES),
    defaultLanguage: z.enum(LANGUAGES),
    enabledLanguages: z
      .array(z.enum(LANGUAGES))
      .min(1)
      .refine((languages) => new Set(languages).size === languages.length, {
        message: 'enabledLanguages must not contain duplicates',
      }),
    mapProvider: z.object({
      provider: z.enum(MAP_PROVIDER_NAMES),
      style: z.enum(MAP_STYLES),
    }),
    area: mapAreaSchema,
    // Optional — absent until a Client Admin first saves branding
    // (checkpoint 1B.1). Every map document provisioned by checkpoint 1A.5
    // predates this field, so it must stay optional here or every such
    // existing/fixture-seeded map would fail `getCurrentClientContext()`'s
    // read-side validation and fail closed.
    branding: mapBrandingSchema.optional(),
    // Optional — absent until a Client Admin first saves a theme
    // (checkpoint 1B.7). Every map document created before this checkpoint
    // predates this field, so it must stay optional here or every such
    // existing/fixture-seeded map would fail read-side validation and fail
    // closed — see MapTheme's own doc comment (shared-types/src/map.ts).
    theme: mapThemeSchema.optional(),
    createdAt: firestoreTimestampLikeSchema,
    updatedAt: firestoreTimestampLikeSchema,
  })
  // Invariant from docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8:
  // enabledLanguages must always include defaultLanguage.
  .refine((map) => map.enabledLanguages.includes(map.defaultLanguage), {
    message: 'enabledLanguages must include defaultLanguage',
    path: ['enabledLanguages'],
  });

export type MapParsed = z.infer<typeof mapSchema>;

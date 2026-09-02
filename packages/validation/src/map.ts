import { z } from 'zod';
import { MAP_AREA_TYPES, MAP_PROVIDER_NAMES, MAP_STATUSES, MAP_STYLES } from 'shared-types';
import { mapBrandingSchema } from './branding.js';
import { customerIdSchema, mapIdSchema, publicationIdSchema, uidSchema } from './ids.js';
import { legacyPublicContentLanguageInputSchema, supportedPublicContentLanguagesSchema } from './language.js';
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
 * `TouristMap.mapProvider` — exported (not inlined into `mapSchema`) so
 * checkpoint 1B.8's `publication.ts` can validate a stored publication
 * snapshot's own `map.mapProvider` field against the exact same shape,
 * without either file importing a runtime schema value FROM the other (that
 * would be a circular module dependency — `publication.ts` already imports
 * `mapAreaSchema`/this export FROM `map.ts`, so `map.ts` must never import
 * anything back from `publication.ts`; see `mapPublicationMetaSchema` below
 * for the same constraint applied to the map document's own publication
 * pointer field).
 */
export const mapProviderConfigSchema = z.object({
  provider: z.enum(MAP_PROVIDER_NAMES),
  style: z.enum(MAP_STYLES),
});

/**
 * `TouristMap.publication` — checkpoint 1B.8, mirrors shared-types'
 * `MapPublicationMeta`. Deliberately defined HERE (inside map.ts, alongside
 * `mapSchema` itself) rather than in `publication.ts` — `publication.ts`
 * needs `mapAreaSchema`/`mapThemeSchema`/`mapProviderConfigSchema`/
 * `mapBrandingSchema` from THIS file to validate a full publication
 * snapshot's `map` field, so `map.ts` must never import a runtime schema
 * value back from `publication.ts`, or the two modules would form a runtime
 * circular dependency (unlike a `import type`-only cycle, which TypeScript
 * safely erases, a cycle between actual `z.object(...)` values evaluated at
 * module-load time can genuinely break — one side would see the other's
 * export as `undefined` depending on evaluation order). Colocating this
 * small pointer-only schema with `mapSchema` keeps the dependency graph a
 * simple one-directional edge: `publication.ts` → `map.ts`, never the
 * reverse.
 */
export const mapPublicationMetaSchema = z
  .object({
    currentPublicationId: publicationIdSchema,
    version: z.number().int().min(1),
    publishedAt: firestoreTimestampLikeSchema,
    publishedByUid: uidSchema,
  })
  .strict();
export type MapPublicationMetaParsed = z.infer<typeof mapPublicationMetaSchema>;

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
    // checkpoint 1B.17A — repointed at the real `PublicContentLanguage`
    // registry (packages/validation/src/language.ts), accepting either a
    // current or a pre-1B.17A legacy `Language` code (every map document has
    // always had these two fields populated, so the only compatibility
    // concern is the value FORMAT — see `legacyPublicContentLanguageInputSchema`'s
    // own doc comment). `enabledLanguages` remains this field's name — it IS
    // the checkpoint's own "supportedLanguages" concept, kept under its
    // already-established name (see shared-types' `TouristMap` doc comment).
    defaultLanguage: legacyPublicContentLanguageInputSchema,
    enabledLanguages: supportedPublicContentLanguagesSchema,
    mapProvider: mapProviderConfigSchema,
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
    // Optional — absent until this map is first published (checkpoint
    // 1B.8). Same backward-compatibility contract as `branding`/`theme`
    // above — see `MapPublicationMeta`'s own doc comment (shared-types/src/map.ts).
    publication: mapPublicationMetaSchema.optional(),
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

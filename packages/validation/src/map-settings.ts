import { z } from 'zod';
import { MAP_PROVIDER_NAMES, MAP_STYLES } from 'shared-types';
import { mapBrandingSchema } from './branding.js';
import { mapLanguageConfigSchema } from './language.js';
import { mapAreaSchema } from './map.js';
import { mapThemeSchema } from './map-theme.js';

/**
 * Map-settings update input — the untrusted-input schema for checkpoint
 * 1B.1's `PATCH /api/map/settings` (docs/stages/STAGE_1B_TECHNICAL_PLAN.md
 * §3). This is the editable subset of `mapSchema` only: `mapId`,
 * `customerId`, `status`, `defaultLanguage`, `enabledLanguages`, `createdAt`,
 * and `updatedAt` are deliberately NOT fields on this schema at all —
 * `.strict()` below rejects any attempt to smuggle one of them (or any other
 * unrecognized key) into the request body, exactly like
 * `registrationInputSchema`'s "no role/customerId/mapId field at all"
 * pattern (see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10). Ownership itself
 * is never decided by this schema either way — the server resolves which
 * map to update from the verified session's own tenant context
 * (`getCurrentClientContext()`), never from anything in this payload.
 *
 * `languages` — checkpoint 1B.17A §8. A single optional, ATOMIC field
 * (`mapLanguageConfigSchema`, packages/validation/src/language.ts) rather
 * than two independently-optional `defaultLanguage`/`supportedLanguages`
 * fields: default+supported are always sent TOGETHER, exactly once, or not
 * at all, mirroring `theme`'s identical "one optional embedded object" shape
 * above. This is what makes "default must always be supported" (§8) fully
 * checkable by the schema alone — `mapLanguageConfigSchema`'s own `.refine()`
 * has both values in hand in the SAME request, with no dependency on
 * already-stored state a schema can't see. Changing language configuration
 * is still just an ordinary Save (never a Publish) — the route handler only
 * ever writes `maps/{mapId}` here, exactly like every other field on this
 * schema; it can never touch an already-published `publications/*` snapshot.
 */
export const mapSettingsUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mapProvider: z.object({
      provider: z.enum(MAP_PROVIDER_NAMES),
      style: z.enum(MAP_STYLES),
    }),
    area: mapAreaSchema,
    branding: mapBrandingSchema.optional(),
    // Checkpoint 1B.7 — same "optional embedded object, .strict() sub-schema
    // rejects forged/raw-provider/ownership fields" pattern `branding`
    // above already establishes. See mapThemeSchema's own doc comment
    // (./map-theme.ts) for why this alone is sufficient to satisfy "reject
    // raw provider style JSON" without a separate check here.
    theme: mapThemeSchema.optional(),
    languages: mapLanguageConfigSchema.optional(),
  })
  .strict();

export type MapSettingsUpdateInput = z.infer<typeof mapSettingsUpdateSchema>;

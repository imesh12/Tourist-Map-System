import { z } from 'zod';
import { MAP_PROVIDER_NAMES, MAP_STYLES } from 'shared-types';
import { mapBrandingSchema } from './branding.js';
import { mapAreaSchema } from './map.js';

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
  })
  .strict();

export type MapSettingsUpdateInput = z.infer<typeof mapSettingsUpdateSchema>;

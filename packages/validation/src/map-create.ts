import { z } from 'zod';

/**
 * Map-creation input — checkpoint 1B.6 §6. The untrusted-input schema for
 * `POST /api/maps` (a Client Admin creating an additional map under their
 * own tenant).
 *
 * Deliberately minimal, mirroring `registrationInputSchema`'s "no
 * role/customerId/mapId field at all" pattern (docs/stages/
 * STAGE_1A_TECHNICAL_PLAN.md §10) and `mapSettingsUpdateSchema`'s identical
 * reasoning (map-settings.ts): `mapId`, `customerId`, `status`,
 * `createdAt`/`updatedAt`, and every other server-stamped/system field are
 * NOT fields on this schema at all — `.strict()` rejects any attempt to
 * smuggle one of them into the request body. The server never trusts a
 * client-supplied `customerId` for the new map's ownership; it is always
 * stamped from the authenticated caller's own tenant identity
 * (`getCurrentTenantIdentity()`), never from anything in this payload.
 *
 * Every other field a new map needs (`defaultLanguage`, `enabledLanguages`,
 * `mapProvider`, `area`, `status`) is server-defaulted at creation time —
 * exactly the same defaults `provisionClient()`
 * (firebase/functions/src/provisioning/provision-client.ts) already uses
 * for a tenant's very first map, reused here rather than re-invented, since
 * a second/third map should be just as usable out of the box as the first
 * one is. See `apps/admin-web/app/api/maps/route.ts` for where those
 * defaults are actually applied.
 */
export const mapCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type MapCreateInput = z.infer<typeof mapCreateInputSchema>;

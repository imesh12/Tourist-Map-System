import { randomBytes } from 'node:crypto';
import { MAP_ID_PREFIX, type MapId } from 'shared-types';

/**
 * `map_`-prefixed ID generation — checkpoint 1B.6. Same pattern
 * `generate-category-id.ts`/`generate-poi-id.ts`/`generate-menu-item-id.ts`
 * already established (mirroring `firebase/functions/src/ids.ts`'s
 * checkpoint 1A.5 `customerId`/`mapId` generator, which is scoped to
 * `firebase/functions` only and not importable from here): a
 * cryptographically random, URL-safe suffix, never derived from client
 * input. `POST /api/maps` (this checkpoint's new "create an additional map"
 * endpoint) is a trusted admin-web Route Handler, not a Cloud Function, so
 * this is a separate, equally-trusted-context generator rather than
 * importing across that package boundary — exactly as those three prior
 * generators already do.
 */
export function generateMapId(): MapId {
  return `${MAP_ID_PREFIX}${randomBytes(15).toString('base64url')}` as MapId;
}

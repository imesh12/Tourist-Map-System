import { randomBytes } from 'node:crypto';
import { POI_ID_PREFIX, type PoiId } from 'shared-types';

/**
 * `poi_`-prefixed ID generation — checkpoint 1B.3, same pattern
 * `generate-category-id.ts` established (checkpoint 1B.2): a
 * cryptographically random, URL-safe suffix, never derived from client
 * input.
 */
export function generatePoiId(): PoiId {
  return `${POI_ID_PREFIX}${randomBytes(15).toString('base64url')}` as PoiId;
}

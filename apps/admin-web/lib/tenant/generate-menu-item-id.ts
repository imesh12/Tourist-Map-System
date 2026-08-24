import { randomBytes } from 'node:crypto';
import { MENU_ITEM_ID_PREFIX, type MenuItemId } from 'shared-types';

/**
 * `menu_`-prefixed ID generation — checkpoint 1B.5, same pattern
 * `generate-poi-id.ts`/`generate-category-id.ts` established: a
 * cryptographically random, URL-safe suffix, never derived from client
 * input.
 */
export function generateMenuItemId(): MenuItemId {
  return `${MENU_ITEM_ID_PREFIX}${randomBytes(15).toString('base64url')}` as MenuItemId;
}

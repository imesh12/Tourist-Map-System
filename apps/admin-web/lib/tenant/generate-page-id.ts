import { randomBytes } from 'node:crypto';
import { PAGE_ID_PREFIX, type PageId } from 'shared-types';

/**
 * `page_`-prefixed ID generation — checkpoint 1B.11, same pattern
 * `generate-category-id.ts`/`generate-poi-id.ts`/`generate-menu-item-id.ts`
 * already establish: a cryptographically random, URL-safe suffix, never
 * derived from client input.
 */
export function generatePageId(): PageId {
  return `${PAGE_ID_PREFIX}${randomBytes(15).toString('base64url')}` as PageId;
}

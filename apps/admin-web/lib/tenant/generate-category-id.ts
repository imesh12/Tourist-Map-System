import { randomBytes } from 'node:crypto';
import { CATEGORY_ID_PREFIX, type CategoryId } from 'shared-types';

/**
 * `cat_`-prefixed ID generation — checkpoint 1B.2, same pattern
 * `firebase/functions/src/ids.ts` established for `customerId`/`mapId`
 * (checkpoint 1A.5, docs/stages/STAGE_1A_TECHNICAL_PLAN.md §7): a
 * cryptographically random, URL-safe suffix, never derived from client
 * input. That module is scoped to `firebase/functions` only (its own doc
 * comment says so explicitly) — category creation is a trusted admin-web
 * Route Handler (docs/stages/STAGE_1B_TECHNICAL_PLAN.md §3), not a Cloud
 * Function, so this is a separate, equally-trusted-context generator rather
 * than importing across that boundary.
 */
export function generateCategoryId(): CategoryId {
  return `${CATEGORY_ID_PREFIX}${randomBytes(15).toString('base64url')}` as CategoryId;
}

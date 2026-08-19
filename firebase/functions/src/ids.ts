import { randomBytes } from 'node:crypto';
import { CUSTOMER_ID_PREFIX, MAP_ID_PREFIX, type CustomerId, type MapId } from 'shared-types';

/**
 * `cust_`/`map_`-prefixed ID generation — checkpoint 1A.5, per
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §7. Trusted-backend-only: this
 * module is imported exclusively by `firebase/functions`, never by
 * admin-web or any client-reachable code — IDs are never derived from, or
 * accepted as, client input (see `packages/validation`'s `registrationInputSchema`,
 * which has no `customerId`/`mapId` field at all).
 *
 * 15 random bytes encode to exactly 20 base64url characters (120 bits / 6
 * bits-per-char = 20, no padding needed) — cryptographically random, URL-safe,
 * and comfortably inside the 16-40 character envelope
 * `packages/validation`'s `customerIdSchema`/`mapIdSchema` expect.
 */
function generateRandomToken(): string {
  return randomBytes(15).toString('base64url');
}

export function generateCustomerId(): CustomerId {
  return `${CUSTOMER_ID_PREFIX}${generateRandomToken()}` as CustomerId;
}

export function generateMapId(): MapId {
  return `${MAP_ID_PREFIX}${generateRandomToken()}` as MapId;
}

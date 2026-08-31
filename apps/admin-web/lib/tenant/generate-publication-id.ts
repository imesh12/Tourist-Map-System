import { randomBytes } from 'node:crypto';
import { PUBLICATION_ID_PREFIX, type PublicationId } from 'shared-types';

/**
 * `pub_`-prefixed ID generation — checkpoint 1B.8, same pattern
 * `generate-category-id.ts`/`generate-poi-id.ts`/`generate-menu-item-id.ts`
 * already establish: a cryptographically random, URL-safe suffix, never
 * derived from client input. Publication creation happens exclusively
 * inside the trusted `POST /api/maps/{mapId}/publish` Route Handler.
 */
export function generatePublicationId(): PublicationId {
  return `${PUBLICATION_ID_PREFIX}${randomBytes(15).toString('base64url')}` as PublicationId;
}

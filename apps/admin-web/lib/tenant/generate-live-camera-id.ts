import { randomBytes } from 'node:crypto';
import { LIVE_CAMERA_ID_PREFIX, type LiveCameraId } from 'shared-types';

/**
 * `cam_`-prefixed ID generation — LIVE CAMERAS FOUNDATION checkpoint, same
 * pattern `generate-page-id.ts`/`generate-category-id.ts`/`generate-poi-id.ts`
 * already establish: a cryptographically random, URL-safe suffix, never
 * derived from client input.
 */
export function generateLiveCameraId(): LiveCameraId {
  return `${LIVE_CAMERA_ID_PREFIX}${randomBytes(15).toString('base64url')}` as LiveCameraId;
}

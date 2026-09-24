import type { LiveCameraStatus } from './enums.js';
import type { CustomerId, LiveCameraId, MapId } from './ids.js';
import type { LocalizedText } from './language.js';
import type { TranslationMetadata } from './translation.js';
import type { FirestoreTimestampLike } from './timestamp.js';

/**
 * LIVE CAMERAS FOUNDATION checkpoint — a Live Camera's translated fields.
 * Mirrors `PageTranslations`/`PoiTranslations`'s exact shape (./page.js,
 * ./poi.js): each translatable scalar field on `LiveCamera` gets one
 * optional key here, keyed by `PublicContentLanguage` via `LocalizedText`.
 */
export interface LiveCameraTranslations {
  readonly name?: LocalizedText;
  readonly description?: LocalizedText;
}

/**
 * A Live Camera's map position — the same plain `{latitude, longitude}`
 * shape `Poi.location` already establishes (./poi.js), not a Firestore
 * `GeoPoint` — reused here as its own named type since, unlike `Poi`, a
 * camera has no category/marker-icon relationship to also carry.
 */
export interface LiveCameraLocation {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * MANDATORY ARCHITECTURE CORRECTION 1/2 (LIVE CAMERAS FOUNDATION checkpoint
 * Phase B) — the ONLY streaming-related shape this checkpoint's data model
 * carries, and it is deliberately narrow:
 *
 * - `transport` is `'WEBRTC' | 'HLS' | 'YOUTUBE'` only. There is no `'TEST'` (or any
 *   other non-durable) transport member on this domain type — a
 *   deterministic/mock transport is a TESTING-ONLY concern, implemented
 *   entirely inside `apps/tourist-web`'s playback adapter layer, and never
 *   persisted to Firestore, a publication snapshot, or any validation
 *   schema. See `apps/tourist-web/lib/public-map/live-playback.ts`'s own
 *   doc comment for where the test adapter actually lives.
 * - `playbackUrl` is either a browser-safe relay endpoint or an official
 *   YouTube video URL — never a camera-source URL. It must never be an
 *   `rtsp://` URL, and must never embed a username/password
 *   (`packages/validation/src/live-camera.ts`'s `liveCameraPlaybackUrlSchema`
 *   is the actual enforcement point: rejects non-`https:` schemes,
 *   embedded credentials, and malformed URLs).
 *
 * This type says nothing at all about the private Axis/RTSP source that
 * feeds the relay — that configuration (RTSP URL, camera username/
 * password, private LAN address, provider identity) is explicitly OUT OF
 * SCOPE for this checkpoint and does not exist anywhere in this file, in
 * Firestore, or in any validation schema. A future dedicated, server-only
 * secret store (never a public/draft Firestore document a client schema
 * maps to) is the intended seam for that configuration — see this file's
 * own `LiveCamera.playback` doc comment for the TODO marking exactly where
 * that seam attaches.
 */
export type LiveCameraPlayback =
  | { readonly transport: 'WEBRTC'; readonly playbackUrl: string }
  | { readonly transport: 'HLS'; readonly playbackUrl: string }
  | { readonly transport: 'YOUTUBE'; readonly playbackUrl: string };

/**
 * `maps/{mapId}/liveCameras/{cameraId}` — LIVE CAMERAS FOUNDATION
 * checkpoint. A Live Camera is a first-class map content type, explicitly
 * NOT a `Poi`/`Page`/`Category`/Event/menu page: a POI answers "where is
 * this place?", a Page answers "what should the tourist read?", and a Live
 * Camera answers "what does this spot look like right now?" — it has its
 * own marker layer (`apps/tourist-web/lib/public-map/live-camera-marker-layer.ts`),
 * never mixed into `Poi[]`, and its own detail/playback experience, never
 * reusing `PoiDetailCard`'s markup module (though it deliberately reuses
 * the SAME `.poi-detail-card` responsive CSS contract — see that
 * component's own doc comment).
 *
 * `customerId`/`mapId` are stored explicitly (not merely implied by the
 * Firestore path) — the same defense-in-depth pattern `Category`/`Poi`/
 * `Page` already establish; both fields are written exclusively by trusted
 * backend code (`getOwnedMapContext()`-verified routes) and are never
 * derived from, or overwritable by, client input.
 *
 * `location` mirrors `Poi.location` — a camera IS placed on the map and
 * gets its own marker, unlike a `Page` (which has no location at all).
 *
 * `playback` is OPTIONAL and public-safe by construction (MANDATORY
 * ARCHITECTURE CORRECTION 1): a camera with no playback configuration is a
 * fully valid document — the public/admin UX shows a clean "Live stream is
 * not configured" state instead of fabricating a stream or a Play button.
 * TODO(future checkpoint): private Axis/RTSP source configuration (RTSP
 * URL, camera username/password, private LAN address) belongs in a
 * separate, server-only secret store keyed by `cameraId` — never as a field
 * on this type, never in Firestore under `maps/{mapId}/liveCameras/*`, and
 * never reachable through any Zod schema a client request body maps to.
 * This checkpoint deliberately does not implement that store; it only
 * reserves the seam by keeping this type's shape free of any such field.
 */
export interface LiveCamera {
  readonly cameraId: LiveCameraId;
  readonly customerId: CustomerId;
  readonly mapId: MapId;
  readonly name: string;
  /** See `LiveCameraTranslations`'s own doc comment above. */
  readonly translations?: LiveCameraTranslations;
  readonly translationMetadata?: TranslationMetadata;
  readonly description?: string;
  readonly location: LiveCameraLocation;
  readonly status: LiveCameraStatus;
  /** See `LiveCameraPlayback`'s own doc comment above — optional, public-safe, never a source/credential field. */
  readonly playback?: LiveCameraPlayback;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

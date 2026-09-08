/**
 * Photo Experience Prototype checkpoint — the ONE place `tourist-web`'s
 * browser code builds a URL for admin-web's public photo endpoints
 * (`GET /api/public/maps/{mapId}/pois/{poiId}/photo{,-meta}` —
 * apps/admin-web/app/api/public/maps/[mapId]/pois/[poiId]/photo/route.ts).
 *
 * Unlike `public-map-client.ts` (the SERVER-side snapshot fetch, keyed off
 * the server-only `ADMIN_PUBLIC_API_BASE_URL`), these two endpoints are
 * called directly from the BROWSER — `tourist-map.tsx` fetches `/photo`
 * bytes and inlines them into the marker SVG as a `data:` URI (see
 * `bytesToDataUri` below), and the POI detail card uses `/photo` as its
 * cover `<img src>` and fetches `/photo-meta` for the photo's author
 * attribution. So this reads the browser-visible
 * `NEXT_PUBLIC_ADMIN_PUBLIC_API_BASE_URL` instead (see
 * apps/tourist-web/.env.example's own comment for why that is a separate,
 * non-secret variable and not a reuse of `ADMIN_PUBLIC_API_BASE_URL`).
 *
 * When that variable is unset/blank — the deliberate local-dev / hermetic
 * E2E default — every function here returns `undefined`, and the callers
 * quietly render exactly what they rendered before this checkpoint (the
 * ordinary category marker, a detail card with no cover). No photo request
 * is ever attempted, no placeholder is ever shown. This mirrors the same
 * "feature quietly unavailable, map still renders" posture the app already
 * uses when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is absent.
 *
 * A pure module (no React, no side effects) so it is trivially unit
 * testable — `poi-photo-source.test.ts`.
 */

/** Marker thumbnails are small; ask Google (via the endpoint) for a correspondingly small image so the per-marker fetch stays cheap. */
export const MARKER_PHOTO_PX = 128;
/** The detail-card cover / gallery is a wide hero slot — a larger request, still bounded well under the endpoint's own `MAX_PHOTO_PX`. */
export const COVER_PHOTO_PX = 1200;
/** Mirrors admin-web's `MAX_GALLERY_PHOTOS` — the exclusive upper bound the public photo endpoints accept for `?index=`, and the most gallery slots the detail card will ever render. */
export const GALLERY_MAX_PHOTOS = 10;
/**
 * PROTOTYPE SAFETY CAP — the maximum number of POIs that get a fetched
 * marker photo per page load. The current marker path fetches + base64-
 * inlines every photo-eligible POI up front (no viewport / lazy strategy),
 * so each one costs a cross-origin fetch, two billed Google Places calls,
 * and ~2.7x its bytes retained as a `data:` string in JS state that is
 * never pruned. This flat cap bounds that blast radius for manager review;
 * POIs past the cap simply keep their ordinary category marker.
 * A production build must replace this with viewport/lazy loading — see the
 * checkpoint report's memory/performance section.
 */
export const MARKER_PHOTO_MAX = 24;

/**
 * Normalizes `NEXT_PUBLIC_ADMIN_PUBLIC_API_BASE_URL` to a usable origin, or
 * `undefined` when it is unset/blank. Trailing slashes are trimmed so the
 * `${base}/api/...` join never doubles up. The env var must be referenced
 * statically (not via a dynamic key) for Next's build-time inlining, so the
 * read itself stays at the call site and the raw value is passed in here.
 */
export function normalizePhotoApiBaseUrl(rawValue: string | undefined): string | undefined {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, '');
}

/** Options for the photo-URL builders. `maxPx` (photo only) bounds both image dimensions; `index` (default 0) picks which gallery photo. */
export interface PoiPhotoUrlOptions {
  readonly maxPx?: number;
  readonly index?: number;
}

function buildUrl(
  baseUrl: string | undefined,
  mapId: string,
  poiId: string,
  segment: 'photo' | 'photo-meta',
  options: PoiPhotoUrlOptions = {},
): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  const path = `${baseUrl}/api/public/maps/${encodeURIComponent(mapId)}/pois/${encodeURIComponent(poiId)}/${segment}`;
  const params = new URLSearchParams();
  if (options.index !== undefined && options.index > 0) {
    params.set('index', String(options.index));
  }
  if (segment === 'photo' && options.maxPx !== undefined) {
    params.set('maxWidthPx', String(options.maxPx));
    params.set('maxHeightPx', String(options.maxPx));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** The binary photo endpoint URL (streams image bytes) for one published POI, or `undefined` when no base URL is configured. */
export function buildPoiPhotoUrl(
  baseUrl: string | undefined,
  mapId: string,
  poiId: string,
  options: PoiPhotoUrlOptions = {},
): string | undefined {
  return buildUrl(baseUrl, mapId, poiId, 'photo', options);
}

/** The JSON photo-meta endpoint URL (per-photo author attribution + total `count`) for one published POI, or `undefined` when no base URL is configured. */
export function buildPoiPhotoMetaUrl(
  baseUrl: string | undefined,
  mapId: string,
  poiId: string,
  options: Pick<PoiPhotoUrlOptions, 'index'> = {},
): string | undefined {
  return buildUrl(baseUrl, mapId, poiId, 'photo-meta', options);
}

/** One credited author of a photo, as returned by `GET .../photo-meta` — mirrors admin-web's `ExternalPoiPhotoAttribution` (already normalized server-side). */
export interface PoiPhotoAttribution {
  readonly displayName: string;
  readonly uri?: string;
}

/** The shape `GET .../photo-meta` returns on success (`available: true`). Any non-2xx / `available: false` response means "no fresh photo at this index right now". `count` is the total resolvable photos (bounded by `GALLERY_MAX_PHOTOS`). */
export interface PoiPhotoMeta {
  readonly available: true;
  readonly count?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly attributions: readonly PoiPhotoAttribution[];
}

/**
 * Encodes fetched image bytes as a `data:` URI — Photo Experience Prototype
 * checkpoint.
 *
 * WHY this is necessary for the marker (and not for the detail-card cover):
 * the `'photo-pin'` marker embeds the photo via an SVG `<image>` element,
 * and that SVG is itself handed to Google Maps as a marker-icon image
 * (`data:image/svg+xml,...`). A browser rendering an SVG *as an image*
 * (`<img>`, CSS background, a Maps marker icon) runs it in "secure static"
 * mode, in which **external resource references do not load** — an
 * `<image href="https://.../photo">` would silently render nothing. A
 * `data:` URI is inline, not an external reference, so it renders. The
 * detail-card cover uses a real DOM `<img src>` and has no such restriction,
 * so it points straight at the endpoint URL.
 *
 * Returns `''` (falsy — caller falls back to the ordinary category marker)
 * for a non-image content type (defense in depth: never inline an
 * unexpected payload) or empty input.
 */
export function bytesToDataUri(bytes: Uint8Array, contentType: string): string {
  if (!contentType.toLowerCase().startsWith('image/')) {
    return '';
  }
  if (bytes.length === 0) {
    return '';
  }
  let binary = '';
  const CHUNK = 0x8000; // avoid a huge spread arg blowing the call stack on large images
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

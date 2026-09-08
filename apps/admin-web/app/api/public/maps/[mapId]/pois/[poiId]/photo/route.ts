import { NextResponse, type NextRequest } from 'next/server';
import { poiIdSchema } from 'validation';
import { MAX_GALLERY_PHOTOS } from '@/lib/pois/external-provider';
import { getExternalPoiProvider } from '@/lib/pois/provider-registry';
import { loadCurrentPublication } from '@/lib/tenant/load-current-publication';

/**
 * `GET /api/public/maps/{mapId}/pois/{poiId}/photo` — Photo Experience
 * Prototype checkpoint. Streams a fresh Google Places photo for ONE
 * published POI. This is the trusted server boundary the checkpoint
 * requires: the browser (tourist-web, hosted OR embedded — see this
 * route's CORS header below) calls this directly; `GOOGLE_PLACES_API_KEY`
 * never leaves this server, and no photo resource name/temporary
 * `photoUri`/redirected image URL is ever persisted anywhere — every
 * response is derived from a LIVE Google Places call made during THIS
 * request (see `GooglePlacesProvider.getPlacePhotoRef`/`getPlacePhotoMedia`
 * doc comments for the freshness contract).
 *
 * PUBLICATION-SCOPED, not draft-scoped (the checkpoint's own "critical"
 * invariant): this route resolves the requested POI's Google identity
 * EXCLUSIVELY from the CURRENT publication's server-only
 * `photoProviderRefs` map (`loadCurrentPublication()` —
 * lib/tenant/load-current-publication.ts), never from live `maps/{mapId}/
 * pois/{poiId}` draft Firestore data. A draft-only or unpublished-category
 * Google POI therefore has NO entry here and is indistinguishable from a
 * POI that does not exist at all — see `NOT_FOUND_RESPONSE` below and this
 * codebase's established anti-enumeration convention
 * (`GET /api/public/maps/[mapId]/route.ts`'s own doc comment). A later
 * Publish can add, remove, or change which POIs are photo-eligible; a
 * currently-live publication is never affected by a subsequent draft edit
 * until the NEXT Publish (draft/publish isolation, unchanged).
 *
 * CORS: `Access-Control-Allow-Origin: *`. This mirrors
 * `GET /api/public/maps/[mapId]`'s own "meant to be readable from any
 * origin" posture (see that route's doc comment) — that route has never
 * needed a CORS header because it is only ever called SERVER-SIDE
 * (tourist-web's Server Component, `lib/public-map/public-map-client.ts`).
 * THIS route is different: it is called directly from the BROWSER (an
 * `<img>`/`fetch` from tourist-web's client-side marker layer / detail
 * panel — see `apps/tourist-web/components/public-map/tourist-map.tsx`),
 * and per the EMBEDDABLE MAP requirement it must work identically whether
 * that browser is on the map's own hosted domain or embedded inside an
 * arbitrary client website — so, exactly like the CSP `frame-ancestors *`
 * decision in `apps/tourist-web/next.config.ts` (see that file's own doc
 * comment for the full reasoning), there is no fixed origin to allowlist
 * yet. This endpoint has no authenticated session and mutates nothing, so
 * a wildcard origin does not create a CSRF/session-hijack surface.
 *
 * `?index=N` (Photo Experience Prototype checkpoint, gallery expansion) —
 * which of the place's photos to stream; default `0` (the cover). Validated
 * to an integer in `[0, MAX_GALLERY_PHOTOS)`; anything else, and any index
 * at or beyond the place's actual photo count, collapses to the SAME
 * generic 404 as every other not-found here (no way to probe "how many
 * photos does this place have" beyond the bounded gallery cap).
 *
 * Failure handling — every one of these collapses to a generic response,
 * never a leaked Google error body/provider detail: malformed `mapId`/
 * `poiId`/`index`, unpublished/nonexistent map, POI not in the current
 * publication, POI in the publication but with no `photo` entry, no
 * configured provider, a live Google 404/expired photo resource, or any
 * other upstream failure.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string; readonly poiId: string }>;
}

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' } as const;
const NOT_FOUND_RESPONSE = { code: 'public-map/photo-not-found', message: 'No photo is available for this place.' } as const;

const DEFAULT_PHOTO_PX = 800;
const MIN_PHOTO_PX = 1;
const MAX_PHOTO_PX = 1600;

/** Clamps an untrusted `?maxWidthPx=`/`?maxHeightPx=` query value to a sane, bounded range — never trusts the caller for an unbounded Google-billed image request. */
function parsePixelDimension(rawValue: string | null): number {
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : DEFAULT_PHOTO_PX;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PHOTO_PX;
  }
  return Math.min(MAX_PHOTO_PX, Math.max(MIN_PHOTO_PX, parsed));
}

/** `?index=` → a validated gallery index, or `undefined` (→ caller returns the generic 404) for anything not an integer in `[0, MAX_GALLERY_PHOTOS)`. Absent → `0`. */
function parsePhotoIndex(rawValue: string | null): number | undefined {
  if (rawValue === null || rawValue === '') {
    return 0;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= MAX_GALLERY_PHOTOS) {
    return undefined;
  }
  return parsed;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { mapId, poiId } = await params;

  if (!poiIdSchema.safeParse(poiId).success) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const snapshot = await loadCurrentPublication(mapId);
  if (!snapshot) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const publishedPoi = snapshot.pois.find((poi) => poi.poiId === poiId);
  const providerRef = snapshot.photoProviderRefs?.[poiId];
  if (!publishedPoi?.photo?.available || !providerRef) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const provider = getExternalPoiProvider();
  if (!provider) {
    // Deliberately the SAME generic not-found response a real "no photo"
    // outcome gets — never a distinct "not configured" message, which
    // would leak operational detail to an unauthenticated public caller
    // (unlike the authenticated admin import route, which is allowed to
    // say so to a signed-in Client Admin).
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const photoIndex = parsePhotoIndex(request.nextUrl.searchParams.get('index'));
  if (photoIndex === undefined) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }
  const maxWidthPx = parsePixelDimension(request.nextUrl.searchParams.get('maxWidthPx'));
  const maxHeightPx = parsePixelDimension(request.nextUrl.searchParams.get('maxHeightPx'));

  try {
    const photoRef = (await provider.getPlacePhotoRefs(providerRef.providerPlaceId))[photoIndex];
    if (!photoRef) {
      return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
    }

    const media = await provider.getPlacePhotoMedia(photoRef.name, { maxWidthPx, maxHeightPx });
    if (!media) {
      return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
    }

    return new NextResponse(Buffer.from(media.bytes), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        // `media.contentType` is guaranteed `image/*` by the provider
        // (`GooglePlacesProvider.getPlacePhotoMedia` returns `undefined` for
        // anything else); `nosniff` stops a browser from ever
        // re-interpreting these proxied bytes as anything other than the
        // declared image type.
        'Content-Type': media.contentType,
        'X-Content-Type-Options': 'nosniff',
        // No application/proxy caching of the proxied Google image bytes.
        // This implementation has no official Google Places Photos
        // documentation on hand stating what caching (if any) is permitted
        // for photo media, so it takes the conservative path: the response
        // is not stored by the browser or any shared cache, and every
        // request re-resolves the photo live via a fresh Places call (see
        // `getPlacePhotoRef` / `getPlacePhotoMedia`). Revisit only with a
        // cited allowance from current official Google documentation.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    // Never leak the underlying Google error (may include account/billing
    // detail) to a public, unauthenticated caller.
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

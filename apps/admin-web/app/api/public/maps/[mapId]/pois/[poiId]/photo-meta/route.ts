import { NextResponse, type NextRequest } from 'next/server';
import { poiIdSchema } from 'validation';
import { MAX_GALLERY_PHOTOS } from '@/lib/pois/external-provider';
import { getExternalPoiProvider } from '@/lib/pois/provider-registry';
import { loadCurrentPublication } from '@/lib/tenant/load-current-publication';

/**
 * `GET /api/public/maps/{mapId}/pois/{poiId}/photo-meta` — Photo Experience
 * Prototype checkpoint, ARCHITECTURAL CORRECTION #2 (attribution). A
 * companion to the sibling `photo/route.ts` binary endpoint: that route
 * streams image BYTES (so a plain `<img src>` can use it directly); this
 * one returns the JSON metadata a bare `<img>` tag cannot expose —
 * specifically each photo's author attribution and the total photo `count`
 * — fetched from the SAME kind of fresh, live Google Places response (one
 * Details call, no image bytes). Google Places photos carry
 * `authorAttributions` that are meant to be shown wherever the photo is
 * displayed; this endpoint is what lets
 * `apps/tourist-web/components/public-map/poi-detail-card.tsx` render that
 * credit per photo, using ONLY what this fresh response actually returned
 * (never inventing/assuming attribution text).
 *
 * `?index=N` (gallery expansion) — which photo's metadata to return;
 * default `0`. `count` is the total resolvable photos (bounded by
 * `MAX_GALLERY_PHOTOS`) so the client can render a dot/count indicator and
 * lazy-load only the photos actually viewed. Validated to an integer in
 * `[0, MAX_GALLERY_PHOTOS)`; anything else, and any index at/beyond the
 * actual count, returns the same generic `{ available: false }` 404.
 *
 * Shares the exact same publication-scoped lookup, anti-enumeration
 * semantics, and CORS posture as `photo/route.ts` — see that file's own
 * doc comment for the full reasoning (not repeated here).
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string; readonly poiId: string }>;
}

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' } as const;
// `available: true` responses carry attribution derived from a LIVE Google
// Places call; like the sibling `photo/route.ts`, this implementation has no
// official Google documentation on hand permitting caching of that data, so
// every response is marked non-storable and re-resolved per request.
const NO_STORE_HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'private, no-store' } as const;
const NOT_AVAILABLE_RESPONSE = { available: false } as const;

/** `?index=` → a validated gallery index, or `undefined` (→ generic 404) for anything not an integer in `[0, MAX_GALLERY_PHOTOS)`. Absent → `0`. Mirrors `photo/route.ts`. */
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
    return NextResponse.json(NOT_AVAILABLE_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const photoIndex = parsePhotoIndex(request.nextUrl.searchParams.get('index'));
  if (photoIndex === undefined) {
    return NextResponse.json(NOT_AVAILABLE_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const snapshot = await loadCurrentPublication(mapId);
  if (!snapshot) {
    return NextResponse.json(NOT_AVAILABLE_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const publishedPoi = snapshot.pois.find((poi) => poi.poiId === poiId);
  const providerRef = snapshot.photoProviderRefs?.[poiId];
  if (!publishedPoi?.photo?.available || !providerRef) {
    return NextResponse.json(NOT_AVAILABLE_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  const provider = getExternalPoiProvider();
  if (!provider) {
    return NextResponse.json(NOT_AVAILABLE_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }

  try {
    const photoRefs = await provider.getPlacePhotoRefs(providerRef.providerPlaceId);
    const photoRef = photoRefs[photoIndex];
    if (!photoRef) {
      return NextResponse.json(NOT_AVAILABLE_RESPONSE, { status: 404, headers: CORS_HEADERS });
    }

    return NextResponse.json(
      {
        available: true,
        // Total resolvable photos (already bounded by MAX_GALLERY_PHOTOS in
        // the adapter) — lets the client render a dot/count indicator and
        // lazy-load only the photos actually navigated to.
        count: photoRefs.length,
        ...(photoRef.widthPx !== undefined ? { widthPx: photoRef.widthPx } : {}),
        ...(photoRef.heightPx !== undefined ? { heightPx: photoRef.heightPx } : {}),
        // Google's own `authorAttributions` array for THIS photo, verbatim
        // (already normalized by the provider adapter) — never invented,
        // never defaulted to a placeholder credit when Google returns none.
        attributions: photoRef.attributions,
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(NOT_AVAILABLE_RESPONSE, { status: 404, headers: CORS_HEADERS });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

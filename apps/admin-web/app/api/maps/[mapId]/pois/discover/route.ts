import { NextResponse, type NextRequest } from 'next/server';
import { categorySchema, externalPoiCandidateSchema, poiDiscoverInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { resolveCategoryCapability } from '@/lib/tenant/category-capabilities';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { getExternalPoiProvider } from '@/lib/pois/provider-registry';
import type { ExternalPoiCandidate, ExternalPoiLocation } from '@/lib/pois/external-provider';

/**
 * `POST /api/maps/{mapId}/pois/discover` — checkpoint 1B.6, replacing
 * checkpoint 1B.4's `/api/map/pois/discover`. Same trusted-mutation
 * boundary; the one behavioral change this checkpoint makes (§9) is that
 * the search center is now resolved from the EXPLICITLY REQUESTED map's own
 * `area.center` — never a single implicit tenant map — so discovering
 * places for `map_shinjuku` and `map_osaka` correctly searches around each
 * map's own configured location, not whichever map happened to load first.
 * The provider/category-capability logic itself
 * (`lib/tenant/category-capabilities.ts`) stays global and map-agnostic,
 * unchanged — only the geography is per-map.
 */

// An arbitrary, harmless fallback viewport, used ONLY when the requested
// map has no configured `area.center` at all — same value, and the same
// "independent constant, never used when a real center IS configured"
// reasoning, as `pois-manager.tsx`'s own `FALLBACK_CENTER` and
// `google-maps-preview.tsx`'s `DEFAULT_CENTER`.
const FALLBACK_DISCOVERY_CENTER: ExternalPoiLocation = { latitude: 35.6812, longitude: 139.7671 };

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  if (result.context.identity.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can search for places.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = poiDiscoverInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check your search and try again.' }, { status: 400 });
  }

  const resolvedMapId = result.context.map.mapId;
  const firestore = getFirebaseAdminFirestore();

  const categorySnap = await firestore.doc(`maps/${resolvedMapId}/categories/${parsed.data.categoryId}`).get();
  if (!categorySnap.exists) {
    return NextResponse.json({ code: 'map/invalid-category', message: 'Select a valid category for this map.' }, { status: 400 });
  }
  const category = categorySchema.safeParse(categorySnap.data());
  if (!category.success) {
    return NextResponse.json({ code: 'map/invalid-category', message: 'Select a valid category for this map.' }, { status: 400 });
  }

  const capability = resolveCategoryCapability({ platformCategoryId: category.data.platformCategoryId });
  if (!capability || !capability.allowedSources.includes('GOOGLE_PLACES') || !capability.googlePlaces) {
    return NextResponse.json(
      { code: 'map/category-not-google-places-eligible', message: 'This category is not linked to a Google Places-eligible platform category.' },
      { status: 400 },
    );
  }

  const provider = getExternalPoiProvider();
  if (!provider) {
    return NextResponse.json(
      { code: 'map/external-provider-unavailable', message: 'Google Places is not configured for this environment.' },
      { status: 503 },
    );
  }

  // §9: center is always resolved from THIS specific map's own configured
  // area — never a client-supplied coordinate, and never a different map's
  // center. Two maps belonging to the same tenant with different `area`
  // configurations correctly get different discovery geography.
  const center: ExternalPoiLocation = result.context.map.area.center
    ? { latitude: result.context.map.area.center.lat, longitude: result.context.map.area.center.lng }
    : FALLBACK_DISCOVERY_CENTER;

  let candidates: readonly ExternalPoiCandidate[];
  try {
    candidates = await provider.discoverNearby({
      center,
      radiusMeters: parsed.data.radiusMeters,
      includedTypes: capability.googlePlaces.includedTypes,
    });
  } catch {
    return NextResponse.json(
      { code: 'map/external-provider-error', message: 'Could not search nearby places right now. Please try again.' },
      { status: 502 },
    );
  }

  const safeCandidates = candidates.flatMap((candidate) => {
    const parsedCandidate = externalPoiCandidateSchema.safeParse(candidate);
    return parsedCandidate.success ? [parsedCandidate.data] : [];
  });

  return NextResponse.json({ candidates: safeCandidates });
}

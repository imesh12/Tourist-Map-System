import { NextResponse, type NextRequest } from 'next/server';
import { categorySchema, externalPoiCandidateSchema, poiDiscoverInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { resolveCategoryCapability } from '@/lib/tenant/category-capabilities';
import { getCurrentClientContext } from '@/lib/tenant/client-context';
import { getExternalPoiProvider } from '@/lib/pois/provider-registry';
import type { ExternalPoiCandidate, ExternalPoiLocation } from '@/lib/pois/external-provider';

/**
 * `POST /api/map/pois/discover` — checkpoint 1B.4, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md §11. Same trusted-mutation-
 * boundary shape every other `/api/map/*` route establishes (origin check →
 * `getCurrentClientContext()` → role check → `.strict()` Zod input → Firestore
 * ownership/existence verification), even though this route never itself
 * writes to Firestore — it still calls a billable external API on the
 * tenant's behalf, so the same untrusted-input discipline applies.
 *
 * Read-only against Firestore (one category lookup); the actual search is
 * delegated to whichever `ExternalPoiProvider` `getExternalPoiProvider()`
 * resolves (../../../../../lib/pois/provider-registry.ts) — this route
 * never imports `GooglePlacesProvider` directly.
 */

// An arbitrary, harmless fallback viewport, used ONLY when this tenant's map
// has no configured `area.center` at all — same value, and the same
// "independent constant, never used when a real center IS configured"
// reasoning, as `pois-manager.tsx`'s own `FALLBACK_CENTER` (checkpoint
// 1B.3) and `google-maps-preview.tsx`'s `DEFAULT_CENTER`.
const FALLBACK_DISCOVERY_CENTER: ExternalPoiLocation = { latitude: 35.6812, longitude: 139.7671 };

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const result = await getCurrentClientContext();
  if (!result.ok) {
    return NextResponse.json(
      { code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' },
      { status: 401 },
    );
  }

  // Same write policy as manual POI creation (checkpoint 1B.3): CLIENT_ADMIN
  // only. Discovery doesn't write to Firestore, but it does spend the
  // tenant's Google Places quota/budget, which is exactly the kind of
  // action this project's existing CLIENT_ADMIN-only write boundary already
  // exists to gate.
  if (result.context.role !== 'CLIENT_ADMIN') {
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

  const mapId = result.context.map.mapId;
  const firestore = getFirebaseAdminFirestore();

  // §"never trust categoryId merely because it's well-formed" — same rule
  // `POST /api/map/pois` already enforces for manual creation.
  const categorySnap = await firestore.doc(`maps/${mapId}/categories/${parsed.data.categoryId}`).get();
  if (!categorySnap.exists) {
    return NextResponse.json({ code: 'map/invalid-category', message: 'Select a valid category for this map.' }, { status: 400 });
  }
  const category = categorySchema.safeParse(categorySnap.data());
  if (!category.success) {
    // Malformed stored data — fail closed rather than trusting a category
    // document we can't validate the shape of.
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

  // Center is always server-resolved from the tenant's OWN map — never a
  // client-supplied coordinate (see `poiDiscoverInputSchema`'s own doc
  // comment). Prefers the map's real configured center; the fallback below
  // is only ever reached for a fully UNBOUNDED map with no viewport ever
  // saved in Map Settings.
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
    // Never leak the provider's own error detail (may include
    // account/billing/quota information) to the browser.
    return NextResponse.json(
      { code: 'map/external-provider-error', message: 'Could not search nearby places right now. Please try again.' },
      { status: 502 },
    );
  }

  // Defense-in-depth: re-validate every candidate before it ever reaches the
  // browser — skip (never crash the whole request on) a malformed one,
  // mirroring `load-pois.ts`/`load-categories.ts`'s existing convention.
  const safeCandidates = candidates.flatMap((candidate) => {
    const parsedCandidate = externalPoiCandidateSchema.safeParse(candidate);
    return parsedCandidate.success ? [parsedCandidate.data] : [];
  });

  return NextResponse.json({ candidates: safeCandidates });
}

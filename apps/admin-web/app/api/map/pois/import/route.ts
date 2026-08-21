import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { categorySchema, poiImportInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getExternalPoiProvider } from '@/lib/pois/provider-registry';
import type { ExternalPoiDetails } from '@/lib/pois/external-provider';
import { resolveCategoryCapability } from '@/lib/tenant/category-capabilities';
import { getCurrentClientContext } from '@/lib/tenant/client-context';
import { generatePoiId } from '@/lib/tenant/generate-poi-id';
import { isLocationWithinBounds } from '@/lib/tenant/poi-bounds';

/**
 * `POST /api/map/pois/import` — checkpoint 1B.4, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md §11. Mirrors
 * `POST /api/map/pois`'s trusted-mutation shape (origin → session → role →
 * `.strict()` input → category-ownership verify → bounds check → write), but
 * writes a `sourceType: 'GOOGLE_PLACES'` POI instead of `CLIENT_CUSTOM` —
 * still the exact same `maps/{mapId}/pois/{poiId}` collection, no new
 * Firestore path.
 *
 * The input is deliberately minimal (`categoryId`, `provider`,
 * `providerPlaceId` only) — `name`/`address`/coordinates are NEVER accepted
 * from the browser here. This route re-resolves the authoritative place
 * details itself, from `providerPlaceId` alone, via
 * `provider.getPlaceDetails()` — a browser could otherwise display a
 * discovery result, let the user tamper with it in devtools, and "import"
 * fabricated content under a legitimate-looking `providerPlaceId`.
 */
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

  if (result.context.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can import places.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = poiImportInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check your request and try again.' }, { status: 400 });
  }

  const mapId = result.context.map.mapId;
  const firestore = getFirebaseAdminFirestore();

  const categorySnap = await firestore.doc(`maps/${mapId}/categories/${parsed.data.categoryId}`).get();
  if (!categorySnap.exists) {
    return NextResponse.json({ code: 'map/invalid-category', message: 'Select a valid category for this map.' }, { status: 400 });
  }
  const category = categorySchema.safeParse(categorySnap.data());
  if (!category.success) {
    return NextResponse.json({ code: 'map/invalid-category', message: 'Select a valid category for this map.' }, { status: 400 });
  }

  const capability = resolveCategoryCapability({ platformCategoryId: category.data.platformCategoryId });
  if (!capability || !capability.allowedSources.includes('GOOGLE_PLACES')) {
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

  let details: ExternalPoiDetails | undefined;
  try {
    details = await provider.getPlaceDetails(parsed.data.providerPlaceId);
  } catch {
    return NextResponse.json(
      { code: 'map/external-provider-error', message: 'Could not import this place right now. Please try again.' },
      { status: 502 },
    );
  }
  if (!details) {
    return NextResponse.json({ code: 'map/place-not-found', message: 'This place could not be found.' }, { status: 404 });
  }

  const location = { latitude: details.location.latitude, longitude: details.location.longitude };
  const area = result.context.map.area;
  if (area.type === 'BOUNDED' && area.bounds && !isLocationWithinBounds(location, area.bounds)) {
    return NextResponse.json(
      { code: 'map/out-of-bounds', message: 'This place is outside the map’s configured area.' },
      { status: 400 },
    );
  }

  const poisRef = firestore.collection(`maps/${mapId}/pois`);

  try {
    const poiId = await firestore.runTransaction(async (transaction) => {
      // Duplicate-import protection (§"duplicate-import protection"),
      // enforced server-side inside a transaction so two concurrent imports
      // of the same place can never both succeed — pure-equality compound
      // query, no composite Firestore index required.
      const dupSnap = await transaction.get(
        poisRef.where('provider', '==', parsed.data.provider).where('providerPlaceId', '==', parsed.data.providerPlaceId).limit(1),
      );
      if (!dupSnap.empty) {
        throw new DuplicateImportError();
      }

      const newPoiId = generatePoiId();
      transaction.set(poisRef.doc(newPoiId), {
        poiId: newPoiId,
        customerId: result.context.map.customerId,
        mapId,
        categoryId: parsed.data.categoryId,
        name: details.name,
        location,
        ...(details.address ? { address: details.address } : {}),
        sourceType: 'GOOGLE_PLACES',
        provider: parsed.data.provider,
        providerPlaceId: parsed.data.providerPlaceId,
        status: 'ENABLED',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return newPoiId;
    });

    return NextResponse.json({ ok: true, poiId }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateImportError) {
      return NextResponse.json(
        { code: 'map/duplicate-import', message: 'This place has already been imported.' },
        { status: 409 },
      );
    }
    throw error;
  }
}

class DuplicateImportError extends Error {}

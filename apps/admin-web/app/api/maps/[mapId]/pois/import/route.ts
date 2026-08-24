import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { categorySchema, poiImportInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getExternalPoiProvider } from '@/lib/pois/provider-registry';
import type { ExternalPoiDetails } from '@/lib/pois/external-provider';
import { resolveCategoryCapability } from '@/lib/tenant/category-capabilities';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { generatePoiId } from '@/lib/tenant/generate-poi-id';
import { isLocationWithinBounds } from '@/lib/tenant/poi-bounds';

/**
 * `POST /api/maps/{mapId}/pois/import` — checkpoint 1B.6, replacing
 * checkpoint 1B.4's `/api/map/pois/import`. Same trusted-mutation shape
 * (minimal input, server re-resolves authoritative place details itself —
 * see the 1B.4 doc comment this one is based on).
 *
 * §9: duplicate-import protection stays scoped to the EXPLICITLY REQUESTED
 * map only — the compound `provider`+`providerPlaceId` query below runs
 * against `maps/{resolvedMapId}/pois`, so the same real-world Google place
 * can legitimately be imported into two different maps belonging to the
 * same tenant (e.g. a chain restaurant with a Shinjuku location AND an
 * Osaka location, or the same place deliberately added to both a tenant's
 * maps) without either import blocking the other.
 */

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

  const poisRef = firestore.collection(`maps/${resolvedMapId}/pois`);

  try {
    const poiId = await firestore.runTransaction(async (transaction) => {
      // Duplicate-import protection, scoped to THIS map's own `pois`
      // subcollection only — see the file header comment for why the same
      // place can legitimately be imported into two different maps.
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
        mapId: resolvedMapId,
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

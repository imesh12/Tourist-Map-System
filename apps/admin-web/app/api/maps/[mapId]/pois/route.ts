import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { poiCreateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { generatePoiId } from '@/lib/tenant/generate-poi-id';
import { loadTenantPois } from '@/lib/tenant/load-pois';
import { isLocationWithinBounds } from '@/lib/tenant/poi-bounds';

/**
 * `GET`/`POST /api/maps/{mapId}/pois` — checkpoint 1B.6, replacing
 * checkpoint 1B.3's `/api/map/pois`. Same trusted-mutation shape as
 * `app/api/maps/[mapId]/categories/route.ts`, moved onto explicit
 * `mapId`-in-the-URL.
 *
 * Writes `maps/{mapId}/pois/*` directly — draft content, unchanged.
 *
 * Checkpoint 1B.8 repair round: `POST` runs its whole body inside a
 * top-level try/catch, same hardening and reasoning as
 * `pois/discover/route.ts`'s file header comment.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  const pois = await loadTenantPois(result.context.map.mapId);
  return NextResponse.json({ pois });
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
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
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can create POIs.' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
    }

    const parsed = poiCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the POI and try again.' }, { status: 400 });
    }

    const firestore = getFirebaseAdminFirestore();
    const resolvedMapId = result.context.map.mapId;

    // §6/§10: never trust categoryId merely because it's well-formed — it
    // must reference a category that exists under THIS already-verified map,
    // never a category from a different map (even one belonging to the same
    // tenant).
    const categorySnap = await firestore.doc(`maps/${resolvedMapId}/categories/${parsed.data.categoryId}`).get();
    if (!categorySnap.exists) {
      return NextResponse.json(
        { code: 'map/invalid-category', message: 'Select a valid category for this map.' },
        { status: 400 },
      );
    }

    const location = { latitude: parsed.data.latitude, longitude: parsed.data.longitude };

    const area = result.context.map.area;
    if (area.type === 'BOUNDED' && area.bounds && !isLocationWithinBounds(location, area.bounds)) {
      return NextResponse.json(
        { code: 'map/out-of-bounds', message: 'This location is outside the map’s configured area.' },
        { status: 400 },
      );
    }

    const poiId = generatePoiId();
    await firestore.doc(`maps/${resolvedMapId}/pois/${poiId}`).set({
      poiId,
      customerId: result.context.map.customerId,
      mapId: resolvedMapId,
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      location,
      ...(parsed.data.address ? { address: parsed.data.address } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      sourceType: 'CLIENT_CUSTOM',
      status: parsed.data.status ?? 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, poiId }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pois.create.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { poiCreateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getCurrentClientContext } from '@/lib/tenant/client-context';
import { generatePoiId } from '@/lib/tenant/generate-poi-id';
import { loadTenantPois } from '@/lib/tenant/load-pois';
import { isLocationWithinBounds } from '@/lib/tenant/poi-bounds';

/**
 * `GET`/`POST /api/map/pois` — checkpoint 1B.3, same trusted-mutation shape
 * `app/api/map/categories/route.ts` established: origin-checked
 * state-changing requests, session-verified via `getCurrentClientContext()`,
 * target resolved exclusively from the verified session's own tenant
 * context — never a client-supplied `mapId`/`customerId`.
 *
 * This writes `maps/{mapId}/pois/*` directly — draft content, same as
 * categories; nothing here is published or visible to any public/tourist
 * surface.
 */

export async function GET(): Promise<NextResponse> {
  const result = await getCurrentClientContext();
  if (!result.ok) {
    return NextResponse.json(
      { code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' },
      { status: 401 },
    );
  }

  const pois = await loadTenantPois(result.context.map.mapId);
  return NextResponse.json({ pois });
}

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

  // Same write policy as categories (checkpoint 1B.2): CLIENT_ADMIN only.
  if (result.context.role !== 'CLIENT_ADMIN') {
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
  const mapId = result.context.map.mapId;

  // §6: never trust categoryId merely because the browser supplied a
  // well-formed one — it must reference a category that actually exists
  // under THIS authenticated map. A category from another tenant's map is
  // not merely "denied by a check" but a different, unreachable Firestore
  // path, the same structural guarantee category ownership checks rely on.
  const categorySnap = await firestore.doc(`maps/${mapId}/categories/${parsed.data.categoryId}`).get();
  if (!categorySnap.exists) {
    return NextResponse.json(
      { code: 'map/invalid-category', message: 'Select a valid category for this map.' },
      { status: 400 },
    );
  }

  const location = { latitude: parsed.data.latitude, longitude: parsed.data.longitude };

  // §16: a BOUNDED map rejects POIs outside its configured area — enforced
  // here server-side (the authoritative check); any client-side check in
  // the drawer is a UX convenience only.
  const area = result.context.map.area;
  if (area.type === 'BOUNDED' && area.bounds && !isLocationWithinBounds(location, area.bounds)) {
    return NextResponse.json(
      { code: 'map/out-of-bounds', message: 'This location is outside the map’s configured area.' },
      { status: 400 },
    );
  }

  const poiId = generatePoiId();
  await firestore.doc(`maps/${mapId}/pois/${poiId}`).set({
    poiId,
    customerId: result.context.map.customerId,
    mapId,
    categoryId: parsed.data.categoryId,
    name: parsed.data.name,
    location,
    ...(parsed.data.address ? { address: parsed.data.address } : {}),
    ...(parsed.data.description ? { description: parsed.data.description } : {}),
    // Every POI this route creates is client-authored — there is no
    // Google Places sync in this codebase yet (see shared-types'
    // `PoiSourceType`). Set explicitly by trusted server code, never from
    // `parsed.data` — `poiCreateInputSchema` has no `sourceType` field to
    // begin with.
    sourceType: 'CLIENT_CUSTOM',
    status: parsed.data.status ?? 'ENABLED',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, poiId }, { status: 201 });
}

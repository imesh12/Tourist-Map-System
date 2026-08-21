import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { poiSchema, poiUpdateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getCurrentClientContext } from '@/lib/tenant/client-context';
import { isLocationWithinBounds } from '@/lib/tenant/poi-bounds';

/**
 * `PATCH`/`DELETE /api/map/pois/{poiId}` — checkpoint 1B.3, mirrors
 * `app/api/map/categories/[categoryId]/route.ts`'s trusted-mutation shape.
 *
 * `poiId` from the URL is treated only as a resource *lookup* key — never
 * as authorization by itself. The document is always read from
 * `maps/{sessionMapId}/pois/{poiId}`, where `sessionMapId` comes exclusively
 * from the verified session's tenant context, so a POI belonging to a
 * different tenant's map is a different, unreachable Firestore path.
 *
 * Deletion is a HARD delete (§9) — no existing project convention
 * establishes a soft-delete/archive pattern for any document type yet
 * (categories don't have one either), so this does not invent one. A
 * disabled POI (via PATCH `status: 'DISABLED'`) is how "hide without
 * deleting" is expressed; DELETE is the deliberate, confirmed, permanent
 * removal action.
 */

interface RouteParams {
  readonly params: Promise<{ readonly poiId: string }>;
}

async function loadOwnedPoi(mapId: string, poiId: string) {
  const firestore = getFirebaseAdminFirestore();
  const poiRef = firestore.doc(`maps/${mapId}/pois/${poiId}`);
  const snapshot = await poiRef.get();
  if (!snapshot.exists) {
    return { ref: poiRef, existing: undefined };
  }
  const existing = poiSchema.safeParse(snapshot.data());
  if (!existing.success) {
    // Malformed stored data — fail closed rather than editing/deleting a
    // document we can't trust the shape of.
    return { ref: poiRef, existing: undefined };
  }
  return { ref: poiRef, existing: existing.data };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can edit POIs.' }, { status: 403 });
  }

  const { poiId } = await params;
  const mapId = result.context.map.mapId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = poiUpdateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the POI and try again.' }, { status: 400 });
  }

  const { ref: poiRef, existing } = await loadOwnedPoi(mapId, poiId);
  if (!existing) {
    return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
  }

  // Defense-in-depth ownership re-check, structurally redundant with the
  // tenant-scoped path above — same pattern the category PATCH route uses.
  if (existing.customerId !== result.context.map.customerId || existing.mapId !== mapId) {
    return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
  }

  // Checkpoint 1B.4: an imported (`GOOGLE_PLACES`) POI's content is owned by
  // the external source, re-resolved authoritatively at import time
  // (`POST /api/map/pois/import`) — its `name`/`categoryId`/`location`/
  // `address`/`description` are never editable through this endpoint, only
  // `status` (enable/disable). `poiUpdateInputSchema` itself has no
  // `sourceType`/`provider`/`providerPlaceId` fields at all (so those can
  // never be touched by either kind of POI), but it CAN'T know which POI a
  // given request targets, so the "which OTHER fields are allowed" check has
  // to live here, once the target's own stored `sourceType` is known.
  if (existing.sourceType === 'GOOGLE_PLACES') {
    const attemptedFields = Object.keys(parsed.data).filter((key) => key !== 'status');
    if (attemptedFields.length > 0) {
      return NextResponse.json(
        { code: 'map/external-poi-immutable-fields', message: 'Only the status of an imported Google Places POI can be changed here.' },
        { status: 400 },
      );
    }
  }

  const firestore = getFirebaseAdminFirestore();

  if (parsed.data.categoryId !== undefined) {
    const categorySnap = await firestore.doc(`maps/${mapId}/categories/${parsed.data.categoryId}`).get();
    if (!categorySnap.exists) {
      return NextResponse.json(
        { code: 'map/invalid-category', message: 'Select a valid category for this map.' },
        { status: 400 },
      );
    }
  }

  const nextLocation =
    parsed.data.latitude !== undefined && parsed.data.longitude !== undefined
      ? { latitude: parsed.data.latitude, longitude: parsed.data.longitude }
      : undefined;

  // §16, enforced on update too: a moved POI must still respect a BOUNDED
  // map's configured area.
  if (nextLocation) {
    const area = result.context.map.area;
    if (area.type === 'BOUNDED' && area.bounds && !isLocationWithinBounds(nextLocation, area.bounds)) {
      return NextResponse.json(
        { code: 'map/out-of-bounds', message: 'This location is outside the map’s configured area.' },
        { status: 400 },
      );
    }
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.categoryId !== undefined) update.categoryId = parsed.data.categoryId;
  if (nextLocation) update.location = nextLocation;
  if (parsed.data.address !== undefined) update.address = parsed.data.address;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;

  await poiRef.update(update);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can delete POIs.' }, { status: 403 });
  }

  const { poiId } = await params;
  const mapId = result.context.map.mapId;

  const { ref: poiRef, existing } = await loadOwnedPoi(mapId, poiId);
  if (!existing) {
    return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
  }

  if (existing.customerId !== result.context.map.customerId || existing.mapId !== mapId) {
    return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
  }

  await poiRef.delete();

  return NextResponse.json({ ok: true });
}

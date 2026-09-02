import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isTranslationsWithinSupportedLanguages, poiSchema, poiUpdateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { isLocationWithinBounds } from '@/lib/tenant/poi-bounds';

/**
 * `PATCH`/`DELETE /api/maps/{mapId}/pois/{poiId}` — checkpoint 1B.6,
 * replacing checkpoint 1B.3/1B.4's `/api/map/pois/{poiId}`. Mirrors
 * `app/api/maps/[mapId]/categories/[categoryId]/route.ts`'s trusted-mutation
 * shape.
 *
 * `poiId` is a resource lookup key only — the document is always read from
 * `maps/{verifiedMapId}/pois/{poiId}`, where `verifiedMapId` comes from
 * `getOwnedMapContext()`, so a POI belonging to a different map (§10 — even
 * one owned by the same tenant) is a different, unreachable Firestore path.
 *
 * Checkpoint 1B.8 repair round: both `PATCH` and `DELETE` below now run
 * their whole body inside a top-level try/catch, same hardening and same
 * reasoning as `pois/discover/route.ts`'s file header comment — an uncaught
 * exception must never escape a JSON API route as an HTML error page.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string; readonly poiId: string }>;
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
    return { ref: poiRef, existing: undefined };
  }
  return { ref: poiRef, existing: existing.data };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!isTrustedOrigin(request)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
    }

    const { mapId, poiId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    if (result.context.identity.role !== 'CLIENT_ADMIN') {
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can edit POIs.' }, { status: 403 });
    }

    const resolvedMapId = result.context.map.mapId;

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

    // checkpoint 1B.17B §10/§13 — see `categories/route.ts`'s own doc comment.
    if (!isTranslationsWithinSupportedLanguages(parsed.data.translations, result.context.map.enabledLanguages)) {
      return NextResponse.json(
        { code: 'map/unsupported-language', message: 'One or more translations use a language this map does not support.' },
        { status: 400 },
      );
    }

    const { ref: poiRef, existing } = await loadOwnedPoi(resolvedMapId, poiId);
    if (!existing) {
      return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
    }

    if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
      return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
    }

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
      const categorySnap = await firestore.doc(`maps/${resolvedMapId}/categories/${parsed.data.categoryId}`).get();
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
    // checkpoint 1B.17B §9/§10 — full-replace semantics, same convention
    // `categories/[categoryId]/route.ts`'s own doc comment documents. Never
    // reached for a `GOOGLE_PLACES` POI in practice — the
    // `map/external-poi-immutable-fields` check above already rejects any
    // request that includes `translations` for one.
    if (parsed.data.translations !== undefined) {
      update.translations = Object.keys(parsed.data.translations).length > 0 ? parsed.data.translations : FieldValue.delete();
    }

    await poiRef.update(update);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pois.patch.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!isTrustedOrigin(request)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
    }

    const { mapId, poiId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    if (result.context.identity.role !== 'CLIENT_ADMIN') {
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can delete POIs.' }, { status: 403 });
    }

    const resolvedMapId = result.context.map.mapId;
    const { ref: poiRef, existing } = await loadOwnedPoi(resolvedMapId, poiId);
    if (!existing) {
      return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
    }

    if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
      return NextResponse.json({ code: 'map/not-found', message: 'POI not found.' }, { status: 404 });
    }

    await poiRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pois.delete.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

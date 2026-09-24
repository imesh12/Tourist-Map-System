import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isTranslationsWithinSupportedLanguages, liveCameraSchema, liveCameraUpdateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * `PATCH`/`DELETE /api/maps/{mapId}/cameras/{cameraId}` — LIVE CAMERAS
 * FOUNDATION checkpoint, mirrors `app/api/maps/[mapId]/pages/[pageId]/route.ts`'s
 * trusted-mutation shape (including its top-level try/catch hardening and
 * its `loadOwned*` double-check-ownership-after-fetch helper pattern).
 *
 * `cameraId` is a resource lookup key only — the document is always read
 * from `maps/{verifiedMapId}/liveCameras/{cameraId}`, where `verifiedMapId`
 * comes from `getOwnedMapContext()`, so a camera belonging to a different
 * map (even one owned by the same tenant) is a different, unreachable
 * Firestore path.
 *
 * DELETION POLICY — unlike a Page (which can be referenced by a `PAGE` menu
 * item), nothing else in this codebase references a `cameraId` yet, so an
 * outright delete is always safe: no "in use" check is needed.
 *
 * `playback: null` in the PATCH body is the explicit "clear the playback
 * configuration back to Not Configured" signal — see
 * `liveCameraUpdateInputSchema`'s own doc comment (packages/validation/src/
 * live-camera.ts). No RTSP URL / camera username / camera password /
 * private LAN-address field is ever accepted here.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string; readonly cameraId: string }>;
}

async function loadOwnedCamera(mapId: string, cameraId: string) {
  const firestore = getFirebaseAdminFirestore();
  const cameraRef = firestore.doc(`maps/${mapId}/liveCameras/${cameraId}`);
  const snapshot = await cameraRef.get();
  if (!snapshot.exists) {
    return { ref: cameraRef, existing: undefined };
  }
  const existing = liveCameraSchema.safeParse(snapshot.data());
  if (!existing.success) {
    return { ref: cameraRef, existing: undefined };
  }
  return { ref: cameraRef, existing: existing.data };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!isTrustedOrigin(request)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
    }

    const { mapId, cameraId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    if (result.context.identity.role !== 'CLIENT_ADMIN') {
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can edit live cameras.' }, { status: 403 });
    }

    const resolvedMapId = result.context.map.mapId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
    }

    const parsed = liveCameraUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the camera and try again.' }, { status: 400 });
    }

    if (!isTranslationsWithinSupportedLanguages(parsed.data.translations, result.context.map.enabledLanguages)) {
      return NextResponse.json(
        { code: 'map/unsupported-language', message: 'One or more translations use a language this map does not support.' },
        { status: 400 },
      );
    }

    const { ref: cameraRef, existing } = await loadOwnedCamera(resolvedMapId, cameraId);
    if (!existing) {
      return NextResponse.json({ code: 'map/not-found', message: 'Camera not found.' }, { status: 404 });
    }

    if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
      return NextResponse.json({ code: 'map/not-found', message: 'Camera not found.' }, { status: 404 });
    }

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.description !== undefined) {
      update.description = parsed.data.description.length > 0 ? parsed.data.description : FieldValue.delete();
    }
    if (parsed.data.location !== undefined) update.location = parsed.data.location;
    if (parsed.data.status !== undefined) update.status = parsed.data.status;
    // `null` explicitly clears; `undefined` (key omitted) leaves the stored
    // value untouched — see `liveCameraUpdateInputSchema`'s own doc comment.
    if (parsed.data.playback !== undefined) {
      update.playback = parsed.data.playback === null ? FieldValue.delete() : parsed.data.playback;
    }
    // Full-replace semantics, same convention `pages/[pageId]/route.ts`'s
    // own doc comment documents.
    if (parsed.data.translations !== undefined) {
      update.translations = Object.keys(parsed.data.translations).length > 0 ? parsed.data.translations : FieldValue.delete();
    }
    if (parsed.data.translationMetadata !== undefined) {
      update.translationMetadata = Object.keys(parsed.data.translationMetadata).length > 0 ? parsed.data.translationMetadata : FieldValue.delete();
    }

    await cameraRef.update(update);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cameras.patch.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!isTrustedOrigin(request)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
    }

    const { mapId, cameraId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    if (result.context.identity.role !== 'CLIENT_ADMIN') {
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can delete live cameras.' }, { status: 403 });
    }

    const resolvedMapId = result.context.map.mapId;
    const { ref: cameraRef, existing } = await loadOwnedCamera(resolvedMapId, cameraId);
    if (!existing) {
      return NextResponse.json({ code: 'map/not-found', message: 'Camera not found.' }, { status: 404 });
    }

    if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
      return NextResponse.json({ code: 'map/not-found', message: 'Camera not found.' }, { status: 404 });
    }

    await cameraRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cameras.delete.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

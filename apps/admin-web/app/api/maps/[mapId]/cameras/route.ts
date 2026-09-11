import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isTranslationsWithinSupportedLanguages, liveCameraCreateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { generateLiveCameraId } from '@/lib/tenant/generate-live-camera-id';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { loadTenantLiveCameras } from '@/lib/tenant/load-live-cameras';

/**
 * `GET`/`POST /api/maps/{mapId}/cameras` — LIVE CAMERAS FOUNDATION
 * checkpoint, mirrors `app/api/maps/[mapId]/pages/route.ts`'s trusted-
 * mutation shape exactly: `isTrustedOrigin` → `getOwnedMapContext(mapId)`
 * (a client-supplied `mapId` is never authorization by itself) →
 * CLIENT_ADMIN role check for writes → input validation → write scoped to
 * `maps/{verifiedMapId}/liveCameras/*`.
 *
 * Draft-only, exactly like `categories`/`pois`/`pages`: writes
 * `maps/{mapId}/liveCameras/*` directly, never `publications/*` — a camera
 * only ever becomes publicly visible through `POST /api/maps/{mapId}/publish`
 * (`buildPublicationContent()`), never here (Save != Publish).
 *
 * No RTSP URL / camera username / camera password / private LAN-address
 * field is ever accepted here — `liveCameraCreateInputSchema` (packages/
 * validation/src/live-camera.ts) has no such field at all, and `playback`
 * (when present) is validated as a browser-safe WEBRTC/HLS relay URL only.
 *
 * Every route body below runs inside a top-level try/catch — the same
 * hardening `pages/route.ts`'s own doc comment documents: an uncaught
 * exception must never escape a JSON API route as an HTML error page.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { mapId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    const cameras = await loadTenantLiveCameras(result.context.map.mapId);
    return NextResponse.json({ cameras });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cameras.get.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
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
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can create live cameras.' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
    }

    const parsed = liveCameraCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the camera and try again.' }, { status: 400 });
    }

    if (!isTranslationsWithinSupportedLanguages(parsed.data.translations, result.context.map.enabledLanguages)) {
      return NextResponse.json(
        { code: 'map/unsupported-language', message: 'One or more translations use a language this map does not support.' },
        { status: 400 },
      );
    }

    const firestore = getFirebaseAdminFirestore();
    const camerasRef = firestore.collection(`maps/${result.context.map.mapId}/liveCameras`);

    const cameraId = generateLiveCameraId();
    await camerasRef.doc(cameraId).set({
      cameraId,
      customerId: result.context.map.customerId,
      mapId: result.context.map.mapId,
      name: parsed.data.name,
      ...(parsed.data.translations && Object.keys(parsed.data.translations).length > 0 ? { translations: parsed.data.translations } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      location: parsed.data.location,
      status: parsed.data.status ?? 'ENABLED',
      ...(parsed.data.playback ? { playback: parsed.data.playback } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, cameraId }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cameras.post.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { mapSettingsUpdateSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getCurrentClientContext } from '@/lib/tenant/client-context';

/**
 * PATCH /api/map/settings — the one trusted map-settings mutation boundary,
 * checkpoint 1B.1 (docs/stages/STAGE_1B_TECHNICAL_PLAN.md §3).
 *
 * This is a DRAFT-only edit: it writes `maps/{mapId}` directly (the same
 * live document `getCurrentClientContext()` already reads), never
 * `publishedMaps/*`. No version is created, nothing is published, and
 * nothing here is visible to any public/tourist-facing surface — Phase 1J
 * is what defines what a "publish" even means. Do not treat a successful
 * response from this route as a publish.
 *
 * Ownership is never client-supplied: the target map is resolved
 * exclusively via `getCurrentClientContext()` (the verified session's own
 * `customerId` claim → tenant-scoped Firestore query), so there is no
 * `mapId`/`customerId` field anywhere in the request this handler ever
 * reads — `mapSettingsUpdateSchema` doesn't even define one (`.strict()`
 * rejects it outright if a caller tries). This makes a cross-tenant write
 * structurally impossible rather than merely rejected by a runtime check.
 *
 * Firestore's `maps/{mapId}` rule remains `allow write: if false`
 * (firebase/firestore.rules, checkpoint 1A.6, unchanged) — the browser
 * never writes this collection directly; only this Admin-SDK-backed route
 * does, and only after all the checks below pass.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const result = await getCurrentClientContext();
  if (!result.ok) {
    // Covers "no session" and every fail-closed tenant-consistency denial
    // getCurrentClientContext() already enforces (missing/invalid claims,
    // inconsistent/missing documents, incomplete provisioning) — none of
    // those states should ever be able to save map settings.
    return NextResponse.json(
      { code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' },
      { status: 401 },
    );
  }

  // Phase 1B.1 write policy (docs/stages/STAGE_1B_TECHNICAL_PLAN.md §3):
  // CLIENT_ADMIN only. CLIENT_EDITOR's map-settings permissions are not yet
  // canonically defined anywhere in the blueprint, so this does not guess —
  // it stays CLIENT_ADMIN-only until a later checkpoint defines otherwise.
  if (result.context.role !== 'CLIENT_ADMIN') {
    return NextResponse.json(
      { code: 'map/forbidden', message: 'Only a Client Admin can edit map settings.' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = mapSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'map/invalid-input', message: 'Please check the map settings and try again.' },
      { status: 400 },
    );
  }

  const firestore = getFirebaseAdminFirestore();
  const mapRef = firestore.doc(`maps/${result.context.map.mapId}`);

  // Only these fields are ever touched — Firestore `.update()` leaves every
  // other field (mapId, customerId, status, defaultLanguage,
  // enabledLanguages, createdAt, ...) exactly as stored. `updatedAt` is
  // always server-set; the client cannot influence it (it isn't even a
  // field on mapSettingsUpdateSchema).
  const update: Record<string, unknown> = {
    name: parsed.data.name,
    mapProvider: parsed.data.mapProvider,
    area: parsed.data.area,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.data.branding !== undefined) {
    update.branding = parsed.data.branding;
  }

  await mapRef.update(update);

  return NextResponse.json({ ok: true });
}

import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { mapSettingsUpdateSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * `PATCH /api/maps/{mapId}/settings` — checkpoint 1B.6, replacing checkpoint
 * 1B.1's `PATCH /api/map/settings`. Same trusted-mutation boundary, moved
 * onto the explicit `mapId`-in-the-URL shape §3 requires: `mapId` is a
 * resource *lookup* key only, never authorization by itself —
 * `getOwnedMapContext(mapId)` is what actually verifies "does this map
 * exist AND belong to the authenticated tenant" (§14) before anything below
 * touches it.
 *
 * Still a DRAFT-only edit: writes `maps/{mapId}` directly, never
 * `publishedMaps/*`. No version, no publish — unchanged from 1B.1.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    // Repair Round 1 (checkpoint 1B.6): 401 for "not signed in at all",
    // distinct from the §14 anti-enumeration collapse below. §14: a
    // forged/cross-tenant/nonexistent mapId all fail exactly the same way
    // here — `describeMapContextDenial()`'s reasoning (not used directly in
    // an API route, only in server-rendered pages) still applies: never
    // distinguish "not yours" from "doesn't exist." See
    // `isIdentityDenialReason()`'s own doc comment (lib/tenant/map-context.ts)
    // for why these are two different concerns.
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  if (result.context.identity.role !== 'CLIENT_ADMIN') {
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

  const update: Record<string, unknown> = {
    name: parsed.data.name,
    mapProvider: parsed.data.mapProvider,
    area: parsed.data.area,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.data.branding !== undefined) {
    update.branding = parsed.data.branding;
  }
  // Checkpoint 1B.7 — identical "only written if present" partial-update
  // pattern `branding` already uses. `mapSettingsUpdateSchema` (validated
  // above) is the only trust boundary this needs: its `.strict()` theme
  // sub-schema already rejects ownership fields, unknown keys, and raw
  // provider style JSON, so nothing further is re-checked here — same as
  // every other field on this route.
  if (parsed.data.theme !== undefined) {
    update.theme = parsed.data.theme;
  }
  // checkpoint 1B.17A — same "only written if present" partial-update
  // pattern `branding`/`theme` already use. `languages` is one atomic
  // optional object (`mapLanguageConfigSchema`, packages/validation/src/language.ts)
  // bundling `defaultLanguage`+`supportedLanguages` together specifically so
  // "default must always be within supported" is fully checkable by that
  // schema's own `.refine()` using only the values in THIS request body —
  // never a partial write that could leave a map with a default language
  // that isn't (or is no longer) one of its supported languages. Stored back
  // onto the map document's existing `defaultLanguage`/`enabledLanguages`
  // fields (the checkpoint's own field-repurposing decision — see
  // shared-types' `TouristMap` doc comment), not a new field name. This is a
  // DRAFT-only write, same as every other field on this route — it never
  // touches `maps/{mapId}/publications/*` or the map's `publication`
  // pointer, so changing language config here can never mutate an
  // already-published snapshot (§8/§10 of the checkpoint).
  if (parsed.data.languages !== undefined) {
    update.defaultLanguage = parsed.data.languages.defaultLanguage;
    update.enabledLanguages = parsed.data.languages.supportedLanguages;
  }

  await mapRef.update(update);

  return NextResponse.json({ ok: true });
}

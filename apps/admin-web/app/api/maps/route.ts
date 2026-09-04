import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_MAP_THEME, DEFAULT_PUBLIC_CONTENT_LANGUAGE } from 'shared-types';
import { mapCreateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getCurrentTenantIdentity } from '@/lib/tenant/tenant-identity';
import { listOwnedMaps } from '@/lib/tenant/list-owned-maps';
import { generateMapId } from '@/lib/tenant/generate-map-id';

/**
 * `GET`/`POST /api/maps` — checkpoint 1B.6 §5/§6. Tenant-scoped (not
 * map-scoped): `GET` backs the Maps dashboard and the admin-shell map
 * switcher, `POST` is the trusted "create an additional map" boundary.
 *
 * Same trusted-mutation shape every `/api/maps/{mapId}/*` route (and, before
 * this checkpoint, every `/api/map/*` route) already establishes: origin
 * check → `getCurrentTenantIdentity()` → role check → `.strict()` Zod input
 * → Admin SDK write. The one thing this route does NOT do that a
 * map-scoped route does is call `getOwnedMapContext()` — there is no
 * specific map to own yet on `POST`, and `GET` intentionally returns every
 * map the tenant owns, not one.
 */

export async function GET(): Promise<NextResponse> {
  const result = await getCurrentTenantIdentity();
  if (!result.ok) {
    return NextResponse.json(
      { code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' },
      { status: 401 },
    );
  }

  const maps = await listOwnedMaps(result.identity.customer.customerId);
  return NextResponse.json({ maps });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const result = await getCurrentTenantIdentity();
  if (!result.ok) {
    return NextResponse.json(
      { code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' },
      { status: 401 },
    );
  }

  // Same write policy every other tenant-mutation route in this project
  // uses: CLIENT_ADMIN only. CLIENT_EDITOR's map-creation permissions are
  // not yet canonically defined anywhere in the blueprint, so this does not
  // guess.
  if (result.identity.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can create maps.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = mapCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the map name and try again.' }, { status: 400 });
  }

  const firestore = getFirebaseAdminFirestore();
  const mapId = generateMapId();

  // §6: a new map's defaults MUST be compatible with existing Map
  // Settings/Categories/POIs/Menu Builder and produce a usable empty map —
  // these are exactly the same defaults `provisionClient()`
  // (firebase/functions/src/provisioning/provision-client.ts) already gives
  // a tenant's very first map, reused verbatim rather than re-invented, so
  // a second/third map starts out just as usable as the first one did.
  // `customerId` is stamped exclusively from the verified session's own
  // tenant identity — never from `parsed.data`, which has no such field to
  // begin with (`.strict()` would reject it anyway).
  //
  // checkpoint 1B.17A: `defaultLanguage`/`enabledLanguages` now hold
  // `PublicContentLanguage` values (see shared-types' `TouristMap` doc
  // comment for the field-repurposing rationale) — every new map still
  // starts single-language, just using the new registry's own default code
  // rather than the retired `Language`/`LANGUAGES` enum's `'EN'`.
  await firestore.doc(`maps/${mapId}`).set({
    mapId,
    customerId: result.identity.customer.customerId,
    name: parsed.data.name,
    status: 'DRAFT',
    defaultLanguage: DEFAULT_PUBLIC_CONTENT_LANGUAGE,
    enabledLanguages: [DEFAULT_PUBLIC_CONTENT_LANGUAGE],
    mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
    area: { type: 'UNBOUNDED' },
    // checkpoint 1B.16 — persist the clean default theme explicitly at
    // creation (the `TOURISM` preset). A new map is a clean destination
    // canvas out of the box, and its stored theme, the Map Settings form,
    // and its first publication all agree from the start.
    theme: DEFAULT_MAP_THEME,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // §6 (non-goal, explicit): a new map never copies another map's
  // categories/POIs/menu — it starts fully independent. No further writes
  // happen here beyond the `maps/{mapId}` document itself.

  return NextResponse.json({ ok: true, mapId }, { status: 201 });
}

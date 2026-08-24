import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { menuItemReorderInputSchema, menuItemSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * `POST /api/maps/{mapId}/menu-items/reorder` — Repair Round 4 (checkpoint
 * 1B.6). Atomically swaps exactly two menu items' `order` values via a
 * single Firestore `WriteBatch.commit()` — see
 * `menuItemReorderInputSchema`'s own doc comment (packages/validation) for
 * the full reasoning behind why this replaced the client's previous
 * approach of firing two independent `PATCH .../menu-items/{menuItemId}`
 * requests in parallel to express one logical "move up"/"move down" action.
 * A `WriteBatch` commits all of its writes as one atomic unit — Firestore
 * either applies every write in the batch or none of them — which two
 * separate HTTP requests can never guarantee: nothing stops a client-side
 * navigation, a dropped connection, or a partial network failure from
 * completing one request while the other is cancelled or lost mid-flight,
 * leaving the pair of menu items in an inconsistent order state. (This is
 * exactly what Repair Round 4's own investigation traced a real E2E failure
 * to — a test `page.reload()` fired before either in-flight PATCH request
 * resolved, and the browser cancelled both outright, so neither write ever
 * reached Firestore. The root cause there was the test proceeding before
 * the mutation had genuinely settled, not a server-side race — but the
 * underlying "two independent requests aren't atomic as a pair" gap was
 * real regardless, so it's closed here rather than left as a latent risk.)
 *
 * Both referenced menu items are re-verified against THIS resolved,
 * ownership-checked map before anything is written (§10/§11 — the same
 * "never trust a client-supplied id without checking it exists under this
 * exact map" rule every other mutation route in this file family follows)
 * — a `menuItemId` belonging to a different map (even one owned by the same
 * tenant) is a 404, not a silent no-op or a cross-map write. Only `order`
 * is ever touched here; CATEGORY/FEATURE type, `categoryId`/`featureKey`,
 * label, icon, and status are all untouched by a reorder, exactly as
 * before.
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
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can reorder menu items.' }, { status: 403 });
  }

  const resolvedMapId = result.context.map.mapId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = menuItemReorderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the menu order and try again.' }, { status: 400 });
  }

  const firestore = getFirebaseAdminFirestore();
  const menuItemsRef = firestore.collection(`maps/${resolvedMapId}/menuItems`);
  const refs = parsed.data.items.map((item) => menuItemsRef.doc(item.menuItemId));

  // Re-verify BOTH menu items belong to this exact, already-ownership-
  // checked map before writing anything — a client-supplied menuItemId is
  // never trusted merely because it's well-formed (§10, mirrors every other
  // route in this file family's identical rule for categoryId/featureKey).
  const snapshots = await firestore.getAll(...refs);
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      return NextResponse.json({ code: 'map/not-found', message: 'Menu item not found.' }, { status: 404 });
    }
    const existing = menuItemSchema.safeParse(snapshot.data());
    if (!existing.success || existing.data.customerId !== result.context.map.customerId || existing.data.mapId !== resolvedMapId) {
      return NextResponse.json({ code: 'map/not-found', message: 'Menu item not found.' }, { status: 404 });
    }
  }

  const batch = firestore.batch();
  parsed.data.items.forEach((item, index) => {
    batch.update(refs[index]!, { order: item.order, updatedAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();

  return NextResponse.json({ ok: true });
}

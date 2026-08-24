import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { categorySchema, categoryUpdateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * `PATCH /api/maps/{mapId}/categories/{categoryId}` — checkpoint 1B.6,
 * replacing checkpoint 1B.2's `/api/map/categories/{categoryId}`.
 *
 * `mapId` AND `categoryId` from the URL are both treated only as resource
 * *lookup* keys — never as authorization by themselves. `mapId` is verified
 * by `getOwnedMapContext()` (§14) before the category document is ever
 * read; `categoryId` is then looked up under that already-verified map's
 * own `categories` subcollection, so a category belonging to a different
 * map — even a map belonging to the SAME tenant (§10, map isolation) — is a
 * different, unreachable Firestore path, not merely "denied by a check."
 * The explicit `customerId`/`mapId` re-check below is still performed as
 * defense-in-depth, exactly as the 1B.2 route did.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string; readonly categoryId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const { mapId, categoryId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  if (result.context.identity.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can edit categories.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = categoryUpdateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the category and try again.' }, { status: 400 });
  }

  const firestore = getFirebaseAdminFirestore();
  const categoryRef = firestore.doc(`maps/${result.context.map.mapId}/categories/${categoryId}`);
  const snapshot = await categoryRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ code: 'map/not-found', message: 'Category not found.' }, { status: 404 });
  }

  const existing = categorySchema.safeParse(snapshot.data());
  if (!existing.success) {
    return NextResponse.json({ code: 'map/not-found', message: 'Category not found.' }, { status: 404 });
  }

  // Defense-in-depth ownership re-check — structurally redundant with the
  // map-scoped path above, kept exactly as the 1B.2 route did.
  if (existing.data.customerId !== result.context.map.customerId || existing.data.mapId !== result.context.map.mapId) {
    return NextResponse.json({ code: 'map/not-found', message: 'Category not found.' }, { status: 404 });
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled;
  if (parsed.data.order !== undefined) update.order = parsed.data.order;
  if (parsed.data.platformCategoryId !== undefined) {
    update.platformCategoryId = parsed.data.platformCategoryId === null ? FieldValue.delete() : parsed.data.platformCategoryId;
  }

  await categoryRef.update(update);

  return NextResponse.json({ ok: true });
}

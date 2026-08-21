import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { categorySchema, categoryUpdateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getCurrentClientContext } from '@/lib/tenant/client-context';

/**
 * `PATCH /api/map/categories/{categoryId}` — checkpoint 1B.2, see
 * app/api/map/categories/route.ts's header comment for the shared trusted-
 * mutation shape.
 *
 * `categoryId` from the URL is treated only as a resource *lookup* key
 * (docs/stages/STAGE_1B_TECHNICAL_PLAN.md §14) — never as authorization by
 * itself. The document is always read from
 * `maps/{sessionMapId}/categories/{categoryId}`, where `sessionMapId` comes
 * exclusively from the verified session's tenant context, so a category
 * belonging to a different tenant's map is not merely "denied by a check"
 * but literally a different, unreachable Firestore path — the same
 * structural guarantee 1B.1's map-settings mutation relies on. The explicit
 * `customerId`/`mapId` re-check below is still performed, exactly as
 * instructed, as defense-in-depth against a future refactor rather than
 * because it's the only thing preventing cross-tenant access today.
 */

interface RouteParams {
  readonly params: Promise<{ readonly categoryId: string }>;
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
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can edit categories.' }, { status: 403 });
  }

  const { categoryId } = await params;

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
    // Malformed stored data — fail closed rather than editing a document we
    // can't trust the shape of.
    return NextResponse.json({ code: 'map/not-found', message: 'Category not found.' }, { status: 404 });
  }

  // Defense-in-depth ownership re-check (§10) — structurally redundant with
  // the tenant-scoped path above, but kept exactly as the checkpoint
  // requires, and cheap insurance against a future refactor that might
  // resolve `categoryRef` differently.
  if (existing.data.customerId !== result.context.map.customerId || existing.data.mapId !== result.context.map.mapId) {
    return NextResponse.json({ code: 'map/not-found', message: 'Category not found.' }, { status: 404 });
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled;
  if (parsed.data.order !== undefined) update.order = parsed.data.order;
  // Checkpoint 1B.4: `platformCategoryId` supports both linking (a closed
  // registry-ID string, already validated by `categoryUpdateInputSchema`)
  // and explicit unlinking (`null` → remove the field entirely via
  // `FieldValue.delete()`, restoring "purely custom category" — distinct
  // from simply omitting the field, which leaves any existing link alone).
  if (parsed.data.platformCategoryId !== undefined) {
    update.platformCategoryId = parsed.data.platformCategoryId === null ? FieldValue.delete() : parsed.data.platformCategoryId;
  }

  await categoryRef.update(update);

  return NextResponse.json({ ok: true });
}

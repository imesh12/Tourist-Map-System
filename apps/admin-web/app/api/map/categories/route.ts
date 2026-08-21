import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { categoryCreateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { generateCategoryId } from '@/lib/tenant/generate-category-id';
import { getCurrentClientContext } from '@/lib/tenant/client-context';
import { loadTenantCategories } from '@/lib/tenant/load-categories';

/**
 * `GET`/`POST /api/map/categories` — checkpoint 1B.2
 * (docs/stages/STAGE_1B_TECHNICAL_PLAN.md), same trusted-mutation shape
 * checkpoint 1B.1 established for `/api/map/settings`: origin-checked
 * state-changing requests, session-verified via `getCurrentClientContext()`,
 * target resolved exclusively from the verified session's own tenant
 * context — never a client-supplied `mapId`/`customerId`.
 *
 * Draft-only, same as 1B.1: this writes `maps/{mapId}/categories/*`
 * directly, never `publishedMaps/*`. No version, no publish.
 */

export async function GET(): Promise<NextResponse> {
  const result = await getCurrentClientContext();
  if (!result.ok) {
    return NextResponse.json(
      { code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' },
      { status: 401 },
    );
  }

  const categories = await loadTenantCategories(result.context.map.mapId);
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // 1B.2 write policy, same as 1B.1's map-settings mutation: CLIENT_ADMIN
  // only — CLIENT_EDITOR's category permissions are not yet canonically
  // defined, so this does not guess.
  if (result.context.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can create categories.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = categoryCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the category and try again.' }, { status: 400 });
  }

  const firestore = getFirebaseAdminFirestore();
  const categoriesRef = firestore.collection(`maps/${result.context.map.mapId}/categories`);

  // Server-computed default (append to the end) when the client doesn't
  // supply an explicit order — the client is never trusted to compute a
  // collision-free value itself.
  let order = parsed.data.order;
  if (order === undefined) {
    const existing = await categoriesRef.get();
    order = existing.size;
  }

  const categoryId = generateCategoryId();
  await categoriesRef.doc(categoryId).set({
    categoryId,
    customerId: result.context.map.customerId,
    mapId: result.context.map.mapId,
    name: parsed.data.name,
    icon: parsed.data.icon,
    enabled: parsed.data.enabled ?? true,
    order,
    // Category CMS architecture checkpoint: every category this route
    // creates is client-authored — there is no Super Admin
    // platform-category release path yet (see
    // docs/architecture/CATEGORY_ARCHITECTURE.md). Set explicitly by
    // trusted server code, never from `parsed.data` — the client cannot
    // request `PLATFORM` here even in principle, since
    // `categoryCreateInputSchema` has no such field to begin with.
    sourceType: 'CLIENT_CUSTOM',
    // Checkpoint 1B.4: an OPTIONAL link to a released platform category
    // (today, only Restaurant) — `categoryPlatformCategoryIdSchema` already
    // restricts `parsed.data.platformCategoryId` to a closed enum of known
    // registry IDs, so no further server-side validation is needed before
    // storing it. The category remains `CLIENT_CUSTOM`-sourced either way —
    // linking unlocks a content-source capability, it does not change who
    // authored the category itself.
    ...(parsed.data.platformCategoryId ? { platformCategoryId: parsed.data.platformCategoryId } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, categoryId }, { status: 201 });
}

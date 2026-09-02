import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { categoryCreateInputSchema, isTranslationsWithinSupportedLanguages } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { generateCategoryId } from '@/lib/tenant/generate-category-id';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { loadTenantCategories } from '@/lib/tenant/load-categories';

/**
 * `GET`/`POST /api/maps/{mapId}/categories` — checkpoint 1B.6, replacing
 * checkpoint 1B.2's `/api/map/categories`. Same trusted-mutation shape,
 * moved onto explicit `mapId`-in-the-URL: `getOwnedMapContext(mapId)`
 * resolves and verifies the target map before anything below reads or
 * writes `maps/{mapId}/categories/*`.
 *
 * Draft-only, unchanged from 1B.2: writes `maps/{mapId}/categories/*`
 * directly, never `publishedMaps/*`.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  const categories = await loadTenantCategories(result.context.map.mapId);
  return NextResponse.json({ categories });
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

  // 1B.2 write policy, unchanged: CLIENT_ADMIN only.
  if (result.context.identity.role !== 'CLIENT_ADMIN') {
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

  // checkpoint 1B.17B §10/§13 — registry membership is already checked by
  // `categoryTranslationsSchema` above; this additionally rejects a
  // registry-valid language the MAP itself doesn't have enabled, which the
  // schema alone cannot know.
  if (!isTranslationsWithinSupportedLanguages(parsed.data.translations, result.context.map.enabledLanguages)) {
    return NextResponse.json(
      { code: 'map/unsupported-language', message: 'One or more translations use a language this map does not support.' },
      { status: 400 },
    );
  }

  const firestore = getFirebaseAdminFirestore();
  const categoriesRef = firestore.collection(`maps/${result.context.map.mapId}/categories`);

  // Server-computed default (append to the end) when the client doesn't
  // supply an explicit order — never trust the client to compute a
  // collision-free value itself. Scoped to THIS map's own categories only
  // (§10 — map content isolation), so a second map always starts its own
  // ordering from zero, independent of any other map's category count.
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
    sourceType: 'CLIENT_CUSTOM',
    ...(parsed.data.platformCategoryId ? { platformCategoryId: parsed.data.platformCategoryId } : {}),
    ...(parsed.data.translations && Object.keys(parsed.data.translations).length > 0 ? { translations: parsed.data.translations } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, categoryId }, { status: 201 });
}

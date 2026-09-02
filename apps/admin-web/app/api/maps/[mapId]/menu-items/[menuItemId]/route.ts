import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isTranslationsWithinSupportedLanguages, menuItemSchema, menuItemUpdateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * `PATCH`/`DELETE /api/maps/{mapId}/menu-items/{menuItemId}` — checkpoint
 * 1B.6, replacing checkpoint 1B.5's `/api/map/menu-items/{menuItemId}`.
 * Mirrors `app/api/maps/[mapId]/pois/[poiId]/route.ts`'s trusted-mutation
 * shape.
 *
 * `menuItemId` is a resource lookup key only — the document is always read
 * from `maps/{verifiedMapId}/menuItems/{menuItemId}`, where `verifiedMapId`
 * comes from `getOwnedMapContext()`, so a menu item belonging to a
 * different map (§10/§11 — even one owned by the same tenant) is a
 * different, unreachable Firestore path.
 *
 * `type`/`categoryId`/`featureKey` immutability and the FEATURE-icon
 * restriction are unchanged from 1B.5 — see that checkpoint's original
 * route for the full reasoning.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string; readonly menuItemId: string }>;
}

async function loadOwnedMenuItem(mapId: string, menuItemId: string) {
  const firestore = getFirebaseAdminFirestore();
  const menuItemRef = firestore.doc(`maps/${mapId}/menuItems/${menuItemId}`);
  const snapshot = await menuItemRef.get();
  if (!snapshot.exists) {
    return { ref: menuItemRef, existing: undefined };
  }
  const existing = menuItemSchema.safeParse(snapshot.data());
  if (!existing.success) {
    return { ref: menuItemRef, existing: undefined };
  }
  return { ref: menuItemRef, existing: existing.data };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const { mapId, menuItemId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  if (result.context.identity.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can edit menu items.' }, { status: 403 });
  }

  const resolvedMapId = result.context.map.mapId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = menuItemUpdateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the menu item and try again.' }, { status: 400 });
  }

  // checkpoint 1B.17B §10/§13 — see `categories/route.ts`'s own doc comment.
  if (!isTranslationsWithinSupportedLanguages(parsed.data.translations, result.context.map.enabledLanguages)) {
    return NextResponse.json(
      { code: 'map/unsupported-language', message: 'One or more translations use a language this map does not support.' },
      { status: 400 },
    );
  }

  const { ref: menuItemRef, existing } = await loadOwnedMenuItem(resolvedMapId, menuItemId);
  if (!existing) {
    return NextResponse.json({ code: 'map/not-found', message: 'Menu item not found.' }, { status: 404 });
  }

  if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
    return NextResponse.json({ code: 'map/not-found', message: 'Menu item not found.' }, { status: 404 });
  }

  // checkpoint 1B.11: a PAGE item's icon is an optional client override, the
  // exact same shape a CATEGORY item's already is — only a FEATURE item's
  // icon is permanently fixed to its registry entry.
  if (existing.type === 'FEATURE' && parsed.data.icon !== undefined) {
    return NextResponse.json(
      { code: 'map/menu-item-immutable-fields', message: 'A feature menu item always uses its default icon and cannot be overridden.' },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.order !== undefined) update.order = parsed.data.order;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.icon !== undefined) {
    update.icon = parsed.data.icon === null ? FieldValue.delete() : parsed.data.icon;
  }
  // checkpoint 1B.17B §9/§10 — full-replace semantics, same convention
  // `categories/[categoryId]/route.ts`'s own doc comment documents.
  if (parsed.data.translations !== undefined) {
    update.translations = Object.keys(parsed.data.translations).length > 0 ? parsed.data.translations : FieldValue.delete();
  }

  await menuItemRef.update(update);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const { mapId, menuItemId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  if (result.context.identity.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can delete menu items.' }, { status: 403 });
  }

  const resolvedMapId = result.context.map.mapId;
  const { ref: menuItemRef, existing } = await loadOwnedMenuItem(resolvedMapId, menuItemId);
  if (!existing) {
    return NextResponse.json({ code: 'map/not-found', message: 'Menu item not found.' }, { status: 404 });
  }

  if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
    return NextResponse.json({ code: 'map/not-found', message: 'Menu item not found.' }, { status: 404 });
  }

  await menuItemRef.delete();

  return NextResponse.json({ ok: true });
}

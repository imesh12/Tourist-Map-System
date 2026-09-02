import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isTranslationsWithinSupportedLanguages, menuItemCreateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { generateMenuItemId } from '@/lib/tenant/generate-menu-item-id';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { loadTenantMenuItems } from '@/lib/tenant/load-menu-items';

/**
 * `GET`/`POST /api/maps/{mapId}/menu-items` — checkpoint 1B.6, replacing
 * checkpoint 1B.5's `/api/map/menu-items`. Same trusted-mutation shape,
 * moved onto explicit `mapId`-in-the-URL.
 *
 * §11: menu items remain `maps/{mapId}/menuItems/{menuItemId}` — the
 * projection and eligibility logic (`lib/tenant/menu-projection.ts`,
 * `lib/tenant/category-capabilities.ts`) are unchanged; only the source of
 * `mapId` moved from an implicit tenant resolution to this route's own URL
 * parameter, verified by `getOwnedMapContext()`.
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

  const menuItems = await loadTenantMenuItems(result.context.map.mapId);
  return NextResponse.json({ menuItems });
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
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can create menu items.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
  }

  const parsed = menuItemCreateInputSchema.safeParse(body);
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

  const firestore = getFirebaseAdminFirestore();
  const resolvedMapId = result.context.map.mapId;
  const menuItemsRef = firestore.collection(`maps/${resolvedMapId}/menuItems`);

  const desiredStatus = parsed.data.status ?? 'ENABLED';

  // Repair Round 2 (checkpoint 1B.6): `parsed.data` is narrowed correctly by
  // TypeScript at the point of `parsed.data.type === 'CATEGORY'` below, but
  // that narrowing does NOT survive into a nested closure (the
  // `firestore.runTransaction(async (transaction) => {...})` callback) —
  // TypeScript's control-flow narrowing only persists across a function
  // boundary for a plain, never-reassigned local identifier, not for a
  // multi-step member expression like `parsed.data.categoryId`. Capturing
  // the already-narrowed value into its own `const` — `categoryInput`/
  // `featureInput` below — immediately after each branch check is what
  // makes the narrowing "stick" through the transaction closure, exactly
  // the pattern Repair Round 2 asked for: branch explicitly on
  // `parsed.data.type`, then capture the narrowed branch into a correctly
  // typed local before any callback reads it. No cast, no `.strict()`
  // change — `menuItemCreateInputSchema`'s discriminated union (Repair
  // Round 1) is untouched.
  if (parsed.data.type === 'CATEGORY') {
    const categoryInput = parsed.data;

    // Never trust categoryId merely because it's well-formed — it must
    // reference a category that exists under THIS already-verified map
    // (§10 — even a category from a different map owned by the same
    // tenant is a different, unreachable Firestore path).
    const categorySnap = await firestore.doc(`maps/${resolvedMapId}/categories/${categoryInput.categoryId}`).get();
    if (!categorySnap.exists) {
      return NextResponse.json(
        { code: 'map/invalid-category', message: 'Select a valid category for this map.' },
        { status: 400 },
      );
    }

    const categoryEnabled = categorySnap.data()?.enabled === true;
    if (!categoryEnabled && desiredStatus === 'ENABLED') {
      return NextResponse.json(
        { code: 'map/category-disabled', message: 'This category is disabled — enable it first, or add this menu item as Disabled.' },
        { status: 400 },
      );
    }

    try {
      const menuItemId = await firestore.runTransaction(async (transaction) => {
        const duplicateSnap = await transaction.get(
          menuItemsRef.where('type', '==', 'CATEGORY').where('categoryId', '==', categoryInput.categoryId).limit(1),
        );
        if (!duplicateSnap.empty) {
          throw new DuplicateMenuItemError();
        }

        let order = categoryInput.order;
        if (order === undefined) {
          const existing = await transaction.get(menuItemsRef);
          order = existing.size;
        }

        const newMenuItemId = generateMenuItemId();
        transaction.set(menuItemsRef.doc(newMenuItemId), {
          menuItemId: newMenuItemId,
          customerId: result.context.map.customerId,
          mapId: resolvedMapId,
          type: 'CATEGORY',
          label: categoryInput.label,
          categoryId: categoryInput.categoryId,
          ...(categoryInput.icon ? { icon: categoryInput.icon } : {}),
          ...(categoryInput.translations && Object.keys(categoryInput.translations).length > 0
            ? { translations: categoryInput.translations }
            : {}),
          order,
          status: desiredStatus,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return newMenuItemId;
      });

      return NextResponse.json({ ok: true, menuItemId }, { status: 201 });
    } catch (error) {
      if (error instanceof DuplicateMenuItemError) {
        return NextResponse.json(
          { code: 'map/duplicate-menu-item', message: 'This category is already in the menu.' },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  if (parsed.data.type === 'PAGE') {
    const pageInput = parsed.data;

    // Never trust pageId merely because it's well-formed — it must
    // reference a Page that exists under THIS already-verified map, same
    // "even a page from a different map owned by the same tenant is a
    // different, unreachable Firestore path" reasoning the CATEGORY branch
    // above already documents.
    const pageSnap = await firestore.doc(`maps/${resolvedMapId}/pages/${pageInput.pageId}`).get();
    if (!pageSnap.exists) {
      return NextResponse.json({ code: 'map/invalid-page', message: 'Select a valid page for this map.' }, { status: 400 });
    }

    const pageEnabled = pageSnap.data()?.status === 'ENABLED';
    if (!pageEnabled && desiredStatus === 'ENABLED') {
      return NextResponse.json(
        { code: 'map/page-disabled', message: 'This page is disabled — enable it first, or add this menu item as Disabled.' },
        { status: 400 },
      );
    }

    try {
      const menuItemId = await firestore.runTransaction(async (transaction) => {
        const duplicateSnap = await transaction.get(
          menuItemsRef.where('type', '==', 'PAGE').where('pageId', '==', pageInput.pageId).limit(1),
        );
        if (!duplicateSnap.empty) {
          throw new DuplicateMenuItemError();
        }

        let order = pageInput.order;
        if (order === undefined) {
          const existing = await transaction.get(menuItemsRef);
          order = existing.size;
        }

        const newMenuItemId = generateMenuItemId();
        transaction.set(menuItemsRef.doc(newMenuItemId), {
          menuItemId: newMenuItemId,
          customerId: result.context.map.customerId,
          mapId: resolvedMapId,
          type: 'PAGE',
          label: pageInput.label,
          pageId: pageInput.pageId,
          ...(pageInput.icon ? { icon: pageInput.icon } : {}),
          ...(pageInput.translations && Object.keys(pageInput.translations).length > 0 ? { translations: pageInput.translations } : {}),
          order,
          status: desiredStatus,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return newMenuItemId;
      });

      return NextResponse.json({ ok: true, menuItemId }, { status: 201 });
    } catch (error) {
      if (error instanceof DuplicateMenuItemError) {
        return NextResponse.json(
          { code: 'map/duplicate-menu-item', message: 'This page is already in the menu.' },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  const featureInput = parsed.data;

  try {
    const menuItemId = await firestore.runTransaction(async (transaction) => {
      const duplicateSnap = await transaction.get(
        menuItemsRef.where('type', '==', 'FEATURE').where('featureKey', '==', featureInput.featureKey).limit(1),
      );
      if (!duplicateSnap.empty) {
        throw new DuplicateMenuItemError();
      }

      let order = featureInput.order;
      if (order === undefined) {
        const existing = await transaction.get(menuItemsRef);
        order = existing.size;
      }

      const newMenuItemId = generateMenuItemId();
      transaction.set(menuItemsRef.doc(newMenuItemId), {
        menuItemId: newMenuItemId,
        customerId: result.context.map.customerId,
        mapId: resolvedMapId,
        type: 'FEATURE',
        label: featureInput.label,
        featureKey: featureInput.featureKey,
        ...(featureInput.translations && Object.keys(featureInput.translations).length > 0
          ? { translations: featureInput.translations }
          : {}),
        order,
        status: desiredStatus,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return newMenuItemId;
    });

    return NextResponse.json({ ok: true, menuItemId }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateMenuItemError) {
      return NextResponse.json(
        { code: 'map/duplicate-menu-item', message: 'This feature is already in the menu.' },
        { status: 409 },
      );
    }
    throw error;
  }
}

class DuplicateMenuItemError extends Error {}

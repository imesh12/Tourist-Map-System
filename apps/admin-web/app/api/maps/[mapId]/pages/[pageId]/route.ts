import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isTranslationsWithinSupportedLanguages, pageSchema, pageUpdateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * `PATCH`/`DELETE /api/maps/{mapId}/pages/{pageId}` — checkpoint 1B.11,
 * mirrors `app/api/maps/[mapId]/pois/[poiId]/route.ts`'s trusted-mutation
 * shape (including its top-level try/catch hardening).
 *
 * `pageId` is a resource lookup key only — the document is always read from
 * `maps/{verifiedMapId}/pages/{pageId}`, where `verifiedMapId` comes from
 * `getOwnedMapContext()`, so a Page belonging to a different map (even one
 * owned by the same tenant) is a different, unreachable Firestore path.
 *
 * DELETION POLICY (checkpoint 1B.11 §9's "choose a deterministic safe
 * policy... document the chosen policy"): a Page that is still referenced
 * by any `PAGE` menu item is NEVER deleted — `DELETE` returns 409
 * `map/page-in-use` instead, naming the referencing menu item(s), and the
 * admin must remove that menu item first. This mirrors the project's own
 * existing precedent for exactly this class of problem: `Category`
 * documents have no `DELETE` route at all (a category can only be
 * disabled, never deleted), specifically because a category can be
 * referenced by POIs and menu items and this codebase's chosen answer is
 * "never allow an unsafe delete of a referenced entity" rather than a
 * silent cascade. A Page has no content that references it the way a POI
 * references a category, so an outright delete IS safe once nothing links
 * to it — this route allows that case (unlike categories) instead of
 * blocking Page deletion forever, while still refusing the one case that
 * would otherwise leave a dangling `pageId` on a stored `MenuItem`
 * document. This also keeps `buildPublicMenuProjection()`'s own fail-closed
 * "broken reference → excluded, never thrown" behavior a defense-in-depth
 * backstop rather than something a normal admin flow ever needs to rely on.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string; readonly pageId: string }>;
}

async function loadOwnedPage(mapId: string, pageId: string) {
  const firestore = getFirebaseAdminFirestore();
  const pageRef = firestore.doc(`maps/${mapId}/pages/${pageId}`);
  const snapshot = await pageRef.get();
  if (!snapshot.exists) {
    return { ref: pageRef, existing: undefined };
  }
  const existing = pageSchema.safeParse(snapshot.data());
  if (!existing.success) {
    return { ref: pageRef, existing: undefined };
  }
  return { ref: pageRef, existing: existing.data };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!isTrustedOrigin(request)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
    }

    const { mapId, pageId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    if (result.context.identity.role !== 'CLIENT_ADMIN') {
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can edit pages.' }, { status: 403 });
    }

    const resolvedMapId = result.context.map.mapId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
    }

    const parsed = pageUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Please check the page and try again.' }, { status: 400 });
    }

    // checkpoint 1B.17B §10/§13 — see `categories/route.ts`'s own doc comment.
    if (!isTranslationsWithinSupportedLanguages(parsed.data.translations, result.context.map.enabledLanguages)) {
      return NextResponse.json(
        { code: 'map/unsupported-language', message: 'One or more translations use a language this map does not support.' },
        { status: 400 },
      );
    }

    const { ref: pageRef, existing } = await loadOwnedPage(resolvedMapId, pageId);
    if (!existing) {
      return NextResponse.json({ code: 'map/not-found', message: 'Page not found.' }, { status: 404 });
    }

    if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
      return NextResponse.json({ code: 'map/not-found', message: 'Page not found.' }, { status: 404 });
    }

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (parsed.data.title !== undefined) update.title = parsed.data.title;
    if (parsed.data.content !== undefined) update.content = parsed.data.content;
    if (parsed.data.status !== undefined) update.status = parsed.data.status;
    // checkpoint 1B.17B §9/§10 — full-replace semantics, same convention
    // `categories/[categoryId]/route.ts`'s own doc comment documents.
    if (parsed.data.translations !== undefined) {
      update.translations = Object.keys(parsed.data.translations).length > 0 ? parsed.data.translations : FieldValue.delete();
    }

    await pageRef.update(update);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pages.patch.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!isTrustedOrigin(request)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
    }

    const { mapId, pageId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    if (result.context.identity.role !== 'CLIENT_ADMIN') {
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can delete pages.' }, { status: 403 });
    }

    const resolvedMapId = result.context.map.mapId;
    const { ref: pageRef, existing } = await loadOwnedPage(resolvedMapId, pageId);
    if (!existing) {
      return NextResponse.json({ code: 'map/not-found', message: 'Page not found.' }, { status: 404 });
    }

    if (existing.customerId !== result.context.map.customerId || existing.mapId !== resolvedMapId) {
      return NextResponse.json({ code: 'map/not-found', message: 'Page not found.' }, { status: 404 });
    }

    // Deletion policy — see this file's own header doc comment: never
    // delete a Page still referenced by a PAGE menu item.
    const firestore = getFirebaseAdminFirestore();
    const referencingMenuItems = await firestore
      .collection(`maps/${resolvedMapId}/menuItems`)
      .where('type', '==', 'PAGE')
      .where('pageId', '==', pageId)
      .limit(1)
      .get();
    if (!referencingMenuItems.empty) {
      return NextResponse.json(
        {
          code: 'map/page-in-use',
          message: 'This page is still linked from the public menu. Remove it from the menu before deleting it.',
        },
        { status: 409 },
      );
    }

    await pageRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pages.delete.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

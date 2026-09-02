import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isTranslationsWithinSupportedLanguages, pageCreateInputSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { generatePageId } from '@/lib/tenant/generate-page-id';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { loadTenantPages } from '@/lib/tenant/load-pages';

/**
 * `GET`/`POST /api/maps/{mapId}/pages` — checkpoint 1B.11, mirrors
 * `app/api/maps/[mapId]/categories/route.ts`'s trusted-mutation shape
 * exactly: `isTrustedOrigin` → `getOwnedMapContext(mapId)` (§14 of the
 * checkpoint — every protected map API resolves ownership through this, a
 * client-supplied `mapId` is never authorization by itself) → CLIENT_ADMIN
 * role check for writes → input validation → write scoped to
 * `maps/{verifiedMapId}/pages/*`.
 *
 * Draft-only, exactly like `categories`/`pois`/`menuItems`: writes
 * `maps/{mapId}/pages/*` directly, never `publications/*` — a Page only
 * ever becomes publicly visible through `POST /api/maps/{mapId}/publish`
 * (`buildPublicationContent()`), never here (§14 of the checkpoint: "Save
 * != Publish").
 *
 * Every route body below runs inside a top-level try/catch — the same
 * hardening `app/api/maps/[mapId]/pois/[poiId]/route.ts`'s own doc comment
 * documents (checkpoint 1B.8 repair round): an uncaught exception must
 * never escape a JSON API route as an HTML error page.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { mapId } = await params;
    const result = await getOwnedMapContext(mapId);
    if (!result.ok) {
      if (isIdentityDenialReason(result.reason)) {
        return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
      }
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }

    const pages = await loadTenantPages(result.context.map.mapId);
    return NextResponse.json({ pages });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pages.get.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
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
      return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can create pages.' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ code: 'map/invalid-input', message: 'Invalid request.' }, { status: 400 });
    }

    const parsed = pageCreateInputSchema.safeParse(body);
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

    const firestore = getFirebaseAdminFirestore();
    const pagesRef = firestore.collection(`maps/${result.context.map.mapId}/pages`);

    const pageId = generatePageId();
    await pagesRef.doc(pageId).set({
      pageId,
      customerId: result.context.map.customerId,
      mapId: result.context.map.mapId,
      title: parsed.data.title,
      content: parsed.data.content,
      ...(parsed.data.translations && Object.keys(parsed.data.translations).length > 0 ? { translations: parsed.data.translations } : {}),
      status: parsed.data.status ?? 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, pageId }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pages.post.unhandled_error', message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ code: 'map/internal-error', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

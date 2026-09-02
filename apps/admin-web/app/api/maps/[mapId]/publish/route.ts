import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { mapSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { buildPublicationContent } from '@/lib/tenant/build-publication-snapshot';
import { generatePublicationId } from '@/lib/tenant/generate-publication-id';
import { loadTenantCategories } from '@/lib/tenant/load-categories';
import { loadTenantMenuItems } from '@/lib/tenant/load-menu-items';
import { loadTenantPages } from '@/lib/tenant/load-pages';
import { loadTenantPois } from '@/lib/tenant/load-pois';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * `POST /api/maps/{mapId}/publish` — checkpoint 1B.8 §11/§12, see
 * docs/architecture/PUBLISHING_ARCHITECTURE.md.
 *
 * The ONLY place a `maps/{mapId}/publications/{publicationId}` document is
 * ever created, and the ONLY place `maps/{mapId}.publication` is ever
 * written — never client-writable directly (Firestore rules deny every
 * client write to both paths; see firebase/functions/test/security-rules/
 * firestore.rules.test.ts's "publications subcollection" block). Same
 * trusted-mutation boundary every other map-scoped write route already
 * uses: `isTrustedOrigin` → `getOwnedMapContext(mapId)` → CLIENT_ADMIN role
 * check → authoritative Firestore reads → write. The browser sends no body
 * at all — it only ever ASKS the server to publish; every byte of the
 * resulting snapshot is derived server-side from the map's own already-
 * verified draft content, never from anything the request supplies (§11:
 * "never accept an arbitrary publication snapshot from browser").
 *
 * Publishes the SAVED Firestore draft only — never unsaved browser state
 * (§14/§17: that distinction is what the live editor preview / draft
 * tourist preview modal are for). `loadTenantCategories`/`loadTenantPois`/
 * `loadTenantMenuItems` are the exact same trusted, already-tenant-scoped
 * loaders every other route already uses; `buildPublicationContent()`
 * (lib/tenant/build-publication-snapshot.ts) applies every "fail closed,
 * only enabled/valid content" rule §13 specifies, reusing
 * `buildPublicMenuProjection()` verbatim rather than recreating menu logic.
 *
 * Atomicity (§12): the map document is re-read and re-validated INSIDE a
 * Firestore transaction, which is also where the next `version` number is
 * computed and both writes (the new immutable publication document, and the
 * map's own `publication` pointer update) are committed together — either
 * both happen or neither does. Categories/POIs/menu items are read just
 * before the transaction (not inside it): a rare edit landing in the
 * fraction of a second between that read and the transaction's commit would
 * at most make one publish reflect content that is a moment stale, which is
 * an acceptable tradeoff for this checkpoint's scope (§12's own atomicity
 * requirement is specifically about the publication-document-plus-pointer
 * WRITE pair never landing only half-done, which this transaction
 * guarantees regardless).
 *
 * Checkpoint 1B.8 repair round — real bug fixed here: `buildPublicationContent()`
 * MUST be called with the map data read FRESH, from inside the transaction
 * (`mapParsed.data` below), never with the earlier `result.context.map` from
 * `getOwnedMapContext()` at the top of this handler. The transaction already
 * re-reads and re-validates the map document for exactly the reason stated
 * above ("never trusts an ownership check that is even a few reads old for a
 * write this consequential") — the previous version of this file re-read
 * the map fresh inside the transaction ONLY to check `customerId`, then
 * discarded that fresh read and built the publication's `map` content from
 * the older, pre-transaction `result.context.map` anyway. That is precisely
 * the bug behind "publication version 2 uses the OLD map name": if the map's
 * `name` (or any other field) changed between `getOwnedMapContext()` being
 * called at the top of this request and the transaction committing, the
 * published snapshot would silently carry the stale value even though the
 * transaction had already proven a fresher one existed. Categories/POIs/menu
 * items keep the documented "read just before the transaction" tradeoff
 * above — only the MAP document itself needs this fix, because it is the
 * one piece of content this function was already re-reading fresh for an
 * unrelated reason (ownership) and then not using.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

class PublishMapGoneError extends Error {}

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
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can publish a map.' }, { status: 403 });
  }

  const resolvedMapId = result.context.map.mapId;
  const resolvedCustomerId = result.context.identity.customer.customerId;
  const publishedByUid = result.context.identity.uid;

  const [categories, pois, menuItems, pages] = await Promise.all([
    loadTenantCategories(resolvedMapId),
    loadTenantPois(resolvedMapId),
    loadTenantMenuItems(resolvedMapId),
    loadTenantPages(resolvedMapId),
  ]);

  const firestore = getFirebaseAdminFirestore();
  const publicationId = generatePublicationId();

  try {
    const outcome = await firestore.runTransaction(async (transaction) => {
      const mapRef = firestore.doc(`maps/${resolvedMapId}`);
      const mapSnap = await transaction.get(mapRef);
      if (!mapSnap.exists) {
        throw new PublishMapGoneError();
      }
      const mapParsed = mapSchema.safeParse(mapSnap.data());
      // Re-verified against the freshest read, not merely trusted from the
      // earlier `getOwnedMapContext()` resolution — this never trusts an
      // ownership check that is even a few reads old for a write this
      // consequential, even though `customerId` never actually changes
      // after creation.
      if (!mapParsed.success || mapParsed.data.customerId !== resolvedCustomerId) {
        throw new PublishMapGoneError();
      }

      // §14/§17 + this repair round's fix: the published `map` content is
      // built from THIS freshly re-read `mapParsed.data`, not from the
      // `result.context.map` resolved at the top of the request — see the
      // file header comment for exactly why that distinction is the fix for
      // "publication version 2 uses the old map name".
      const content = buildPublicationContent(mapParsed.data, categories, pois, menuItems, pages);

      const nextVersion = (mapParsed.data.publication?.version ?? 0) + 1;
      const publishedAt = FieldValue.serverTimestamp();
      const publicationRef = firestore.doc(`maps/${resolvedMapId}/publications/${publicationId}`);

      transaction.set(publicationRef, {
        schemaVersion: 1,
        publicationId,
        mapId: resolvedMapId,
        customerId: resolvedCustomerId,
        version: nextVersion,
        publishedAt,
        publishedByUid,
        map: content.map,
        // checkpoint 1B.17A — captured onto the published snapshot itself;
        // see `PublicationContent.defaultLanguage`'s own doc comment
        // (lib/tenant/build-publication-snapshot.ts) for why this is a copy
        // taken at publish time, not a live reference to the map document.
        defaultLanguage: content.defaultLanguage,
        supportedLanguages: content.supportedLanguages,
        menu: content.menu,
        categories: content.categories,
        pois: content.pois,
        pages: content.pages,
      });

      transaction.update(mapRef, {
        publication: {
          currentPublicationId: publicationId,
          version: nextVersion,
          publishedAt,
          publishedByUid,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { version: nextVersion };
    });

    return NextResponse.json({ ok: true, publicationId, version: outcome.version }, { status: 201 });
  } catch (error) {
    if (error instanceof PublishMapGoneError) {
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }
    throw error;
  }
}

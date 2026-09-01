import { pageSchema, type PageParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';

/**
 * Loads every Page under a tenant's map — checkpoint 1B.11. Shared by
 * `GET /api/maps/{mapId}/pages`, `/admin/maps/{mapId}/pages`'s server-
 * rendered initial load, and `POST /api/maps/{mapId}/publish`, mirroring
 * `load-categories.ts`/`load-pois.ts`'s identical role for their own
 * collections.
 *
 * `mapId` must already come from a trusted source
 * (`getOwnedMapContext()`'s resolved `context.map.mapId`) — same "the
 * collection PATH scopes the result" reasoning those two helpers document.
 *
 * Firestore query: `orderBy('title')` only — a single-field sort needs no
 * composite index, same convention `load-pois.ts` establishes (a Page has
 * no `order` field of its own — see shared-types' `Page` doc comment — so
 * alphabetical-by-title is this list's stable default order, exactly like
 * POIs). A stable `title`/`pageId` tie-break is applied in memory for
 * documents that share a title.
 *
 * Any stored document that fails `pageSchema` validation is skipped
 * (fail-closed, defense-in-depth), mirroring every other `loadTenant*`
 * helper in this directory.
 */
export async function loadTenantPages(mapId: string): Promise<readonly PageParsed[]> {
  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore.collection(`maps/${mapId}/pages`).orderBy('title', 'asc').get();

  const pages: PageParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = pageSchema.safeParse(doc.data());
    if (parsed.success) {
      pages.push(parsed.data);
    } else {
      console.info(JSON.stringify({ event: 'map.pages.invalid_doc_skipped', pageDocId: doc.id }));
    }
  }

  return pages.sort((a, b) => a.title.localeCompare(b.title) || a.pageId.localeCompare(b.pageId));
}

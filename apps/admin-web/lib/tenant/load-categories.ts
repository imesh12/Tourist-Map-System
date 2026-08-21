import { categorySchema, type CategoryParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';

/**
 * Loads every category under a tenant's map — checkpoint 1B.2. Shared by
 * `GET /api/map/categories` and `/admin/categories`'s server-rendered
 * initial load, so "how are categories fetched and sorted" is defined once.
 *
 * `mapId` must already come from a trusted source (`getCurrentClientContext()`'s
 * resolved `context.map.mapId`) — this function does not itself verify a
 * session or tenant ownership; the collection PATH it queries
 * (`maps/{mapId}/categories`) is what scopes the result, so passing a
 * client-supplied `mapId` here would be the security bug, not anything in
 * this function. Typed as a plain `string` (matching `MapParsed['mapId']`
 * from `validation`'s `mapSchema`, which `context.map` already is) rather
 * than shared-types' branded `MapId` — `getCurrentClientContext()` never
 * produces the latter.
 *
 * Firestore query: `orderBy('order')` only — a single-field sort needs no
 * composite index (docs/stages/STAGE_1B_TECHNICAL_PLAN.md's "do not add a
 * speculative index" instruction). The documented `order` ASC, then
 * name/categoryId stable-fallback tie-break is applied in memory instead,
 * which is simpler than proving out a composite index for a Phase-1B-scale
 * category list.
 *
 * Any stored document that fails `categorySchema` validation is skipped
 * (fail-closed, defense-in-depth — mirrors `lib/tenant/client-context.ts`'s
 * treatment of malformed stored data) rather than crashing the whole list.
 */
export async function loadTenantCategories(mapId: string): Promise<readonly CategoryParsed[]> {
  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore.collection(`maps/${mapId}/categories`).orderBy('order', 'asc').get();

  const categories: CategoryParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = categorySchema.safeParse(doc.data());
    if (parsed.success) {
      categories.push(parsed.data);
    } else {
      console.info(JSON.stringify({ event: 'map.categories.invalid_doc_skipped', categoryDocId: doc.id }));
    }
  }

  return categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.categoryId.localeCompare(b.categoryId));
}

import { menuItemSchema, type MenuItemParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';

/**
 * Loads every menu item under a tenant's map — checkpoint 1B.5. Shared by
 * `GET /api/map/menu-items` and `/admin/menu`'s server-rendered initial
 * load, mirroring `load-categories.ts`/`load-pois.ts`'s identical role.
 *
 * `mapId` must already come from a trusted source
 * (`getCurrentClientContext()`'s resolved `context.map.mapId`) — same
 * "the collection PATH scopes the result" reasoning those two helpers
 * document.
 *
 * Firestore query: `orderBy('order')` only — a single-field sort needs no
 * composite index, same convention `load-categories.ts` establishes. A
 * stable `order` ASC, then `label`/`menuItemId` tie-break is applied in
 * memory, mirroring that file's approach exactly.
 *
 * Any stored document that fails `menuItemSchema` validation (including a
 * malformed mixed CATEGORY/FEATURE state, which the discriminated union
 * would reject) is skipped (fail-closed, defense-in-depth), mirroring
 * `load-categories.ts`/`load-pois.ts`.
 */
export async function loadTenantMenuItems(mapId: string): Promise<readonly MenuItemParsed[]> {
  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore.collection(`maps/${mapId}/menuItems`).orderBy('order', 'asc').get();

  const menuItems: MenuItemParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = menuItemSchema.safeParse(doc.data());
    if (parsed.success) {
      menuItems.push(parsed.data);
    } else {
      console.info(JSON.stringify({ event: 'map.menu_items.invalid_doc_skipped', menuItemDocId: doc.id }));
    }
  }

  return menuItems.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.menuItemId.localeCompare(b.menuItemId));
}

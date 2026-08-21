import { poiSchema, type PoiParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';

/**
 * Loads every POI under a tenant's map — checkpoint 1B.3. Shared by
 * `GET /api/map/pois` and `/admin/pois`'s server-rendered initial load,
 * mirroring `load-categories.ts`'s role for categories.
 *
 * `mapId` must already come from a trusted source
 * (`getCurrentClientContext()`'s resolved `context.map.mapId`) — same
 * "the collection PATH scopes the result" reasoning `load-categories.ts`
 * documents.
 *
 * Firestore query: `orderBy('name')` only — a single-field sort needs no
 * composite index, same convention as categories' `orderBy('order')`. POIs
 * have no user-facing manual ordering requirement (unlike categories), so
 * name is a stable, predictable default list order; a stable
 * name/poiId tie-break is applied in memory for documents that share a
 * name.
 *
 * Any stored document that fails `poiSchema` validation is skipped
 * (fail-closed, defense-in-depth), mirroring `load-categories.ts`.
 */
export async function loadTenantPois(mapId: string): Promise<readonly PoiParsed[]> {
  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore.collection(`maps/${mapId}/pois`).orderBy('name', 'asc').get();

  const pois: PoiParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = poiSchema.safeParse(doc.data());
    if (parsed.success) {
      pois.push(parsed.data);
    } else {
      console.info(JSON.stringify({ event: 'map.pois.invalid_doc_skipped', poiDocId: doc.id }));
    }
  }

  return pois.sort((a, b) => a.name.localeCompare(b.name) || a.poiId.localeCompare(b.poiId));
}

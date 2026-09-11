import { liveCameraSchema, type LiveCameraParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';

/**
 * Loads every Live Camera under a tenant's map — LIVE CAMERAS FOUNDATION
 * checkpoint. Shared by `GET /api/maps/{mapId}/cameras`,
 * `/admin/maps/{mapId}/cameras`'s server-rendered initial load, and
 * `POST /api/maps/{mapId}/publish`, mirroring `load-pages.ts`'s identical
 * role for its own collection.
 *
 * `mapId` must already come from a trusted source
 * (`getOwnedMapContext()`'s resolved `context.map.mapId`) — same "the
 * collection PATH scopes the result" reasoning `load-pages.ts`/
 * `load-pois.ts` document.
 *
 * Firestore query: `orderBy('name')` only — a single-field sort needs no
 * composite index, mirroring `load-pages.ts`'s identical convention for a
 * content type with no independent `order` field of its own. A stable
 * `name`/`cameraId` tie-break is applied in memory for documents that share
 * a name.
 *
 * Any stored document that fails `liveCameraSchema` validation is skipped
 * (fail-closed, defense-in-depth), mirroring every other `loadTenant*`
 * helper in this directory.
 */
export async function loadTenantLiveCameras(mapId: string): Promise<readonly LiveCameraParsed[]> {
  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore.collection(`maps/${mapId}/liveCameras`).orderBy('name', 'asc').get();

  const cameras: LiveCameraParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = liveCameraSchema.safeParse(doc.data());
    if (parsed.success) {
      cameras.push(parsed.data);
    } else {
      console.info(JSON.stringify({ event: 'map.live_cameras.invalid_doc_skipped', cameraDocId: doc.id }));
    }
  }

  return cameras.sort((a, b) => a.name.localeCompare(b.name) || a.cameraId.localeCompare(b.cameraId));
}

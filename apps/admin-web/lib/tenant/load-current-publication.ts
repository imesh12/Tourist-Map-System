import { mapIdSchema, mapPublicationSnapshotSchema, mapSchema, type MapPublicationSnapshotParsed } from 'validation';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';

/**
 * The ONE place the "current published snapshot for a mapId" lookup is
 * implemented — Photo Experience Prototype checkpoint. Factored out of
 * `GET /api/public/maps/[mapId]/route.ts` (which used to inline this
 * exact sequence) so the NEW public photo endpoints
 * (`app/api/public/maps/[mapId]/pois/[poiId]/photo{,-meta}/route.ts`) share
 * the identical lookup and identical anti-enumeration behavior, rather than
 * re-implementing (and risking silently diverging from) it. Behavior is
 * unchanged from the original inline version — this is a pure refactor.
 *
 * Returns the FULL `MapPublicationSnapshotParsed` (including
 * `customerId`/`publishedByUid`/`photoProviderRefs` — the server-only
 * fields `PublicMapSnapshot` omits) because the photo endpoints need
 * `photoProviderRefs`; the public snapshot route itself still builds its
 * own narrower `PublicMapSnapshot` response object by hand from this
 * result, exactly as before (see that route's own doc comment for why that
 * pick stays explicit/hand-written rather than becoming implicit here).
 *
 * Returns `undefined` for EVERY reason a caller must treat identically:
 * malformed `mapId`, nonexistent map, a map that has never been published,
 * a dangling `publication.currentPublicationId` pointer, or a publication
 * document that fails schema validation — mirroring the original route's
 * own anti-enumeration doc comment ("never published" and "does not exist"
 * are deliberately collapsed into the exact same outcome). Every caller of
 * this function turns `undefined` into the SAME generic 404 its own
 * anti-enumeration contract requires; this function itself throws nothing.
 */
export async function loadCurrentPublication(mapId: string): Promise<MapPublicationSnapshotParsed | undefined> {
  if (!mapIdSchema.safeParse(mapId).success) {
    return undefined;
  }

  const firestore = getFirebaseAdminFirestore();
  const mapSnap = await firestore.doc(`maps/${mapId}`).get();
  if (!mapSnap.exists) {
    return undefined;
  }

  const mapParsed = mapSchema.safeParse(mapSnap.data());
  if (!mapParsed.success || !mapParsed.data.publication) {
    return undefined;
  }

  const publicationSnap = await firestore.doc(`maps/${mapId}/publications/${mapParsed.data.publication.currentPublicationId}`).get();
  if (!publicationSnap.exists) {
    return undefined;
  }

  const publicationParsed = mapPublicationSnapshotSchema.safeParse(publicationSnap.data());
  if (!publicationParsed.success) {
    return undefined;
  }

  return publicationParsed.data;
}

import { mapSchema, type MapParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';

/**
 * Loads every map belonging to a tenant — checkpoint 1B.6 §5. Backs the
 * Maps dashboard (`/admin/maps`), the admin-shell map switcher, and the
 * deterministic old-URL redirect strategy (§13 — see
 * `lib/tenant/resolve-redirect-map-id.ts`).
 *
 * `customerId` must already come from a trusted source
 * (`getCurrentTenantIdentity()`'s resolved `identity.customer.customerId`)
 * — same "the caller is responsible for only ever passing a
 * server-verified value in" contract `load-categories.ts`/`load-pois.ts`/
 * `load-menu-items.ts` already document for `mapId`.
 *
 * Ordered by `createdAt` ascending (oldest/"first" map first), then
 * `mapId` as a stable tie-break for documents sharing a timestamp
 * (extremely unlikely in practice, but keeps the sort function total) —
 * this is what makes "the tenant's first map" a well-defined, deterministic
 * concept for both the dashboard's default display order and §13's
 * redirect strategy, without needing a separate "is this the first map"
 * flag on the document itself.
 */
export async function listOwnedMaps(customerId: string): Promise<readonly MapParsed[]> {
  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore.collection('maps').where('customerId', '==', customerId).get();

  const maps: MapParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = mapSchema.safeParse(doc.data());
    if (parsed.success) {
      maps.push(parsed.data);
    } else {
      console.info(JSON.stringify({ event: 'tenant.maps.invalid_doc_skipped', mapDocId: doc.id }));
    }
  }

  return maps.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt) || a.mapId.localeCompare(b.mapId));
}

/**
 * Resolves the deterministic "first map" for a tenant — the one old,
 * pre-1B.6 single-map URLs (`/admin/map`, `/admin/categories`, `/admin/pois`,
 * `/admin/menu`) redirect to, per §13: "redirect ... ONLY when an
 * appropriate owned map can be deterministically selected." A tenant with
 * zero maps (should not occur post-provisioning, but is not assumed
 * impossible) returns `undefined` rather than fabricating one.
 */
export async function resolveFirstOwnedMapId(customerId: string): Promise<string | undefined> {
  const maps = await listOwnedMaps(customerId);
  return maps[0]?.mapId;
}

function toMillis(timestamp: MapParsed['createdAt']): number {
  // `FirestoreTimestampLike` (packages/shared-types/src/timestamp.ts) is a
  // structural `{ seconds, nanoseconds }` shape, not a real
  // `firebase-admin` `Timestamp` instance once it has round-tripped through
  // `mapSchema.safeParse()` — so this converts by hand rather than assuming
  // a `.toMillis()` method exists.
  return timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1_000_000);
}

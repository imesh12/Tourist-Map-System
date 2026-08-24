import type { CategoryIcon, MenuItemStatus } from './enums.js';
import type { CategoryId, CustomerId, MapId, MenuItemId } from './ids.js';
import type { ReleasedFeatureKey } from './public-feature.js';
import type { FirestoreTimestampLike } from './timestamp.js';

/**
 * `maps/{mapId}/menuItems/{menuItemId}` — checkpoint 1B.5, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md §12. Nested under its owning
 * map, exactly like `Category`/`Poi` — not a top-level collection (§4 of the
 * checkpoint is explicit: "Do not create a top-level menuItems collection").
 *
 * CATEGORY != MENU ITEM (§1 of the checkpoint): a `Category` is taxonomy a
 * tenant defines; a `MenuItem` is a SEPARATE decision about which of those
 * categories (plus which platform FEATUREs) actually appear in the public
 * navigation, under what custom label, in what order. Creating/editing a
 * `MenuItem` never renames or mutates the `Category`/feature it references —
 * `label` here is the menu's own public-facing text, independent of
 * `Category.name`.
 *
 * A REAL discriminated union on `type`, not two optional fields on one flat
 * shape (§3: "Do not support malformed mixed states") — `MenuItemCategory`
 * always carries `categoryId` and never `featureKey`; `MenuItemFeature`
 * always carries `featureKey` and never `categoryId`. TypeScript itself
 * rejects constructing (or reading a narrowed instance of) a value with both
 * or neither, and `menuItemSchema`/`menuItemCreateInputSchema`
 * (packages/validation/src/menu-item.ts) enforce the exact same shape at the
 * runtime/API boundary via `z.discriminatedUnion('type', ...)`.
 *
 * `customerId`/`mapId` are stored explicitly (not merely implied by the
 * Firestore path) — the same defense-in-depth pattern `Category`/`Poi`
 * already establish; both are written exclusively by trusted backend code.
 *
 * `icon` is an OPTIONAL client override, meaningful only on a
 * `MenuItemCategory` (§16: "CATEGORY menu item: default to category icon;
 * FEATURE menu item: default to registry icon" — a `FEATURE` item's icon is
 * never client-chosen, always the registry's own `PublicFeatureRegistryEntry.icon`,
 * so `MenuItemFeature` has no `icon` field at all). When absent on a
 * `MenuItemCategory`, the effective display icon is the linked `Category`'s
 * own `icon` — resolved at render/projection time
 * (`apps/admin-web/lib/tenant/menu-projection.ts`), never denormalized/copied
 * onto the stored `MenuItem` document itself (so a later category icon
 * change is reflected automatically, exactly like `Category.name` already
 * is NOT copied here either — the whole point of `label` existing
 * separately).
 *
 * `order`/`status` mirror `Category`'s own fields exactly (a numeric
 * authoritative order, an explicit enum status) — see §14/§15 of the
 * checkpoint.
 */
interface MenuItemCommon {
  readonly menuItemId: MenuItemId;
  readonly customerId: CustomerId;
  readonly mapId: MapId;
  readonly label: string;
  readonly order: number;
  readonly status: MenuItemStatus;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

export interface MenuItemCategory extends MenuItemCommon {
  readonly type: 'CATEGORY';
  readonly categoryId: CategoryId;
  readonly icon?: CategoryIcon;
}

export interface MenuItemFeature extends MenuItemCommon {
  readonly type: 'FEATURE';
  readonly featureKey: ReleasedFeatureKey;
}

export type MenuItem = MenuItemCategory | MenuItemFeature;

import { getPublicFeatureRegistryEntry, type CategoryIcon } from 'shared-types';
import type { CategoryParsed, MenuItemParsed } from 'validation';

/**
 * `buildPublicMenuProjection()` — checkpoint 1B.5 §21, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md §12.
 *
 * A PURE function — no Firestore, no Next.js, no network. Takes the two
 * lists an already-authenticated caller has already loaded
 * (`loadTenantMenuItems()`/`loadTenantCategories()`) and derives what the
 * FUTURE public tourist map's navigation config would look like, entirely
 * in memory. This is the one and only place that future chain
 * (PLATFORM CATEGORY/FEATURE REGISTRY → CLIENT CATEGORY → MENU ITEM →
 * PUBLIC MENU PROJECTION → PUBLIC MAP UI, §22) is actually implemented, up
 * to and including this step — nothing calls this function from any public/
 * unauthenticated route yet (§21: "Do NOT expose this publicly yet"); it
 * exists so the shape is settled and heavily unit-tested the moment a real
 * public-map checkpoint needs it, rather than inventing it ad hoc then.
 *
 * Rules (§21), each enforced by a single early-exit `continue` so no
 * exception can ever propagate out of this function for any malformed
 * input:
 * - `status !== 'ENABLED'` → excluded (disabled menu items never render).
 * - Ordered by `order` ascending (`menuItemId` as a stable tie-break for
 *   two items that somehow share an `order` value).
 * - A `CATEGORY` item whose `categoryId` doesn't resolve against the
 *   supplied `categories` list, OR whose resolved category is itself
 *   `enabled: false`, is excluded — "fail closed on a broken/disabled
 *   reference", never a thrown error and never a projection entry with a
 *   dangling `categoryId`. This is also what §11's documented invariant
 *   ("existing menu items referencing a later-disabled category should fail
 *   safe... do not silently delete them") actually cashes out to: the
 *   `MenuItem` document is untouched, only excluded from THIS projection.
 * - A `FEATURE` item whose `featureKey` doesn't resolve to a currently
 *   `released` entry in `PUBLIC_FEATURE_REGISTRY` is excluded the same way
 *   — a feature retired in a future deploy stops appearing with zero data
 *   migration, mirroring `resolveCategoryCapability`'s identical
 *   re-check-the-current-registry-on-every-call design (checkpoint 1B.4).
 *
 * Effective `icon` (§16): a `CATEGORY` item uses its own `icon` override if
 * set, else the linked category's `icon`; a `FEATURE` item always uses its
 * registry entry's `icon` (never client-overridable — see `MenuItemFeature`
 * in shared-types, which has no `icon` field to begin with).
 */

export interface PublicMenuProjectionCategoryItem {
  readonly type: 'CATEGORY';
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly categoryId: string;
}

export interface PublicMenuProjectionFeatureItem {
  readonly type: 'FEATURE';
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly featureKey: string;
}

export type PublicMenuProjectionItem = PublicMenuProjectionCategoryItem | PublicMenuProjectionFeatureItem;

export function buildPublicMenuProjection(
  menuItems: readonly MenuItemParsed[],
  categories: readonly CategoryParsed[],
): readonly PublicMenuProjectionItem[] {
  const categoryById = new Map(categories.map((category) => [category.categoryId, category] as const));

  const sorted = [...menuItems].sort((a, b) => a.order - b.order || a.menuItemId.localeCompare(b.menuItemId));

  const projection: PublicMenuProjectionItem[] = [];
  for (const item of sorted) {
    if (item.status !== 'ENABLED') {
      continue;
    }

    if (item.type === 'CATEGORY') {
      const category = categoryById.get(item.categoryId);
      if (!category || !category.enabled) {
        // Broken (deleted) or disabled category reference — fail closed,
        // never render, never throw. The MenuItem document itself is left
        // completely untouched by this function.
        continue;
      }
      projection.push({
        type: 'CATEGORY',
        label: item.label,
        icon: item.icon ?? category.icon,
        categoryId: item.categoryId,
      });
      continue;
    }

    const registryEntry = getPublicFeatureRegistryEntry(item.featureKey);
    if (!registryEntry || !registryEntry.released) {
      // Unknown/retired feature key — fail closed the same way.
      continue;
    }
    projection.push({
      type: 'FEATURE',
      label: item.label,
      icon: registryEntry.icon,
      featureKey: item.featureKey,
    });
  }

  return projection;
}

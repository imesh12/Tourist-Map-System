import type { CategoryIcon } from './enums.js';

/**
 * PUBLIC_FEATURE_REGISTRY — checkpoint 1B.5, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md §12.
 *
 * Mirrors `PLATFORM_CATEGORY_REGISTRY`'s (./platform-category.js) exact
 * shape and reasoning: a small, developer-owned, code-based catalog
 * standing in for a future Super-Admin-managed feature-release mechanism,
 * NOT full Super Admin feature management (explicitly out of scope for this
 * checkpoint). A `FEATURE`-typed `MenuItem` (./menu-item.js) may only ever
 * reference one of THESE keys — `menuItemFeatureKeySchema`
 * (packages/validation/src/menu-item.ts) is a closed `z.enum` over
 * `RELEASED_FEATURE_KEYS`, never a bare string, so "only released feature
 * keys are selectable" (§7 of the checkpoint) is a server-enforced
 * invariant, not merely a UI convention.
 *
 * Only `SEARCH` and `MY_LOCATION` are released today — the checkpoint's own
 * "recommended safe first features" list. Every other potential future
 * feature (`MODEL_COURSE`, `AUDIO_GUIDE`, `RANKING`, `FAVORITES`,
 * `LANGUAGE`, `WEATHER`) is deliberately NOT a member of this registry —
 * adding one is a future checkpoint's decision once that feature has "a
 * clear future behavior contract" (§6), not a placeholder added speculatively
 * here. `contract` below is exactly that documented-but-unbuilt behavior
 * note (§24/§25: "define only its menu identity/contract... do NOT
 * implement" the real public behavior yet).
 *
 * Icon choice reuses the SAME controlled `CategoryIcon` catalog
 * `PlatformCategoryRegistryEntry.icon` already draws from (§16 of the
 * checkpoint: "Reuse controlled icon strategy") rather than introducing a
 * second icon vocabulary just for features — `CategoryIcon` was never
 * actually category-exclusive, it is simply "a controlled icon identifier",
 * and admin-web's `CATEGORY_ICON_META` (apps/admin-web/app/(protected)/admin/categories/category-icons.ts)
 * already has a lookup entry for every value here.
 */
export const RELEASED_FEATURE_KEYS = ['SEARCH', 'MY_LOCATION'] as const;
export type ReleasedFeatureKey = (typeof RELEASED_FEATURE_KEYS)[number];

export interface PublicFeatureRegistryEntry {
  readonly key: ReleasedFeatureKey;
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly released: boolean;
  /** The documented, NOT-YET-BUILT future public behavior this feature identity will eventually drive — see §24/§25 of the checkpoint. Read only; no code branches on this string. */
  readonly futureBehaviorContract: string;
}

export const PUBLIC_FEATURE_REGISTRY: Readonly<Record<ReleasedFeatureKey, PublicFeatureRegistryEntry>> = {
  SEARCH: {
    key: 'SEARCH',
    label: 'Search',
    icon: 'INFORMATION',
    released: true,
    futureBehaviorContract:
      'Will later search this map’s enabled, public-visible POIs and categories by name/keyword. No search engine, index, or public UI exists yet — this checkpoint only reserves the menu identity.',
  },
  MY_LOCATION: {
    key: 'MY_LOCATION',
    label: 'My Location',
    icon: 'SIGHTSEEING',
    released: true,
    futureBehaviorContract:
      'Will later request the tourist’s device geolocation (with consent) and center/orient the public map on it. No geolocation permission flow or public map behavior exists yet — this checkpoint only reserves the menu identity.',
  },
};

/** Safe lookup by an untrusted/arbitrary string (e.g. a stored `MenuItem.featureKey`) — returns `undefined` rather than throwing for any value not in the registry, mirroring `getPlatformCategoryRegistryEntry`. */
export function getPublicFeatureRegistryEntry(featureKey: string): PublicFeatureRegistryEntry | undefined {
  return (PUBLIC_FEATURE_REGISTRY as Readonly<Record<string, PublicFeatureRegistryEntry | undefined>>)[featureKey];
}

/** Every currently-released feature — what the Menu Builder's "Add Feature" selection offers (never a hypothetical full registry, mirroring `listActivePlatformCategories`). */
export function listReleasedFeatures(): readonly PublicFeatureRegistryEntry[] {
  return Object.values(PUBLIC_FEATURE_REGISTRY).filter((entry) => entry.released);
}

import { getPlatformCategoryRegistryEntry, platformCategorySupportsGooglePlaces, type PlatformCategoryRegistryEntry } from 'shared-types';
import type { CategoryParsed } from 'validation';

/**
 * Resolves a tenant `Category`'s linked platform capability, if any —
 * checkpoint 1B.4. The one place both server routes
 * (`app/api/map/pois/discover/route.ts`, `app/api/map/pois/import/route.ts`)
 * and the client-side Discover Places UI (`discover-places-drawer.tsx`)
 * derive "is this category eligible for Google Places" from, so the
 * eligibility rule is defined exactly once.
 *
 * Safe by construction against a stale/forged `platformCategoryId`: a
 * category's stored `platformCategoryId` is validated at write time
 * (`categoryPlatformCategoryIdSchema`, packages/validation/src/category.ts)
 * against the CURRENT registry, but the registry itself could in principle
 * shrink in a future deploy (an entry retired) — `resolveCategoryCapability`
 * re-checks against `PLATFORM_CATEGORY_REGISTRY` on every call rather than
 * trusting that a stored ID was valid when it was first linked, so a
 * retired/removed entry correctly stops granting capability without any
 * data migration.
 */
export function resolveCategoryCapability(category: Pick<CategoryParsed, 'platformCategoryId'>): PlatformCategoryRegistryEntry | undefined {
  if (!category.platformCategoryId) {
    return undefined;
  }
  return getPlatformCategoryRegistryEntry(category.platformCategoryId);
}

/** Whether a tenant category is currently eligible for Google Places discovery/import — the single check the discover/import routes and the Discover Places UI all share. */
export function categorySupportsGooglePlacesDiscovery(category: Pick<CategoryParsed, 'platformCategoryId'>): boolean {
  return platformCategorySupportsGooglePlaces(resolveCategoryCapability(category));
}

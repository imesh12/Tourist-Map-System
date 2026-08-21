import { describe, expect, it } from 'vitest';
import {
  PLATFORM_CATEGORY_REGISTRY,
  RELEASED_PLATFORM_CATEGORY_IDS,
  getPlatformCategoryRegistryEntry,
  listActivePlatformCategories,
  platformCategorySupportsGooglePlaces,
} from './platform-category.js';

/**
 * PlatformCategoryRegistry unit tests — checkpoint 1B.4. Proves the
 * registry's own invariants (every released ID resolves, retired/unknown IDs
 * do not, the Restaurant entry actually carries Google Places capability)
 * rather than assuming the shape from reading the source.
 */

describe('PLATFORM_CATEGORY_REGISTRY', () => {
  it('has exactly one entry per RELEASED_PLATFORM_CATEGORY_IDS value', () => {
    for (const id of RELEASED_PLATFORM_CATEGORY_IDS) {
      expect(PLATFORM_CATEGORY_REGISTRY[id]).toBeDefined();
      expect(PLATFORM_CATEGORY_REGISTRY[id].platformCategoryId).toBe(id);
    }
  });

  it('releases RESTAURANT as ACTIVE with both CLIENT_CUSTOM and GOOGLE_PLACES allowed sources', () => {
    const restaurant = PLATFORM_CATEGORY_REGISTRY.platcat_restaurant;
    expect(restaurant.key).toBe('RESTAURANT');
    expect(restaurant.status).toBe('ACTIVE');
    expect(restaurant.allowedSources).toContain('CLIENT_CUSTOM');
    expect(restaurant.allowedSources).toContain('GOOGLE_PLACES');
    expect(restaurant.supportsManualContent).toBe(true);
    expect(restaurant.googlePlaces?.includedTypes).toContain('restaurant');
  });
});

describe('getPlatformCategoryRegistryEntry', () => {
  it('resolves a known released platformCategoryId', () => {
    expect(getPlatformCategoryRegistryEntry('platcat_restaurant')?.key).toBe('RESTAURANT');
  });

  it('returns undefined for an unknown/forged platformCategoryId', () => {
    expect(getPlatformCategoryRegistryEntry('platcat_does_not_exist')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getPlatformCategoryRegistryEntry('')).toBeUndefined();
  });
});

describe('listActivePlatformCategories', () => {
  it('includes the released Restaurant category', () => {
    const active = listActivePlatformCategories();
    expect(active.some((entry) => entry.platformCategoryId === 'platcat_restaurant')).toBe(true);
  });

  it('never includes a RETIRED entry', () => {
    const active = listActivePlatformCategories();
    expect(active.every((entry) => entry.status === 'ACTIVE')).toBe(true);
  });
});

describe('platformCategorySupportsGooglePlaces', () => {
  it('is true for the released Restaurant entry', () => {
    expect(platformCategorySupportsGooglePlaces(PLATFORM_CATEGORY_REGISTRY.platcat_restaurant)).toBe(true);
  });

  it('is false for an undefined entry (e.g. an unlinked/custom category)', () => {
    expect(platformCategorySupportsGooglePlaces(undefined)).toBe(false);
  });

  it('is false for a RETIRED entry', () => {
    expect(
      platformCategorySupportsGooglePlaces({
        ...PLATFORM_CATEGORY_REGISTRY.platcat_restaurant,
        status: 'RETIRED',
      }),
    ).toBe(false);
  });

  it('is false for an entry whose allowedSources omits GOOGLE_PLACES', () => {
    expect(
      platformCategorySupportsGooglePlaces({
        ...PLATFORM_CATEGORY_REGISTRY.platcat_restaurant,
        allowedSources: ['CLIENT_CUSTOM'],
      }),
    ).toBe(false);
  });
});

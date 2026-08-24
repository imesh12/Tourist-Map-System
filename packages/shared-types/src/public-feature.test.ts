import { describe, expect, it } from 'vitest';
import {
  PUBLIC_FEATURE_REGISTRY,
  RELEASED_FEATURE_KEYS,
  getPublicFeatureRegistryEntry,
  listReleasedFeatures,
} from './public-feature.js';

/**
 * PUBLIC_FEATURE_REGISTRY unit tests — checkpoint 1B.5, mirrors
 * platform-category.test.ts's own coverage shape.
 */

describe('PUBLIC_FEATURE_REGISTRY', () => {
  it('has exactly one entry per RELEASED_FEATURE_KEYS value', () => {
    for (const key of RELEASED_FEATURE_KEYS) {
      expect(PUBLIC_FEATURE_REGISTRY[key]).toBeDefined();
      expect(PUBLIC_FEATURE_REGISTRY[key].key).toBe(key);
    }
  });

  it('releases exactly SEARCH and MY_LOCATION, both released: true', () => {
    expect(RELEASED_FEATURE_KEYS).toEqual(['SEARCH', 'MY_LOCATION']);
    expect(PUBLIC_FEATURE_REGISTRY.SEARCH.released).toBe(true);
    expect(PUBLIC_FEATURE_REGISTRY.MY_LOCATION.released).toBe(true);
  });

  it('never releases a future feature key not yet in the registry', () => {
    const keys = Object.keys(PUBLIC_FEATURE_REGISTRY);
    for (const future of ['MODEL_COURSE', 'AUDIO_GUIDE', 'RANKING', 'FAVORITES', 'LANGUAGE', 'WEATHER']) {
      expect(keys).not.toContain(future);
    }
  });
});

describe('getPublicFeatureRegistryEntry', () => {
  it('resolves a known released featureKey', () => {
    expect(getPublicFeatureRegistryEntry('SEARCH')?.label).toBe('Search');
    expect(getPublicFeatureRegistryEntry('MY_LOCATION')?.label).toBe('My Location');
  });

  it('returns undefined for an unknown/forged featureKey', () => {
    expect(getPublicFeatureRegistryEntry('RANKING')).toBeUndefined();
    expect(getPublicFeatureRegistryEntry('does-not-exist')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getPublicFeatureRegistryEntry('')).toBeUndefined();
  });
});

describe('listReleasedFeatures', () => {
  it('includes both released features', () => {
    const released = listReleasedFeatures();
    expect(released.some((entry) => entry.key === 'SEARCH')).toBe(true);
    expect(released.some((entry) => entry.key === 'MY_LOCATION')).toBe(true);
  });

  it('every listed entry is released: true', () => {
    expect(listReleasedFeatures().every((entry) => entry.released)).toBe(true);
  });
});

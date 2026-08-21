import { describe, expect, it } from 'vitest';
import { categorySupportsGooglePlacesDiscovery, resolveCategoryCapability } from './category-capabilities';

describe('resolveCategoryCapability', () => {
  it('returns undefined for a category with no platformCategoryId (a purely custom category)', () => {
    expect(resolveCategoryCapability({ platformCategoryId: undefined })).toBeUndefined();
  });

  it('resolves the released Restaurant entry for a linked category', () => {
    const entry = resolveCategoryCapability({ platformCategoryId: 'platcat_restaurant' });
    expect(entry?.key).toBe('RESTAURANT');
  });

  it('returns undefined for an unknown/forged platformCategoryId', () => {
    expect(resolveCategoryCapability({ platformCategoryId: 'platcat_forged' })).toBeUndefined();
  });
});

describe('categorySupportsGooglePlacesDiscovery', () => {
  it('is false for an unlinked category', () => {
    expect(categorySupportsGooglePlacesDiscovery({ platformCategoryId: undefined })).toBe(false);
  });

  it('is true for a category linked to the released Restaurant platform category', () => {
    expect(categorySupportsGooglePlacesDiscovery({ platformCategoryId: 'platcat_restaurant' })).toBe(true);
  });

  it('is false for an unknown/forged platformCategoryId', () => {
    expect(categorySupportsGooglePlacesDiscovery({ platformCategoryId: 'platcat_forged' })).toBe(false);
  });
});

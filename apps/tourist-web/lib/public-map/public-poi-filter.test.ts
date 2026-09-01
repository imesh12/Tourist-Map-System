import { describe, expect, it } from 'vitest';
import type { PublishedPoi } from 'shared-types';
import { filterPoisByCategory } from './public-poi-filter';

const RESTAURANT: PublishedPoi = {
  poiId: 'poi_1',
  categoryId: 'cat_restaurant',
  name: 'Sushi Place',
  location: { latitude: 35.0, longitude: 135.0 },
};

const SHOP: PublishedPoi = {
  poiId: 'poi_2',
  categoryId: 'cat_shopping',
  name: 'Souvenir Shop',
  location: { latitude: 35.1, longitude: 135.1 },
};

const POIS: readonly PublishedPoi[] = [RESTAURANT, SHOP];

describe('filterPoisByCategory — checkpoint 1B.10 §6', () => {
  it('null (All) returns every published POI', () => {
    expect(filterPoisByCategory(POIS, null)).toEqual(POIS);
  });

  it('a specific categoryId returns only matching POIs', () => {
    expect(filterPoisByCategory(POIS, 'cat_restaurant')).toEqual([RESTAURANT]);
  });

  it('an unknown categoryId returns an empty list rather than throwing or falling back to All', () => {
    expect(filterPoisByCategory(POIS, 'cat_does_not_exist')).toEqual([]);
  });

  it('an empty POI list returns an empty list regardless of categoryId', () => {
    expect(filterPoisByCategory([], null)).toEqual([]);
    expect(filterPoisByCategory([], 'cat_restaurant')).toEqual([]);
  });
});

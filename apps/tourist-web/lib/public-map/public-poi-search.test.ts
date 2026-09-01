import { describe, expect, it } from 'vitest';
import type { PublishedCategory, PublishedPoi } from 'shared-types';
import { searchPois } from './public-poi-search';

const RESTAURANT_CATEGORY: PublishedCategory = { categoryId: 'cat_restaurant', name: 'Restaurants', icon: 'FOOD' };
const SHOPPING_CATEGORY: PublishedCategory = { categoryId: 'cat_shopping', name: 'Shopping', icon: 'SHOPPING' };
const CATEGORIES: readonly PublishedCategory[] = [RESTAURANT_CATEGORY, SHOPPING_CATEGORY];

const SUSHI: PublishedPoi = {
  poiId: 'poi_1',
  categoryId: 'cat_restaurant',
  name: 'Sushi Place',
  location: { latitude: 35.0, longitude: 135.0 },
  description: 'Fresh seasonal nigiri near the station.',
};

const SHOP: PublishedPoi = {
  poiId: 'poi_2',
  categoryId: 'cat_shopping',
  name: 'Souvenir Shop',
  location: { latitude: 35.1, longitude: 135.1 },
};

const POIS: readonly PublishedPoi[] = [SUSHI, SHOP];

describe('searchPois — checkpoint 1B.10 §9', () => {
  it('matches case-insensitively against the POI name', () => {
    expect(searchPois(POIS, CATEGORIES, 'sushi')).toEqual([SUSHI]);
    expect(searchPois(POIS, CATEGORIES, 'SUSHI')).toEqual([SUSHI]);
  });

  it('matches against the POI description when present', () => {
    expect(searchPois(POIS, CATEGORIES, 'nigiri')).toEqual([SUSHI]);
  });

  it('matches against the resolved category name', () => {
    expect(searchPois(POIS, CATEGORIES, 'shopping')).toEqual([SHOP]);
  });

  it('returns an empty array for a query with no match', () => {
    expect(searchPois(POIS, CATEGORIES, 'ramen')).toEqual([]);
  });

  it('returns an empty array for an empty or whitespace-only query, never "all"', () => {
    expect(searchPois(POIS, CATEGORIES, '')).toEqual([]);
    expect(searchPois(POIS, CATEGORIES, '   ')).toEqual([]);
  });

  it('never surfaces a POI absent from the input list — disabled/unpublished content is safe by construction', () => {
    // A POI/category this function is never given (because publication
    // already excluded it) cannot appear — proven here by simply never
    // including it in the input.
    expect(searchPois([], CATEGORIES, 'sushi')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { PublishedPoi } from 'shared-types';
import { computeBoundsForPois } from './map-camera-utils';

function poi(latitude: number, longitude: number): PublishedPoi {
  return { poiId: `poi_${latitude}_${longitude}`, categoryId: 'cat_1', name: 'x', location: { latitude, longitude } };
}

describe('computeBoundsForPois — checkpoint 1B.10 §12', () => {
  it('returns null for an empty list', () => {
    expect(computeBoundsForPois([])).toBeNull();
  });

  it('returns null for a single POI — nothing meaningful to fit', () => {
    expect(computeBoundsForPois([poi(35, 135)])).toBeNull();
  });

  it('returns the tight bounding box for two or more POIs', () => {
    const bounds = computeBoundsForPois([poi(35.0, 135.0), poi(35.2, 135.5), poi(34.8, 135.3)]);
    expect(bounds).toEqual({ north: 35.2, south: 34.8, east: 135.5, west: 135.0 });
  });
});

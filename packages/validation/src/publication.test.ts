import { describe, expect, it } from 'vitest';
import { mapPublicationSnapshotSchema } from './publication';

/**
 * `mapPublicationSnapshotSchema` unit tests — checkpoint 1B.8 §23. Mirrors
 * `map.test.ts`'s convention (a `validX` base fixture, spread-and-override
 * per test) — this is the defense-in-depth read-side schema for a stored
 * `maps/{mapId}/publications/{publicationId}` document, exercised directly
 * by `GET /api/public/maps/{mapId}` before a snapshot is ever returned to a
 * caller.
 */

const validSnapshot = {
  schemaVersion: 1,
  publicationId: 'pub_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  version: 1,
  publishedAt: { seconds: 1700000000, nanoseconds: 0 },
  publishedByUid: 'uid_admin_a',
  map: {
    name: 'Kyoto Tours Map',
    mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
    area: { type: 'UNBOUNDED' },
    theme: {
      preset: 'STANDARD',
      visibility: {
        businessPois: true,
        transit: true,
        schools: true,
        hospitals: true,
        parks: true,
        roadLabels: true,
        transitLabels: true,
      },
      markerStyle: { style: 'PIN', size: 'MEDIUM' },
    },
  },
  menu: [
    { type: 'CATEGORY', label: 'Restaurants', icon: 'FOOD', categoryId: 'cat_aB3dEf6gH9jKlMn0pQ' },
    { type: 'FEATURE', label: 'Search', icon: 'INFORMATION', featureKey: 'SEARCH' },
  ],
  categories: [{ categoryId: 'cat_aB3dEf6gH9jKlMn0pQ', name: 'Restaurants', icon: 'FOOD' }],
  pois: [
    {
      poiId: 'poi_aB3dEf6gH9jKlMn0pQ',
      categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
      name: 'Sakura Restaurant',
      location: { latitude: 35.0116, longitude: 135.7681 },
    },
  ],
};

describe('mapPublicationSnapshotSchema', () => {
  it('accepts a fully-populated valid publication snapshot', () => {
    expect(mapPublicationSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  it('accepts a snapshot with empty menu/categories/pois arrays (a map with no publishable content yet)', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, menu: [], categories: [], pois: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a POI with optional address/description', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pois: [{ ...validSnapshot.pois[0], address: '1 Main St, Kyoto', description: 'A cozy spot' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a snapshot with branding set', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      map: { ...validSnapshot.map, branding: { primaryColor: '#112233', secondaryColor: '#445566' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a schemaVersion other than 1', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, schemaVersion: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a version below 1', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, version: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a publicationId using the wrong prefix', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, publicationId: 'map_aB3dEf6gH9jKlMn0pQ' });
    expect(result.success).toBe(false);
  });

  it('rejects a mapId that does not match the mapId format', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, mapId: 'not-a-map-id' });
    expect(result.success).toBe(false);
  });

  it('rejects a menu item mixing categoryId and featureKey (malformed mixed state)', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      menu: [{ type: 'CATEGORY', label: 'Broken', icon: 'FOOD', categoryId: 'cat_aB3dEf6gH9jKlMn0pQ', featureKey: 'SEARCH' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a CATEGORY menu item missing categoryId', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      menu: [{ type: 'CATEGORY', label: 'Broken', icon: 'FOOD' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown menu item type', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      menu: [{ type: 'FEATURE_FLAG', label: 'Broken' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a category missing an icon', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      categories: [{ categoryId: 'cat_aB3dEf6gH9jKlMn0pQ', name: 'Restaurants' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a POI with an out-of-range latitude', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pois: [{ ...validSnapshot.pois[0], location: { latitude: 999, longitude: 135.7681 } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a map summary missing theme (a snapshot must always carry a fully-resolved theme)', () => {
    const mapWithoutTheme = {
      name: validSnapshot.map.name,
      mapProvider: validSnapshot.map.mapProvider,
      area: validSnapshot.map.area,
    };
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, map: mapWithoutTheme });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized extra top-level field (.strict())', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, publicUrl: 'https://forged.example.com/hijack' });
    expect(result.success).toBe(false);
  });

  it('rejects customerId/publishedByUid being absent (the full stored-document shape always carries both, even though PublicMapSnapshot omits them on the way out)', () => {
    const withoutCustomerId: Record<string, unknown> = { ...validSnapshot };
    delete withoutCustomerId.customerId;
    expect(mapPublicationSnapshotSchema.safeParse(withoutCustomerId).success).toBe(false);

    const withoutPublishedByUid: Record<string, unknown> = { ...validSnapshot };
    delete withoutPublishedByUid.publishedByUid;
    expect(mapPublicationSnapshotSchema.safeParse(withoutPublishedByUid).success).toBe(false);
  });
});

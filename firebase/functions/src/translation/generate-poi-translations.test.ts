import { describe, expect, it } from 'vitest';
import { hasClientAdminClaims, resolvePoiSourceText } from './generate-poi-translations.js';
import type { PoiParsed } from 'validation';

const poi = {
  poiId: 'poi_aB3dEf6gH9jKlMn0pQ', customerId: 'cust_aB3dEf6gH9jKlMn0pQ', mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  categoryId: 'cat_aB3dEf6gH9jKlMn0pQ', name: 'Legacy name', location: { latitude: 1, longitude: 2 },
  sourceType: 'CLIENT_CUSTOM', status: 'ENABLED', createdAt: { seconds: 1, nanoseconds: 0 }, updatedAt: { seconds: 1, nanoseconds: 0 },
} as PoiParsed;

describe('POI translation source resolution', () => {
  it('prefers the map default-language translation', () => {
    expect(resolvePoiSourceText({ ...poi, translations: { name: { ja: '東京タワー' } } }, 'name', 'ja')).toBe('東京タワー');
  });
  it('falls back to the legacy scalar for old POIs', () => {
    expect(resolvePoiSourceText(poi, 'name', 'ja')).toBe('Legacy name');
  });
  it('returns undefined for an unavailable optional field', () => {
    expect(resolvePoiSourceText(poi, 'description', 'ja')).toBeUndefined();
  });
});

describe('POI translation callable authorization claims', () => {
  it('accepts server-resolved Client Admin claims', () => {
    expect(hasClientAdminClaims({ role: 'CLIENT_ADMIN', customerId: 'cust_123' })).toBe(true);
  });
  it('rejects missing, non-admin, and empty claims', () => {
    expect(hasClientAdminClaims({})).toBe(false);
    expect(hasClientAdminClaims({ role: 'CLIENT_EDITOR', customerId: 'cust_123' })).toBe(false);
    expect(hasClientAdminClaims({ role: 'CLIENT_ADMIN', customerId: '' })).toBe(false);
  });
});

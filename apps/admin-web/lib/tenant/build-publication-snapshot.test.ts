import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_THEME } from 'shared-types';
import type { CategoryParsed, MapParsed, MenuItemParsed, PoiParsed } from 'validation';
import { buildPublicationContent } from './build-publication-snapshot';

/**
 * `buildPublicationContent()` unit tests — checkpoint 1B.8 §13/§23. Mirrors
 * `menu-projection.test.ts`'s own fixture-builder convention (a small
 * `overrides`-accepting factory per document type) rather than repeating a
 * full literal in every test. Focuses on exactly the content-selection
 * rules the checkpoint calls out: disabled categories/POIs excluded, a POI
 * referencing a disabled or nonexistent category excluded, the menu
 * projection is delegated to (not reimplemented by) this function, and the
 * map summary's `theme` is always fully resolved.
 */

const TIMESTAMP = { seconds: 1700000000, nanoseconds: 0 };

function map(overrides: Partial<MapParsed> = {}): MapParsed {
  return {
    mapId: 'map_a0000000000000000000000',
    customerId: 'cust_a0000000000000000000',
    name: 'Kyoto Tours Map',
    status: 'DRAFT',
    defaultLanguage: 'EN',
    enabledLanguages: ['EN'],
    mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
    area: { type: 'UNBOUNDED' },
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function category(overrides: Partial<CategoryParsed> = {}): CategoryParsed {
  return {
    categoryId: 'cat_restaurant00000000000',
    customerId: 'cust_a0000000000000000000',
    mapId: 'map_a0000000000000000000000',
    name: 'Restaurants',
    icon: 'FOOD',
    enabled: true,
    order: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function poi(overrides: Partial<PoiParsed> = {}): PoiParsed {
  return {
    poiId: 'poi_a0000000000000000000000',
    customerId: 'cust_a0000000000000000000',
    mapId: 'map_a0000000000000000000000',
    categoryId: 'cat_restaurant00000000000',
    name: 'Sakura Restaurant',
    location: { latitude: 35.0116, longitude: 135.7681 },
    sourceType: 'CLIENT_CUSTOM',
    status: 'ENABLED',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function categoryMenuItem(overrides: Partial<Extract<MenuItemParsed, { type: 'CATEGORY' }>> = {}): MenuItemParsed {
  return {
    menuItemId: 'menu_a0000000000000000000',
    customerId: 'cust_a0000000000000000000',
    mapId: 'map_a0000000000000000000000',
    type: 'CATEGORY',
    label: 'Gourmet',
    categoryId: 'cat_restaurant00000000000',
    order: 0,
    status: 'ENABLED',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('buildPublicationContent — checkpoint 1B.8', () => {
  it('includes only enabled categories', () => {
    const content = buildPublicationContent(
      map(),
      [category({ enabled: true }), category({ categoryId: 'cat_disabled000000000000', enabled: false, name: 'Retired' })],
      [],
      [],
    );
    expect(content.categories).toHaveLength(1);
    expect(content.categories[0]).toEqual({ categoryId: 'cat_restaurant00000000000', name: 'Restaurants', icon: 'FOOD' });
  });

  it('includes only ENABLED POIs whose category is included (enabled)', () => {
    const content = buildPublicationContent(
      map(),
      [category({ enabled: true })],
      [
        poi({ poiId: 'poi_enabled00000000000000', status: 'ENABLED' }),
        poi({ poiId: 'poi_disabled0000000000000', status: 'DISABLED' }),
      ],
      [],
    );
    expect(content.pois.map((p) => p.poiId)).toEqual(['poi_enabled00000000000000']);
  });

  it('excludes a POI whose category is disabled', () => {
    const content = buildPublicationContent(
      map(),
      [category({ categoryId: 'cat_disabled000000000000', enabled: false })],
      [poi({ categoryId: 'cat_disabled000000000000' })],
      [],
    );
    expect(content.pois).toHaveLength(0);
  });

  it('excludes a POI whose category does not exist at all (a broken reference)', () => {
    const content = buildPublicationContent(
      map(),
      [category({ enabled: true })],
      [poi({ categoryId: 'cat_does_not_exist000000' })],
      [],
    );
    expect(content.pois).toHaveLength(0);
  });

  it('never includes admin-only POI fields (sourceType/provider/providerPlaceId/status/customerId/mapId/timestamps)', () => {
    const content = buildPublicationContent(map(), [category({ enabled: true })], [poi({ address: '1 Main St', description: 'Great food' })], []);
    expect(content.pois[0]).toEqual({
      poiId: 'poi_a0000000000000000000000',
      categoryId: 'cat_restaurant00000000000',
      name: 'Sakura Restaurant',
      location: { latitude: 35.0116, longitude: 135.7681 },
      address: '1 Main St',
      description: 'Great food',
    });
  });

  it('delegates menu projection to buildPublicMenuProjection() rather than recomputing it', () => {
    const content = buildPublicationContent(
      map(),
      [category({ enabled: true })],
      [],
      [categoryMenuItem(), categoryMenuItem({ menuItemId: 'menu_disabled00000000000', status: 'DISABLED' })],
    );
    expect(content.menu).toEqual([{ type: 'CATEGORY', label: 'Gourmet', icon: 'FOOD', categoryId: 'cat_restaurant00000000000' }]);
  });

  it('resolves theme to DEFAULT_MAP_THEME when the draft map has no theme field at all', () => {
    const content = buildPublicationContent(map({ theme: undefined }), [], [], []);
    expect(content.map.theme).toEqual(DEFAULT_MAP_THEME);
  });

  it('uses the map\'s own theme when set, and omits branding when absent', () => {
    const customTheme = { ...DEFAULT_MAP_THEME, preset: 'MINIMAL' as const };
    const content = buildPublicationContent(map({ theme: customTheme, branding: undefined }), [], [], []);
    expect(content.map.theme).toEqual(customTheme);
    expect(content.map).not.toHaveProperty('branding');
  });

  it('includes branding when the draft map has it set', () => {
    const content = buildPublicationContent(map({ branding: { primaryColor: '#112233', secondaryColor: '#445566' } }), [], [], []);
    expect(content.map.branding).toEqual({ primaryColor: '#112233', secondaryColor: '#445566' });
  });

  it('never includes admin-only map fields (customerId/status/defaultLanguage/enabledLanguages/publication/timestamps)', () => {
    const content = buildPublicationContent(map(), [], [], []);
    expect(content.map).toEqual({
      name: 'Kyoto Tours Map',
      mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
      area: { type: 'UNBOUNDED' },
      theme: DEFAULT_MAP_THEME,
    });
  });
});

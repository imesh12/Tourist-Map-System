import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_THEME } from 'shared-types';
import type { CategoryParsed, MapParsed, MenuItemParsed, PageParsed, PoiParsed } from 'validation';
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
    // checkpoint 1B.17A — `PublicContentLanguage` codes, not the retired
    // `Language`/`LANGUAGES` enum's `'EN'`.
    defaultLanguage: 'en',
    enabledLanguages: ['en'],
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

function page(overrides: Partial<PageParsed> = {}): PageParsed {
  return {
    pageId: 'page_wifi0000000000000000000',
    customerId: 'cust_a0000000000000000000',
    mapId: 'map_a0000000000000000000000',
    title: 'Wi-Fi Guide',
    content: 'Network: Guest\nPassword: welcome',
    status: 'ENABLED',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function pageMenuItem(overrides: Partial<Extract<MenuItemParsed, { type: 'PAGE' }>> = {}): MenuItemParsed {
  return {
    menuItemId: 'menu_c0000000000000000000',
    customerId: 'cust_a0000000000000000000',
    mapId: 'map_a0000000000000000000000',
    type: 'PAGE',
    label: 'Wi-Fi',
    pageId: 'page_wifi0000000000000000000',
    order: 1,
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

  describe('checkpoint ADMIN PHOTO MARKER STYLE — photoMarkerStyle snapshotting', () => {
    it('snapshots the draft theme\'s photoMarkerStyle onto the publication content unchanged', () => {
      const themeWithPhotoMarkerStyle = { ...DEFAULT_MAP_THEME, photoMarkerStyle: 'DIAMOND_PIN' as const };
      const content = buildPublicationContent(map({ theme: themeWithPhotoMarkerStyle }), [], [], []);
      expect(content.map.theme.photoMarkerStyle).toBe('DIAMOND_PIN');
      expect(content.map.theme).toEqual(themeWithPhotoMarkerStyle);
    });

    it('an old-shape theme with no photoMarkerStyle at all still parses/freezes fine (no field is injected)', () => {
      const legacyTheme = { ...DEFAULT_MAP_THEME };
      const content = buildPublicationContent(map({ theme: legacyTheme }), [], [], []);
      expect(content.map.theme).not.toHaveProperty('photoMarkerStyle');
    });
  });

  it('the resolved default theme is now the TOURISM preset (checkpoint 1B.16 clean base map)', () => {
    const content = buildPublicationContent(map({ theme: undefined }), [], [], []);
    expect(content.map.theme.preset).toBe('TOURISM');
    expect(content.map.theme.visibility).toMatchObject({
      roads: true,
      transit: true,
      parks: true,
      roadLabels: false,
      buildings: false,
      placeLabels: false,
      businessPois: false,
      landmarkPois: false,
    });
  });

  it('freezes a pre-1B.16 theme (no roads/buildings/placeLabels/landmarkPois) EXACTLY as stored — publication compatibility', () => {
    const legacyTheme = {
      preset: 'STANDARD' as const,
      visibility: {
        businessPois: true,
        transit: true,
        schools: true,
        hospitals: true,
        parks: true,
        roadLabels: true,
        transitLabels: true,
      },
      markerStyle: { style: 'PIN' as const, size: 'MEDIUM' as const },
    };
    const content = buildPublicationContent(map({ theme: legacyTheme }), [], [], []);
    // Byte-for-byte: no new optional field is injected, so an existing
    // immutable publication built the same way keeps its exact meaning.
    expect(content.map.theme).toEqual(legacyTheme);
    expect(content.map.theme.visibility).not.toHaveProperty('roads');
    expect(content.map.theme.visibility).not.toHaveProperty('landmarkPois');
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

  describe('pages — checkpoint 1B.11', () => {
    it('includes only ENABLED pages', () => {
      const content = buildPublicationContent(
        map(),
        [],
        [],
        [],
        [page({ status: 'ENABLED' }), page({ pageId: 'page_disabled00000000000000', status: 'DISABLED', title: 'Retired' })],
      );
      expect(content.pages).toHaveLength(1);
      expect(content.pages[0]).toEqual({
        pageId: 'page_wifi0000000000000000000',
        title: 'Wi-Fi Guide',
        content: 'Network: Guest\nPassword: welcome',
      });
    });

    it('never includes admin-only page fields (customerId/mapId/status/timestamps)', () => {
      const content = buildPublicationContent(map(), [], [], [], [page()]);
      expect(content.pages[0]).toEqual({
        pageId: 'page_wifi0000000000000000000',
        title: 'Wi-Fi Guide',
        content: 'Network: Guest\nPassword: welcome',
      });
    });

    it('defaults to an empty pages array when omitted (backward-compatible default)', () => {
      const content = buildPublicationContent(map(), [], [], []);
      expect(content.pages).toEqual([]);
    });

    it('includes a PAGE menu item only when the referenced page is enabled, via delegation to buildPublicMenuProjection()', () => {
      const content = buildPublicationContent(map(), [], [], [pageMenuItem()], [page()]);
      expect(content.menu).toEqual([{ type: 'PAGE', label: 'Wi-Fi', icon: 'INFORMATION', pageId: 'page_wifi0000000000000000000' }]);
    });

    it('excludes a PAGE menu item whose referenced page is disabled', () => {
      const content = buildPublicationContent(map(), [], [], [pageMenuItem()], [page({ status: 'DISABLED' })]);
      expect(content.menu).toEqual([]);
    });
  });

  describe('multilingual data foundation — checkpoint 1B.17A', () => {
    it('captures the map\'s own defaultLanguage/enabledLanguages onto the publication content', () => {
      const content = buildPublicationContent(map({ defaultLanguage: 'ja', enabledLanguages: ['ja', 'en'] }), [], [], []);
      expect(content.defaultLanguage).toBe('ja');
      expect(content.supportedLanguages).toEqual(['ja', 'en']);
    });

    it('defaults to the platform single-language config for a legacy-shaped map with only one supported language', () => {
      const content = buildPublicationContent(map({ defaultLanguage: 'en', enabledLanguages: ['en'] }), [], [], []);
      expect(content.defaultLanguage).toBe('en');
      expect(content.supportedLanguages).toEqual(['en']);
    });

    it('passes a category\'s translations through unchanged, and omits the field entirely when absent', () => {
      const translations = { name: { ja: 'レストラン', ko: '레스토랑' } };
      const content = buildPublicationContent(map(), [category({ translations }), category({ categoryId: 'cat_no_translations0000', translations: undefined })], [], []);
      expect(content.categories.find((c) => c.categoryId === 'cat_restaurant00000000000')?.translations).toEqual(translations);
      expect(content.categories.find((c) => c.categoryId === 'cat_no_translations0000')).not.toHaveProperty('translations');
    });

    it('passes a POI\'s translations through unchanged', () => {
      const translations = { name: { fr: 'Restaurant Sakura' }, description: { fr: 'Excellente cuisine' } };
      const content = buildPublicationContent(map(), [category({ enabled: true })], [poi({ translations })], []);
      expect(content.pois[0]?.translations).toEqual(translations);
    });

    it('passes a Page\'s translations through unchanged', () => {
      const translations = { title: { es: 'Guía de Wi-Fi' }, content: { es: 'Red: Invitado' } };
      const content = buildPublicationContent(map(), [], [], [], [page({ translations })]);
      expect(content.pages[0]?.translations).toEqual(translations);
    });

    it('passes a menu item\'s translations through the menu projection unchanged', () => {
      const translations = { label: { ko: '미식가' } };
      const content = buildPublicationContent(map(), [category({ enabled: true })], [], [categoryMenuItem({ translations })]);
      expect(content.menu[0]).toMatchObject({ translations });
    });
  });

  describe('photo derivation — Photo Experience Prototype checkpoint', () => {
    const googlePoi = (overrides: Partial<PoiParsed> = {}): PoiParsed =>
      poi({
        sourceType: 'GOOGLE_PLACES',
        provider: 'GOOGLE',
        providerPlaceId: 'places/ChIJ_test',
        hasPhoto: true,
        ...overrides,
      });

    it('publishes `photo: { available: true }` AND a matching photoProviderRefs entry for an ENABLED GOOGLE_PLACES POI stamped hasPhoto', () => {
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi()], []);
      expect(content.pois[0]?.photo).toEqual({ available: true });
      expect(content.photoProviderRefs).toEqual({
        poi_a0000000000000000000000: { provider: 'GOOGLE', providerPlaceId: 'places/ChIJ_test' },
      });
    });

    it('never exposes provider/providerPlaceId on the PublishedPoi itself — only the presence flag', () => {
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi()], []);
      expect(content.pois[0]).not.toHaveProperty('provider');
      expect(content.pois[0]).not.toHaveProperty('providerPlaceId');
      expect(content.pois[0]).not.toHaveProperty('hasPhoto');
    });

    it('omits photo + ref when a GOOGLE_PLACES POI was stamped hasPhoto: false', () => {
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi({ hasPhoto: false })], []);
      expect(content.pois[0]?.photo).toBeUndefined();
      expect(content.photoProviderRefs).toEqual({});
    });

    it('omits photo + ref when hasPhoto is absent entirely (a POI imported before this checkpoint)', () => {
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi({ hasPhoto: undefined })], []);
      expect(content.pois[0]?.photo).toBeUndefined();
      expect(content.photoProviderRefs).toEqual({});
    });

    it('omits photo + ref for a CLIENT_CUSTOM POI even if it somehow carries hasPhoto (defense-in-depth: sourceType is checked)', () => {
      const content = buildPublicationContent(
        map(),
        [category({ enabled: true })],
        [poi({ sourceType: 'CLIENT_CUSTOM', hasPhoto: true })],
        [],
      );
      expect(content.pois[0]?.photo).toBeUndefined();
      expect(content.photoProviderRefs).toEqual({});
    });

    it('omits photo + ref when providerPlaceId is missing despite hasPhoto (malformed/partial document)', () => {
      const content = buildPublicationContent(
        map(),
        [category({ enabled: true })],
        [googlePoi({ providerPlaceId: undefined })],
        [],
      );
      expect(content.pois[0]?.photo).toBeUndefined();
      expect(content.photoProviderRefs).toEqual({});
    });

    it('never adds a ref for a POI excluded from the publication (disabled POI / disabled category)', () => {
      const content = buildPublicationContent(
        map(),
        [category({ enabled: true })],
        [googlePoi({ poiId: 'poi_disabled0000000000000', status: 'DISABLED' })],
        [],
      );
      expect(content.pois).toHaveLength(0);
      expect(content.photoProviderRefs).toEqual({});
    });

    it('photoProviderRefs is always an object (empty, never undefined) so the publish route can decide whether to persist the key', () => {
      const content = buildPublicationContent(map(), [category({ enabled: true })], [poi()], []);
      expect(content.photoProviderRefs).toEqual({});
    });
  });

  describe('place metadata projection — rich-detail expansion', () => {
    const googlePoi = (overrides: Partial<PoiParsed> = {}): PoiParsed =>
      poi({ sourceType: 'GOOGLE_PLACES', provider: 'GOOGLE', providerPlaceId: 'places/ChIJ_test', ...overrides });

    const FULL_METADATA = {
      rating: 4.5,
      userRatingCount: 128,
      priceLevel: 'MODERATE' as const,
      primaryTypeDisplayName: 'Sushi restaurant',
      openingHours: {
        periods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }],
        weekdayDescriptions: ['Monday: 11 AM – 10 PM'],
      },
      utcOffsetMinutes: 540,
      websiteUri: 'https://example.com/sakura',
      nationalPhoneNumber: '03-1234-5678',
      dineIn: true,
      takeout: true,
      delivery: false,
    };

    it('is BACKWARD COMPATIBLE — with no metadata map arg, no POI gets a `place` (an old-shape publish)', () => {
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi()], []);
      expect(content.pois[0]).not.toHaveProperty('place');
    });

    it('projects the resolved metadata onto `PublishedPoi.place`, adding the derived priceLevelDisplay glyph', () => {
      const meta = new Map([['poi_a0000000000000000000000', FULL_METADATA]]);
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi()], [], [], meta);
      expect(content.pois[0]?.place).toEqual({ ...FULL_METADATA, priceLevelDisplay: '$$' });
      // never the provider identity
      expect(JSON.stringify(content.pois[0])).not.toContain('providerPlaceId');
      expect(JSON.stringify(content.pois[0])).not.toContain('ChIJ_test');
    });

    it('FREE price level gets no glyph (client shows the word)', () => {
      const meta = new Map([['poi_a0000000000000000000000', { priceLevel: 'FREE' as const, rating: 4.1 }]]);
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi()], [], [], meta);
      expect(content.pois[0]?.place).toEqual({ priceLevel: 'FREE', rating: 4.1 });
    });

    it('omits `place` when the metadata object is empty after normalization', () => {
      const meta = new Map([['poi_a0000000000000000000000', {}]]);
      const content = buildPublicationContent(map(), [category({ enabled: true })], [googlePoi()], [], [], meta);
      expect(content.pois[0]).not.toHaveProperty('place');
    });

    it('never attaches `place` to a CLIENT_CUSTOM POI even if the metadata map holds an entry for its id', () => {
      const meta = new Map([['poi_a0000000000000000000000', FULL_METADATA]]);
      const content = buildPublicationContent(map(), [category({ enabled: true })], [poi()], [], [], meta);
      expect(content.pois[0]).not.toHaveProperty('place');
    });

    it('`place` is independent of `photo` — a POI can have metadata but no photo', () => {
      const meta = new Map([['poi_a0000000000000000000000', FULL_METADATA]]);
      const content = buildPublicationContent(
        map(),
        [category({ enabled: true })],
        [googlePoi({ hasPhoto: false })],
        [],
        [],
        meta,
      );
      expect(content.pois[0]?.photo).toBeUndefined();
      expect(content.pois[0]?.place).toMatchObject({ rating: 4.5 });
    });
  });
});

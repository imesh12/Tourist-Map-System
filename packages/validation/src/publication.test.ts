import { describe, expect, it } from 'vitest';
import { mapPublicationSnapshotSchema, publicMapSnapshotSchema } from './publication';

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
  pages: [{ pageId: 'page_aB3dEf6gH9jKlMn0pQ', title: 'Wi-Fi Guide', content: 'Network: Guest\nPassword: welcome' }],
};

describe('mapPublicationSnapshotSchema', () => {
  it('accepts a fully-populated valid publication snapshot', () => {
    expect(mapPublicationSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  it('accepts a snapshot with empty menu/categories/pois/pages arrays (a map with no publishable content yet)', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, menu: [], categories: [], pois: [], pages: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a PAGE menu item', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      menu: [...validSnapshot.menu, { type: 'PAGE', label: 'Wi-Fi', icon: 'INFORMATION', pageId: 'page_aB3dEf6gH9jKlMn0pQ' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a PAGE menu item missing pageId', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      menu: [{ type: 'PAGE', label: 'Broken', icon: 'INFORMATION' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a PAGE menu item mixing pageId and categoryId (malformed mixed state)', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      menu: [
        {
          type: 'PAGE',
          label: 'Broken',
          icon: 'INFORMATION',
          pageId: 'page_aB3dEf6gH9jKlMn0pQ',
          categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a page missing content', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pages: [{ pageId: 'page_aB3dEf6gH9jKlMn0pQ', title: 'Wi-Fi Guide' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a page with a malformed pageId', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pages: [{ pageId: 'not-a-page-id', title: 'Wi-Fi Guide', content: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a legacy stored document predating checkpoint 1B.11 (no `pages` field at all), normalizing it to `pages: []`', () => {
    // A publication document written before checkpoint 1B.11 introduced
    // Pages is an IMMUTABLE stored artifact — it will never gain a `pages`
    // field retroactively. `.default([])` on the schema (not `.optional()`)
    // is what makes this both backward-compatible AND non-weakening: the
    // key is optional on INPUT, but the PARSED result always has a real
    // `pages` array, matching shared-types' non-optional
    // `readonly pages: readonly PublishedPage[]` contract exactly.
    const withoutPages: Record<string, unknown> = { ...validSnapshot };
    delete withoutPages.pages;
    const result = mapPublicationSnapshotSchema.safeParse(withoutPages);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pages).toEqual([]);
    }
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

/**
 * Multilingual data foundation — checkpoint 1B.17A §10 (scenarios 22–27 of
 * the checkpoint's required 27-scenario minimum: "Publication").
 */
describe('mapPublicationSnapshotSchema — multilingual (checkpoint 1B.17A)', () => {
  it('scenario 22: accepts a legacy publication predating this checkpoint (neither defaultLanguage nor supportedLanguages at all), normalizing to the platform default', () => {
    const legacy: Record<string, unknown> = { ...validSnapshot };
    delete legacy.defaultLanguage;
    delete legacy.supportedLanguages;
    const result = mapPublicationSnapshotSchema.safeParse(legacy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultLanguage).toBe('en');
      expect(result.data.supportedLanguages).toEqual(['en']);
    }
  });

  it('scenario 23: accepts an explicit multilingual defaultLanguage/supportedLanguages config', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, defaultLanguage: 'ja', supportedLanguages: ['ja', 'en', 'ko'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultLanguage).toBe('ja');
      expect(result.data.supportedLanguages).toEqual(['ja', 'en', 'ko']);
    }
  });

  it('scenario 24: normalizes a legacy-coded defaultLanguage the same way mapSchema does', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, defaultLanguage: 'JA', supportedLanguages: ['ja'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultLanguage).toBe('ja');
    }
  });

  it('scenario 25: rejects an unregistered/malformed defaultLanguage code', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, defaultLanguage: 'de', supportedLanguages: ['de'] });
    expect(result.success).toBe(false);
  });

  it('scenario 25b: rejects an explicitly empty supportedLanguages array (unlike an absent one, which normalizes safely)', () => {
    const result = mapPublicationSnapshotSchema.safeParse({ ...validSnapshot, supportedLanguages: [] });
    expect(result.success).toBe(false);
  });

  it('scenario 26: accepts translations on categories/pois/pages/menu items within the snapshot, passed through unchanged', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      defaultLanguage: 'ja',
      supportedLanguages: ['ja', 'en'],
      categories: [{ ...validSnapshot.categories[0], translations: { name: { en: 'Restaurants' } } }],
      pois: [{ ...validSnapshot.pois[0], translations: { name: { en: 'Sakura Restaurant' } } }],
      pages: [{ ...validSnapshot.pages[0], translations: { title: { en: 'Wi-Fi Guide' } } }],
      menu: [{ ...validSnapshot.menu[0], translations: { label: { en: 'Restaurants' } } }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categories[0]?.translations).toEqual({ name: { en: 'Restaurants' } });
      expect(result.data.pois[0]?.translations).toEqual({ name: { en: 'Sakura Restaurant' } });
      expect(result.data.pages[0]?.translations).toEqual({ title: { en: 'Wi-Fi Guide' } });
      expect(result.data.menu[0]).toMatchObject({ translations: { label: { en: 'Restaurants' } } });
    }
  });

  it('scenario 27: rejects an unregistered language key inside a published entity\'s translations bag', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      categories: [{ ...validSnapshot.categories[0], translations: { name: { de: 'Restaurants' } } }],
    });
    expect(result.success).toBe(false);
  });
});

describe('mapPublicationSnapshotSchema — photo fields (Photo Experience Prototype checkpoint)', () => {
  it('accepts a snapshot with neither `pois[].photo` nor `photoProviderRefs` (every pre-checkpoint publication)', () => {
    const result = mapPublicationSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pois[0]?.photo).toBeUndefined();
      expect(result.data.photoProviderRefs).toBeUndefined();
    }
  });

  it('accepts `photo: { available: true }` on a published POI and a matching `photoProviderRefs` entry', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pois: [{ ...validSnapshot.pois[0], photo: { available: true } }],
      photoProviderRefs: { [validSnapshot.pois[0]!.poiId]: { provider: 'GOOGLE', providerPlaceId: 'places/ChIJ_test' } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pois[0]?.photo).toEqual({ available: true });
      expect(result.data.photoProviderRefs).toEqual({
        [validSnapshot.pois[0]!.poiId]: { provider: 'GOOGLE', providerPlaceId: 'places/ChIJ_test' },
      });
    }
  });

  it('rejects `photo: { available: false }` — the type is a presence flag, literal `true` only', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pois: [{ ...validSnapshot.pois[0], photo: { available: false } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown key inside a `pois[].photo` object (.strict())', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pois: [{ ...validSnapshot.pois[0], photo: { available: true, url: 'https://leak.example/photo.jpg' } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a `photoProviderRefs` entry with an unknown provider', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      photoProviderRefs: { [validSnapshot.pois[0]!.poiId]: { provider: 'YELP', providerPlaceId: 'x' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown key inside a `photoProviderRefs` entry (.strict() — never a photo resource name)', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      photoProviderRefs: {
        [validSnapshot.pois[0]!.poiId]: { provider: 'GOOGLE', providerPlaceId: 'places/x', photoName: 'places/x/photos/y' },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('mapPublicationSnapshotSchema — pois[].place (rich-detail expansion)', () => {
  const fullPlace = {
    rating: 4.5,
    userRatingCount: 128,
    priceLevel: 'MODERATE',
    priceLevelDisplay: '$$',
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

  it('BACKWARD COMPATIBLE — a snapshot whose POIs have no `place` still parses (every publication predating this expansion)', () => {
    const result = mapPublicationSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pois[0]?.place).toBeUndefined();
    }
  });

  it('accepts a fully-populated `pois[].place`', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pois: [{ ...validSnapshot.pois[0], place: fullPlace }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pois[0]?.place).toEqual(fullPlace);
    }
  });

  it('accepts a sparse `place` (Google returns fields piecemeal)', () => {
    const result = mapPublicationSnapshotSchema.safeParse({
      ...validSnapshot,
      pois: [{ ...validSnapshot.pois[0], place: { rating: 3.9 } }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown key inside `place` (.strict() — never review text / providerPlaceId / a photo name)', () => {
    for (const leak of [{ providerPlaceId: 'places/x' }, { reviews: ['great!'] }, { photoName: 'places/x/photos/y' }]) {
      const result = mapPublicationSnapshotSchema.safeParse({
        ...validSnapshot,
        pois: [{ ...validSnapshot.pois[0], place: { rating: 4, ...leak } }],
      });
      expect(result.success, JSON.stringify(leak)).toBe(false);
    }
  });

  it('rejects out-of-range values (rating > 5, an invalid priceLevel, a bad opening-hours day)', () => {
    const bad = [
      { rating: 6 },
      { priceLevel: 'PRICE_LEVEL_MODERATE' },
      { openingHours: { periods: [{ open: { day: 9, hour: 1, minute: 0 } }], weekdayDescriptions: [] } },
      { websiteUri: 'not-a-url' },
    ];
    for (const place of bad) {
      const result = mapPublicationSnapshotSchema.safeParse({
        ...validSnapshot,
        pois: [{ ...validSnapshot.pois[0], place }],
      });
      expect(result.success, JSON.stringify(place)).toBe(false);
    }
  });

  it('is kept (NOT omitted) by publicMapSnapshotSchema — `place` is public-safe, unlike photoProviderRefs', () => {
    const publicSnapshot: Record<string, unknown> = { ...validSnapshot };
    delete publicSnapshot.customerId;
    delete publicSnapshot.publishedByUid;
    const result = publicMapSnapshotSchema.safeParse({
      ...publicSnapshot,
      pois: [{ ...validSnapshot.pois[0], place: fullPlace }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pois[0]?.place).toEqual(fullPlace);
    }
  });
});

/**
 * `publicMapSnapshotSchema` unit tests — checkpoint 1B.9. This is what
 * `tourist-web`'s public-map client actually parses `GET /api/public/maps/
 * {mapId}`'s real response body with — the tests below deliberately mirror
 * that route's own real output shape (customerId/publishedByUid ABSENT),
 * not the full stored-document shape `validSnapshot` above represents.
 */
describe('publicMapSnapshotSchema', () => {
  const publicSnapshot: Record<string, unknown> = { ...validSnapshot };
  delete publicSnapshot.customerId;
  delete publicSnapshot.publishedByUid;

  it('accepts the real shape GET /api/public/maps/{mapId} returns (no customerId/publishedByUid)', () => {
    expect(publicMapSnapshotSchema.safeParse(publicSnapshot).success).toBe(true);
  });

  it('rejects a payload that still carries customerId (.strict() — the public endpoint must never leak it, and this schema must never silently accept it if it somehow did)', () => {
    const result = publicMapSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(false);
  });

  it('rejects a payload that still carries publishedByUid', () => {
    const result = publicMapSnapshotSchema.safeParse({ ...publicSnapshot, publishedByUid: 'uid_admin_a' });
    expect(result.success).toBe(false);
  });

  it('still rejects a missing theme, matching mapPublicationSnapshotSchema’s own invariant', () => {
    const mapWithoutTheme = {
      name: (publicSnapshot.map as { name: string }).name,
      mapProvider: (publicSnapshot.map as { mapProvider: unknown }).mapProvider,
      area: (publicSnapshot.map as { area: unknown }).area,
    };
    const result = publicMapSnapshotSchema.safeParse({ ...publicSnapshot, map: mapWithoutTheme });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized extra top-level field (.strict() is preserved by .omit())', () => {
    const result = publicMapSnapshotSchema.safeParse({ ...publicSnapshot, internalDebugInfo: 'leak' });
    expect(result.success).toBe(false);
  });

  it('rejects a mapId that does not match the mapId format', () => {
    const result = publicMapSnapshotSchema.safeParse({ ...publicSnapshot, mapId: 'not-a-map-id' });
    expect(result.success).toBe(false);
  });

  it('accepts an empty pois/categories/menu/pages snapshot (an unpublished-content map that was still explicitly published)', () => {
    const result = publicMapSnapshotSchema.safeParse({ ...publicSnapshot, menu: [], categories: [], pois: [], pages: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a legacy public snapshot predating checkpoint 1B.11 (no `pages` field), normalizing it to `pages: []` — this is the exact shape tourist-web’s public-map client parses for a pre-Pages stored publication', () => {
    const legacyPublicSnapshot: Record<string, unknown> = { ...publicSnapshot };
    delete legacyPublicSnapshot.pages;
    const result = publicMapSnapshotSchema.safeParse(legacyPublicSnapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pages).toEqual([]);
    }
  });

  /**
   * Checkpoint 1B.17A targeted fix — GET /api/public/maps/{mapId} (route.ts)
   * builds its response via an explicit field-by-field pick from the parsed
   * snapshot, not this schema directly, so these tests only prove the SCHEMA
   * side of the contract (what the route is supposed to reflect) — they
   * cannot catch a hand-built response object that forgets to copy a field
   * across (that was the actual bug: the schema always normalized these two
   * fields correctly; the route's own object literal simply never read them
   * back out). See route.ts's own updated comment for the real fix.
   */
  describe('defaultLanguage/supportedLanguages — checkpoint 1B.17A', () => {
    it('includes an explicit multilingual defaultLanguage/supportedLanguages config in the public shape', () => {
      const result = publicMapSnapshotSchema.safeParse({ ...publicSnapshot, defaultLanguage: 'ja', supportedLanguages: ['ja', 'en'] });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.defaultLanguage).toBe('ja');
        expect(result.data.supportedLanguages).toEqual(['ja', 'en']);
      }
    });

    it('normalizes a legacy public snapshot with neither field at all to the platform default (en / [en])', () => {
      const legacyPublicSnapshot: Record<string, unknown> = { ...publicSnapshot };
      delete legacyPublicSnapshot.defaultLanguage;
      delete legacyPublicSnapshot.supportedLanguages;
      const result = publicMapSnapshotSchema.safeParse(legacyPublicSnapshot);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.defaultLanguage).toBe('en');
        expect(result.data.supportedLanguages).toEqual(['en']);
      }
    });
  });

  describe('photo fields — Photo Experience Prototype checkpoint', () => {
    it('keeps the public-safe `pois[].photo` presence flag in the public shape', () => {
      const result = publicMapSnapshotSchema.safeParse({
        ...publicSnapshot,
        pois: [{ ...(publicSnapshot.pois as unknown[])[0] as object, photo: { available: true } }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pois[0]?.photo).toEqual({ available: true });
      }
    });

    it('rejects a payload that still carries the server-only `photoProviderRefs` (.omit() + .strict() — provider identity must never reach the wire)', () => {
      const result = publicMapSnapshotSchema.safeParse({
        ...publicSnapshot,
        photoProviderRefs: { poi_aB3dEf6gH9jKlMn0pQ: { provider: 'GOOGLE', providerPlaceId: 'places/ChIJ_test' } },
      });
      expect(result.success).toBe(false);
    });
  });
});

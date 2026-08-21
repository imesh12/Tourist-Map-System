import { describe, expect, it } from 'vitest';
import { externalPoiCandidateSchema, poiDiscoverInputSchema, poiImportInputSchema } from './external-poi';

const validCandidate = {
  provider: 'GOOGLE',
  providerPlaceId: 'places/fake-restaurant-1',
  name: 'Sakura Sushi Bar',
  location: { latitude: 35.6812, longitude: 139.7671 },
};

const validDiscoverInput = {
  categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
  radiusMeters: 1000,
};

const validImportInput = {
  categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
  provider: 'GOOGLE',
  providerPlaceId: 'places/fake-restaurant-1',
};

describe('externalPoiCandidateSchema', () => {
  it('accepts a minimal valid candidate', () => {
    expect(externalPoiCandidateSchema.safeParse(validCandidate).success).toBe(true);
  });

  it('accepts optional address/distanceMeters', () => {
    const result = externalPoiCandidateSchema.safeParse({ ...validCandidate, address: 'Shinjuku, Tokyo', distanceMeters: 320 });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized provider', () => {
    expect(externalPoiCandidateSchema.safeParse({ ...validCandidate, provider: 'YELP' }).success).toBe(false);
  });

  it('rejects a missing providerPlaceId', () => {
    const { providerPlaceId, ...rest } = validCandidate;
    void providerPlaceId;
    expect(externalPoiCandidateSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an out-of-range location', () => {
    expect(externalPoiCandidateSchema.safeParse({ ...validCandidate, location: { latitude: 999, longitude: 0 } }).success).toBe(
      false,
    );
  });

  it('rejects a negative distanceMeters', () => {
    expect(externalPoiCandidateSchema.safeParse({ ...validCandidate, distanceMeters: -1 }).success).toBe(false);
  });
});

describe('poiDiscoverInputSchema', () => {
  it('accepts a valid discovery input', () => {
    expect(poiDiscoverInputSchema.safeParse(validDiscoverInput).success).toBe(true);
  });

  it('accepts the minimum allowed radius', () => {
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, radiusMeters: 50 }).success).toBe(true);
  });

  it('accepts the maximum allowed radius', () => {
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, radiusMeters: 5000 }).success).toBe(true);
  });

  it('rejects an oversized radius (cost-control safeguard)', () => {
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, radiusMeters: 5001 }).success).toBe(false);
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, radiusMeters: 50000 }).success).toBe(false);
  });

  it('rejects an undersized radius', () => {
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, radiusMeters: 49 }).success).toBe(false);
  });

  it('rejects a non-integer radius', () => {
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, radiusMeters: 100.5 }).success).toBe(false);
  });

  it('rejects a malformed categoryId', () => {
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, categoryId: 'not-a-category-id' }).success).toBe(false);
  });

  it('rejects an unrecognized extra field (no client-supplied center/coordinates)', () => {
    expect(poiDiscoverInputSchema.safeParse({ ...validDiscoverInput, latitude: 1, longitude: 1 }).success).toBe(false);
  });
});

describe('poiImportInputSchema', () => {
  it('accepts a valid import input', () => {
    expect(poiImportInputSchema.safeParse(validImportInput).success).toBe(true);
  });

  it('rejects an unrecognized provider', () => {
    expect(poiImportInputSchema.safeParse({ ...validImportInput, provider: 'YELP' }).success).toBe(false);
  });

  it('rejects a missing providerPlaceId', () => {
    const { providerPlaceId, ...rest } = validImportInput;
    void providerPlaceId;
    expect(poiImportInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a malformed categoryId', () => {
    expect(poiImportInputSchema.safeParse({ ...validImportInput, categoryId: 'nope' }).success).toBe(false);
  });

  describe('security: the server always resolves authoritative place details itself', () => {
    it('rejects a client-supplied name', () => {
      expect(poiImportInputSchema.safeParse({ ...validImportInput, name: 'Attacker Chosen Name' }).success).toBe(false);
    });

    it('rejects client-supplied coordinates', () => {
      expect(poiImportInputSchema.safeParse({ ...validImportInput, latitude: 1, longitude: 1 }).success).toBe(false);
    });

    it('rejects an injected sourceType', () => {
      expect(poiImportInputSchema.safeParse({ ...validImportInput, sourceType: 'GOOGLE_PLACES' }).success).toBe(false);
    });

    it('rejects injected customerId/mapId', () => {
      expect(poiImportInputSchema.safeParse({ ...validImportInput, customerId: 'cust_x', mapId: 'map_x' }).success).toBe(false);
    });
  });
});

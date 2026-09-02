import { describe, expect, it } from 'vitest';
import { poiCreateInputSchema, poiSchema, poiTranslationsSchema, poiUpdateInputSchema } from './poi';

const validPoi = {
  poiId: 'poi_aB3dEf6gH9jKlMn0pQ',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
  name: 'Sakura Restaurant',
  location: { latitude: 35.6812, longitude: 139.7671 },
  sourceType: 'CLIENT_CUSTOM',
  status: 'ENABLED',
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

const validCreateInput = {
  name: 'Sakura Restaurant',
  categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
  latitude: 35.6812,
  longitude: 139.7671,
};

describe('poiSchema', () => {
  it('accepts a valid POI document', () => {
    expect(poiSchema.safeParse(validPoi).success).toBe(true);
  });

  it('accepts optional address/description', () => {
    const result = poiSchema.safeParse({ ...validPoi, address: 'Shinjuku, Tokyo', description: 'Great sushi.' });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized status', () => {
    expect(poiSchema.safeParse({ ...validPoi, status: 'ARCHIVED' }).success).toBe(false);
  });

  it('rejects an unrecognized sourceType', () => {
    expect(poiSchema.safeParse({ ...validPoi, sourceType: 'MUNICIPAL_API' }).success).toBe(false);
  });
});

describe('poiSchema — translations (checkpoint 1B.17A, scenario 19)', () => {
  it('accepts a POI document with no translations field at all (backward compatibility)', () => {
    expect(poiSchema.safeParse(validPoi).success).toBe(true);
  });

  it('accepts a POI document with a valid name/description translations bag', () => {
    const result = poiSchema.safeParse({
      ...validPoi,
      translations: { name: { ja: '桜レストラン' }, description: { ja: '素晴らしい寿司' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a translations bag keyed by an unregistered language code', () => {
    expect(poiSchema.safeParse({ ...validPoi, translations: { name: { de: 'Sakura' } } }).success).toBe(false);
  });

  it("rejects a translated description exceeding poiDescriptionSchema's own DESCRIPTION_MAX_LENGTH bound", () => {
    const result = poiSchema.safeParse({ ...validPoi, translations: { description: { en: 'a'.repeat(2001) } } });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field on the translations object (strict mode)', () => {
    expect(poiTranslationsSchema.safeParse({ name: { en: 'Sakura' }, label: { en: 'nope' } }).success).toBe(false);
  });
});

describe('poiCreateInputSchema', () => {
  it('accepts a minimal valid create input', () => {
    expect(poiCreateInputSchema.safeParse(validCreateInput).success).toBe(true);
  });

  it('accepts a full valid create input', () => {
    const result = poiCreateInputSchema.safeParse({
      ...validCreateInput,
      address: 'Shinjuku, Tokyo',
      description: 'Great sushi.',
      status: 'DISABLED',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const { name, ...rest } = validCreateInput;
    void name;
    expect(poiCreateInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty/whitespace-only name', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, name: '   ' }).success).toBe(false);
  });

  it('rejects an oversized name', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, name: 'a'.repeat(151) }).success).toBe(false);
  });

  it('rejects an oversized address', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, address: 'a'.repeat(301) }).success).toBe(false);
  });

  it('rejects an oversized description', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, description: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('rejects a malformed categoryId', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, categoryId: 'not-a-category-id' }).success).toBe(false);
  });

  it('rejects an out-of-range latitude', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, latitude: 91 }).success).toBe(false);
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, latitude: -91 }).success).toBe(false);
  });

  it('rejects an out-of-range longitude', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, longitude: 181 }).success).toBe(false);
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, longitude: -181 }).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(poiCreateInputSchema.safeParse({ ...validCreateInput, status: 'ARCHIVED' }).success).toBe(false);
  });

  describe('security: identity/ownership fields are never client-suppliable', () => {
    it('rejects an injected poiId', () => {
      expect(poiCreateInputSchema.safeParse({ ...validCreateInput, poiId: 'poi_attackerControlled01' }).success).toBe(false);
    });

    it('rejects an injected customerId', () => {
      expect(poiCreateInputSchema.safeParse({ ...validCreateInput, customerId: 'cust_attackerControlled01' }).success).toBe(
        false,
      );
    });

    it('rejects an injected mapId', () => {
      expect(poiCreateInputSchema.safeParse({ ...validCreateInput, mapId: 'map_attackerControlled01' }).success).toBe(false);
    });

    it('rejects an injected sourceType (a client can never assert GOOGLE_PLACES origin)', () => {
      expect(poiCreateInputSchema.safeParse({ ...validCreateInput, sourceType: 'GOOGLE_PLACES' }).success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      expect(poiCreateInputSchema.safeParse({ ...validCreateInput, createdAt: 'x' }).success).toBe(false);
      expect(poiCreateInputSchema.safeParse({ ...validCreateInput, updatedAt: 'x' }).success).toBe(false);
    });

    it('rejects any other unrecognized extra field (strict mode)', () => {
      expect(poiCreateInputSchema.safeParse({ ...validCreateInput, isAdmin: true }).success).toBe(false);
    });
  });
});

describe('poiUpdateInputSchema', () => {
  it('accepts a partial update with only status', () => {
    expect(poiUpdateInputSchema.safeParse({ status: 'DISABLED' }).success).toBe(true);
  });

  it('accepts a partial update with latitude+longitude together', () => {
    expect(poiUpdateInputSchema.safeParse({ latitude: 1, longitude: 2 }).success).toBe(true);
  });

  it('rejects latitude without longitude', () => {
    expect(poiUpdateInputSchema.safeParse({ latitude: 1 }).success).toBe(false);
  });

  it('rejects longitude without latitude', () => {
    expect(poiUpdateInputSchema.safeParse({ longitude: 2 }).success).toBe(false);
  });

  it('rejects an empty update object', () => {
    expect(poiUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty/whitespace-only name when name is provided', () => {
    expect(poiUpdateInputSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a malformed categoryId when provided', () => {
    expect(poiUpdateInputSchema.safeParse({ categoryId: 'nope' }).success).toBe(false);
  });

  describe('security: ownership fields are never client-suppliable on update', () => {
    it('rejects an injected poiId', () => {
      expect(poiUpdateInputSchema.safeParse({ status: 'ENABLED', poiId: 'poi_x' }).success).toBe(false);
    });

    it('rejects an injected customerId', () => {
      expect(poiUpdateInputSchema.safeParse({ status: 'ENABLED', customerId: 'cust_x' }).success).toBe(false);
    });

    it('rejects an injected mapId (cross-map move attempt)', () => {
      expect(poiUpdateInputSchema.safeParse({ status: 'ENABLED', mapId: 'map_x' }).success).toBe(false);
    });

    it('rejects an injected sourceType', () => {
      expect(poiUpdateInputSchema.safeParse({ status: 'ENABLED', sourceType: 'GOOGLE_PLACES' }).success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      expect(poiUpdateInputSchema.safeParse({ status: 'ENABLED', createdAt: 'x' }).success).toBe(false);
      expect(poiUpdateInputSchema.safeParse({ status: 'ENABLED', updatedAt: 'x' }).success).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { categoryCreateInputSchema, categorySchema, categoryUpdateInputSchema } from './category';

const validCategory = {
  categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  name: 'Restaurants',
  icon: 'FOOD',
  enabled: true,
  order: 0,
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

describe('categorySchema', () => {
  it('accepts a valid category document', () => {
    expect(categorySchema.safeParse(validCategory).success).toBe(true);
  });

  it('rejects an unrecognized icon', () => {
    expect(categorySchema.safeParse({ ...validCategory, icon: 'SPACESHIP' }).success).toBe(false);
  });

  it('rejects a negative order', () => {
    expect(categorySchema.safeParse({ ...validCategory, order: -1 }).success).toBe(false);
  });

  it('rejects a non-integer order', () => {
    expect(categorySchema.safeParse({ ...validCategory, order: 1.5 }).success).toBe(false);
  });
});

describe('categorySchema — sourceType/platformCategoryId (Category CMS redesign)', () => {
  it('accepts a document with neither field (backward compatibility: pre-existing checkpoint 1B.2 docs)', () => {
    expect(categorySchema.safeParse(validCategory).success).toBe(true);
  });

  it('accepts a document with sourceType: CLIENT_CUSTOM', () => {
    expect(categorySchema.safeParse({ ...validCategory, sourceType: 'CLIENT_CUSTOM' }).success).toBe(true);
  });

  it('accepts a document with sourceType: PLATFORM and a platformCategoryId', () => {
    const result = categorySchema.safeParse({ ...validCategory, sourceType: 'PLATFORM', platformCategoryId: 'platcat_123' });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized sourceType', () => {
    expect(categorySchema.safeParse({ ...validCategory, sourceType: 'SUPER_ADMIN_BYPASS' }).success).toBe(false);
  });
});

describe('categoryCreateInputSchema — checkpoint 1B.2', () => {
  const validInput = { name: 'Restaurants', icon: 'FOOD' };

  it('accepts a minimal valid create input (enabled/order omitted)', () => {
    expect(categoryCreateInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('accepts a full valid create input', () => {
    const result = categoryCreateInputSchema.safeParse({ ...validInput, enabled: false, order: 3 });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(categoryCreateInputSchema.safeParse({ ...validInput, name: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    expect(categoryCreateInputSchema.safeParse({ ...validInput, name: '   ' }).success).toBe(false);
  });

  it('rejects a too-long name', () => {
    expect(categoryCreateInputSchema.safeParse({ ...validInput, name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects an unknown icon', () => {
    expect(categoryCreateInputSchema.safeParse({ ...validInput, icon: 'SPACESHIP' }).success).toBe(false);
  });

  it('rejects a missing icon', () => {
    expect(categoryCreateInputSchema.safeParse({ name: 'Restaurants' }).success).toBe(false);
  });

  it('rejects a negative order', () => {
    expect(categoryCreateInputSchema.safeParse({ ...validInput, order: -1 }).success).toBe(false);
  });

  it('rejects a non-integer order', () => {
    expect(categoryCreateInputSchema.safeParse({ ...validInput, order: 1.2 }).success).toBe(false);
  });

  describe('security: identity/ownership fields are never client-suppliable', () => {
    it('rejects an injected categoryId', () => {
      expect(categoryCreateInputSchema.safeParse({ ...validInput, categoryId: 'cat_attackerControlled01' }).success).toBe(false);
    });

    it('rejects an injected customerId (cross-tenant targeting attempt)', () => {
      expect(categoryCreateInputSchema.safeParse({ ...validInput, customerId: 'cust_attackerControlled01' }).success).toBe(
        false,
      );
    });

    it('rejects an injected mapId', () => {
      expect(categoryCreateInputSchema.safeParse({ ...validInput, mapId: 'map_attackerControlled01' }).success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      expect(categoryCreateInputSchema.safeParse({ ...validInput, createdAt: 'x' }).success).toBe(false);
      expect(categoryCreateInputSchema.safeParse({ ...validInput, updatedAt: 'x' }).success).toBe(false);
    });

    it('rejects any other unrecognized extra field (strict mode)', () => {
      expect(categoryCreateInputSchema.safeParse({ ...validInput, isAdmin: true }).success).toBe(false);
    });

    it('rejects an injected sourceType (a client can never assert PLATFORM origin)', () => {
      expect(categoryCreateInputSchema.safeParse({ ...validInput, sourceType: 'PLATFORM' }).success).toBe(false);
    });

    it('rejects an unreleased/forged platformCategoryId (checkpoint 1B.4 — not one of the closed registry values)', () => {
      expect(categoryCreateInputSchema.safeParse({ ...validInput, platformCategoryId: 'platcat_123' }).success).toBe(false);
    });
  });

  describe('checkpoint 1B.4 — linking to a released platform category', () => {
    it('accepts the released Restaurant platformCategoryId', () => {
      const result = categoryCreateInputSchema.safeParse({ ...validInput, platformCategoryId: 'platcat_restaurant' });
      expect(result.success).toBe(true);
    });

    it('omitting platformCategoryId still creates a purely custom category', () => {
      expect(categoryCreateInputSchema.safeParse(validInput).success).toBe(true);
    });
  });
});

describe('categoryUpdateInputSchema — checkpoint 1B.2', () => {
  it('accepts a partial update with only enabled (toggle)', () => {
    expect(categoryUpdateInputSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('accepts a partial update with only order', () => {
    expect(categoryUpdateInputSchema.safeParse({ order: 2 }).success).toBe(true);
  });

  it('accepts a full update', () => {
    const result = categoryUpdateInputSchema.safeParse({ name: 'Shops', icon: 'SHOPPING', enabled: true, order: 1 });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update object', () => {
    expect(categoryUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty/whitespace-only name when name is provided', () => {
    expect(categoryUpdateInputSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an unknown icon when icon is provided', () => {
    expect(categoryUpdateInputSchema.safeParse({ icon: 'SPACESHIP' }).success).toBe(false);
  });

  it('rejects a negative order', () => {
    expect(categoryUpdateInputSchema.safeParse({ order: -5 }).success).toBe(false);
  });

  describe('security: ownership fields are never client-suppliable on update', () => {
    it('rejects an injected categoryId', () => {
      expect(categoryUpdateInputSchema.safeParse({ enabled: true, categoryId: 'cat_x' }).success).toBe(false);
    });

    it('rejects an injected customerId', () => {
      expect(categoryUpdateInputSchema.safeParse({ enabled: true, customerId: 'cust_x' }).success).toBe(false);
    });

    it('rejects an injected mapId (cross-map move attempt)', () => {
      expect(categoryUpdateInputSchema.safeParse({ enabled: true, mapId: 'map_x' }).success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      expect(categoryUpdateInputSchema.safeParse({ enabled: true, createdAt: 'x' }).success).toBe(false);
      expect(categoryUpdateInputSchema.safeParse({ enabled: true, updatedAt: 'x' }).success).toBe(false);
    });

    it('rejects an injected sourceType (cannot upgrade a category to PLATFORM from the client)', () => {
      expect(categoryUpdateInputSchema.safeParse({ enabled: true, sourceType: 'PLATFORM' }).success).toBe(false);
    });

    it('rejects an unreleased/forged platformCategoryId (checkpoint 1B.4 — not one of the closed registry values)', () => {
      expect(categoryUpdateInputSchema.safeParse({ enabled: true, platformCategoryId: 'platcat_123' }).success).toBe(false);
    });
  });

  describe('checkpoint 1B.4 — linking/unlinking a released platform category', () => {
    it('accepts linking to the released Restaurant platformCategoryId', () => {
      expect(categoryUpdateInputSchema.safeParse({ platformCategoryId: 'platcat_restaurant' }).success).toBe(true);
    });

    it('accepts explicitly unlinking via platformCategoryId: null', () => {
      expect(categoryUpdateInputSchema.safeParse({ platformCategoryId: null }).success).toBe(true);
    });
  });
});

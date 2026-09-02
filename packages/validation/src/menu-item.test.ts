import { describe, expect, it } from 'vitest';
import { menuItemCreateInputSchema, menuItemSchema, menuItemTranslationsSchema, menuItemUpdateInputSchema } from './menu-item';

const validCategoryMenuItem = {
  menuItemId: 'menu_aB3dEf6gH9jKlMn0pQ',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  type: 'CATEGORY',
  label: 'Gourmet',
  categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
  order: 0,
  status: 'ENABLED',
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

const validFeatureMenuItem = {
  menuItemId: 'menu_aB3dEf6gH9jKlMn0pR',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  type: 'FEATURE',
  label: 'Search',
  featureKey: 'SEARCH',
  order: 1,
  status: 'ENABLED',
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

const validPageMenuItem = {
  menuItemId: 'menu_aB3dEf6gH9jKlMn0pS',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  type: 'PAGE',
  label: 'Shuttle',
  pageId: 'page_aB3dEf6gH9jKlMn0pQ',
  order: 2,
  status: 'ENABLED',
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

describe('menuItemSchema', () => {
  it('accepts a valid CATEGORY menu item', () => {
    expect(menuItemSchema.safeParse(validCategoryMenuItem).success).toBe(true);
  });

  it('accepts a valid PAGE menu item', () => {
    expect(menuItemSchema.safeParse(validPageMenuItem).success).toBe(true);
  });

  it('accepts a valid PAGE menu item with an icon override', () => {
    expect(menuItemSchema.safeParse({ ...validPageMenuItem, icon: 'INFORMATION' }).success).toBe(true);
  });

  it('rejects a PAGE item missing pageId', () => {
    const { pageId, ...rest } = validPageMenuItem;
    void pageId;
    expect(menuItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a PAGE item that also carries categoryId (malformed mixed state)', () => {
    expect(menuItemSchema.safeParse({ ...validPageMenuItem, categoryId: 'cat_aB3dEf6gH9jKlMn0pQ' }).success).toBe(false);
  });

  it('rejects a PAGE item that also carries featureKey (malformed mixed state)', () => {
    expect(menuItemSchema.safeParse({ ...validPageMenuItem, featureKey: 'SEARCH' }).success).toBe(false);
  });

  it('rejects a CATEGORY item that also carries pageId (malformed mixed state)', () => {
    expect(menuItemSchema.safeParse({ ...validCategoryMenuItem, pageId: 'page_aB3dEf6gH9jKlMn0pQ' }).success).toBe(false);
  });

  it('accepts a valid CATEGORY menu item with an icon override', () => {
    expect(menuItemSchema.safeParse({ ...validCategoryMenuItem, icon: 'FOOD' }).success).toBe(true);
  });

  it('accepts a valid FEATURE menu item', () => {
    expect(menuItemSchema.safeParse(validFeatureMenuItem).success).toBe(true);
  });

  it('rejects a CATEGORY item missing categoryId', () => {
    const { categoryId, ...rest } = validCategoryMenuItem;
    void categoryId;
    expect(menuItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a CATEGORY item that also carries featureKey (malformed mixed state)', () => {
    expect(menuItemSchema.safeParse({ ...validCategoryMenuItem, featureKey: 'SEARCH' }).success).toBe(false);
  });

  it('rejects a FEATURE item missing featureKey', () => {
    const { featureKey, ...rest } = validFeatureMenuItem;
    void featureKey;
    expect(menuItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a FEATURE item that also carries categoryId (malformed mixed state)', () => {
    expect(menuItemSchema.safeParse({ ...validFeatureMenuItem, categoryId: 'cat_aB3dEf6gH9jKlMn0pQ' }).success).toBe(false);
  });

  it('rejects an unreleased/unknown featureKey', () => {
    expect(menuItemSchema.safeParse({ ...validFeatureMenuItem, featureKey: 'RANKING' }).success).toBe(false);
  });

  it('rejects an unrecognized type', () => {
    expect(menuItemSchema.safeParse({ ...validCategoryMenuItem, type: 'EVENT' }).success).toBe(false);
  });

  it('rejects an unrecognized status', () => {
    expect(menuItemSchema.safeParse({ ...validCategoryMenuItem, status: 'ARCHIVED' }).success).toBe(false);
  });
});

describe('menuItemSchema — translations (checkpoint 1B.17A, scenario 21)', () => {
  it('accepts a CATEGORY menu item with no translations field at all (backward compatibility)', () => {
    expect(menuItemSchema.safeParse(validCategoryMenuItem).success).toBe(true);
  });

  it('accepts a menu item with a valid label translations bag', () => {
    const result = menuItemSchema.safeParse({ ...validCategoryMenuItem, translations: { label: { ja: 'グルメ' } } });
    expect(result.success).toBe(true);
  });

  it('rejects a translations bag keyed by an unregistered language code', () => {
    expect(menuItemSchema.safeParse({ ...validCategoryMenuItem, translations: { label: { de: 'Gourmet' } } }).success).toBe(false);
  });

  it("rejects a translated label exceeding menuItemLabelSchema's own LABEL_MAX_LENGTH bound", () => {
    const result = menuItemSchema.safeParse({ ...validCategoryMenuItem, translations: { label: { en: 'a'.repeat(61) } } });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field on the translations object (strict mode)', () => {
    expect(menuItemTranslationsSchema.safeParse({ label: { en: 'Gourmet' }, name: { en: 'nope' } }).success).toBe(false);
  });

  it('accepts translations on a FEATURE and a PAGE menu item too (all three branches carry the field)', () => {
    expect(menuItemSchema.safeParse({ ...validFeatureMenuItem, translations: { label: { ja: '検索' } } }).success).toBe(true);
    expect(menuItemSchema.safeParse({ ...validPageMenuItem, translations: { label: { ja: 'シャトル' } } }).success).toBe(true);
  });
});

describe('menuItemCreateInputSchema', () => {
  it('accepts a minimal valid CATEGORY create input', () => {
    const result = menuItemCreateInputSchema.safeParse({ type: 'CATEGORY', categoryId: 'cat_aB3dEf6gH9jKlMn0pQ', label: 'Gourmet' });
    expect(result.success).toBe(true);
  });

  it('accepts a minimal valid FEATURE create input', () => {
    const result = menuItemCreateInputSchema.safeParse({ type: 'FEATURE', featureKey: 'MY_LOCATION', label: 'My Location' });
    expect(result.success).toBe(true);
  });

  it('accepts a minimal valid PAGE create input', () => {
    const result = menuItemCreateInputSchema.safeParse({ type: 'PAGE', pageId: 'page_aB3dEf6gH9jKlMn0pQ', label: 'Shuttle' });
    expect(result.success).toBe(true);
  });

  it('accepts a full PAGE create input with icon/order/status', () => {
    const result = menuItemCreateInputSchema.safeParse({
      type: 'PAGE',
      pageId: 'page_aB3dEf6gH9jKlMn0pQ',
      label: 'Shuttle',
      icon: 'INFORMATION',
      order: 3,
      status: 'DISABLED',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a PAGE input carrying categoryId', () => {
    const result = menuItemCreateInputSchema.safeParse({
      type: 'PAGE',
      pageId: 'page_aB3dEf6gH9jKlMn0pQ',
      categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
      label: 'Shuttle',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed pageId', () => {
    const result = menuItemCreateInputSchema.safeParse({ type: 'PAGE', pageId: 'not-a-page-id', label: 'Shuttle' });
    expect(result.success).toBe(false);
  });

  it('accepts a full CATEGORY create input with icon/order/status', () => {
    const result = menuItemCreateInputSchema.safeParse({
      type: 'CATEGORY',
      categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
      label: 'Gourmet',
      icon: 'FOOD',
      order: 3,
      status: 'DISABLED',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a CATEGORY input carrying featureKey', () => {
    const result = menuItemCreateInputSchema.safeParse({
      type: 'CATEGORY',
      categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
      featureKey: 'SEARCH',
      label: 'Gourmet',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a FEATURE input carrying categoryId', () => {
    const result = menuItemCreateInputSchema.safeParse({
      type: 'FEATURE',
      featureKey: 'SEARCH',
      categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
      label: 'Search',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a FEATURE input carrying an icon (features never accept a client icon override)', () => {
    const result = menuItemCreateInputSchema.safeParse({
      type: 'FEATURE',
      featureKey: 'SEARCH',
      label: 'Search',
      icon: 'FOOD',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unreleased featureKey', () => {
    const result = menuItemCreateInputSchema.safeParse({ type: 'FEATURE', featureKey: 'WEATHER', label: 'Weather' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed categoryId', () => {
    const result = menuItemCreateInputSchema.safeParse({ type: 'CATEGORY', categoryId: 'not-a-category-id', label: 'Gourmet' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty/whitespace-only label', () => {
    const result = menuItemCreateInputSchema.safeParse({ type: 'CATEGORY', categoryId: 'cat_aB3dEf6gH9jKlMn0pQ', label: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized label', () => {
    const result = menuItemCreateInputSchema.safeParse({
      type: 'CATEGORY',
      categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
      label: 'a'.repeat(61),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing type', () => {
    const result = menuItemCreateInputSchema.safeParse({ categoryId: 'cat_aB3dEf6gH9jKlMn0pQ', label: 'Gourmet' });
    expect(result.success).toBe(false);
  });

  describe('security: identity/ownership fields are never client-suppliable', () => {
    it('rejects an injected menuItemId', () => {
      const result = menuItemCreateInputSchema.safeParse({
        type: 'CATEGORY',
        categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
        label: 'Gourmet',
        menuItemId: 'menu_attackerControlled01',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an injected customerId/mapId', () => {
      const result = menuItemCreateInputSchema.safeParse({
        type: 'CATEGORY',
        categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
        label: 'Gourmet',
        customerId: 'cust_attackerControlled01',
        mapId: 'map_attackerControlled01',
      });
      expect(result.success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      const result = menuItemCreateInputSchema.safeParse({
        type: 'CATEGORY',
        categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
        label: 'Gourmet',
        createdAt: 'x',
      });
      expect(result.success).toBe(false);
    });

    it('rejects any other unrecognized extra field (strict mode)', () => {
      const result = menuItemCreateInputSchema.safeParse({
        type: 'CATEGORY',
        categoryId: 'cat_aB3dEf6gH9jKlMn0pQ',
        label: 'Gourmet',
        isAdmin: true,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('menuItemUpdateInputSchema', () => {
  it('accepts a partial update with only status', () => {
    expect(menuItemUpdateInputSchema.safeParse({ status: 'DISABLED' }).success).toBe(true);
  });

  it('accepts a partial update with only label', () => {
    expect(menuItemUpdateInputSchema.safeParse({ label: 'New Label' }).success).toBe(true);
  });

  it('accepts an icon override, and explicit null to clear one', () => {
    expect(menuItemUpdateInputSchema.safeParse({ icon: 'FOOD' }).success).toBe(true);
    expect(menuItemUpdateInputSchema.safeParse({ icon: null }).success).toBe(true);
  });

  it('accepts an order update', () => {
    expect(menuItemUpdateInputSchema.safeParse({ order: 5 }).success).toBe(true);
  });

  it('rejects an empty update object', () => {
    expect(menuItemUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty/whitespace-only label when provided', () => {
    expect(menuItemUpdateInputSchema.safeParse({ label: '   ' }).success).toBe(false);
  });

  it('has no type/categoryId/featureKey fields at all — immutable after creation', () => {
    expect(menuItemUpdateInputSchema.safeParse({ type: 'FEATURE' }).success).toBe(false);
    expect(menuItemUpdateInputSchema.safeParse({ categoryId: 'cat_aB3dEf6gH9jKlMn0pQ' }).success).toBe(false);
    expect(menuItemUpdateInputSchema.safeParse({ featureKey: 'SEARCH' }).success).toBe(false);
  });

  describe('security: ownership fields are never client-suppliable on update', () => {
    it('rejects an injected menuItemId', () => {
      expect(menuItemUpdateInputSchema.safeParse({ status: 'ENABLED', menuItemId: 'menu_x' }).success).toBe(false);
    });

    it('rejects an injected customerId/mapId', () => {
      expect(menuItemUpdateInputSchema.safeParse({ status: 'ENABLED', customerId: 'cust_x' }).success).toBe(false);
      expect(menuItemUpdateInputSchema.safeParse({ status: 'ENABLED', mapId: 'map_x' }).success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      expect(menuItemUpdateInputSchema.safeParse({ status: 'ENABLED', createdAt: 'x' }).success).toBe(false);
      expect(menuItemUpdateInputSchema.safeParse({ status: 'ENABLED', updatedAt: 'x' }).success).toBe(false);
    });
  });
});

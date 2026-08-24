import { describe, expect, it } from 'vitest';
import type { CategoryParsed, MenuItemParsed } from 'validation';
import { buildPublicMenuProjection } from './menu-projection';

/**
 * `buildPublicMenuProjection()` unit tests — checkpoint 1B.5 §28. Heavily
 * covers ordering, enabled/disabled filtering, and fail-closed behavior on
 * broken/disabled category references and unreleased feature keys, per the
 * checkpoint's own explicit instruction ("Unit-test it heavily").
 */

const TIMESTAMP = { seconds: 1700000000, nanoseconds: 0 };

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

function featureMenuItem(overrides: Partial<Extract<MenuItemParsed, { type: 'FEATURE' }>> = {}): MenuItemParsed {
  return {
    menuItemId: 'menu_b0000000000000000000',
    customerId: 'cust_a0000000000000000000',
    mapId: 'map_a0000000000000000000000',
    type: 'FEATURE',
    label: 'Search',
    featureKey: 'SEARCH',
    order: 1,
    status: 'ENABLED',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('buildPublicMenuProjection', () => {
  it('returns an empty array for an empty menu', () => {
    expect(buildPublicMenuProjection([], [])).toEqual([]);
  });

  it('projects an enabled CATEGORY item linked to an enabled category', () => {
    const result = buildPublicMenuProjection([categoryMenuItem()], [category()]);
    expect(result).toEqual([{ type: 'CATEGORY', label: 'Gourmet', icon: 'FOOD', categoryId: 'cat_restaurant00000000000' }]);
  });

  it('projects an enabled FEATURE item', () => {
    const result = buildPublicMenuProjection([featureMenuItem()], []);
    expect(result).toEqual([{ type: 'FEATURE', label: 'Search', icon: 'INFORMATION', featureKey: 'SEARCH' }]);
  });

  it('excludes a DISABLED menu item, category-backed or feature-backed', () => {
    const result = buildPublicMenuProjection(
      [categoryMenuItem({ status: 'DISABLED' }), featureMenuItem({ status: 'DISABLED' })],
      [category()],
    );
    expect(result).toEqual([]);
  });

  it('orders by numeric order ascending', () => {
    const result = buildPublicMenuProjection(
      [
        featureMenuItem({ menuItemId: 'menu_second00000000000000', order: 2 }),
        categoryMenuItem({ menuItemId: 'menu_first0000000000000000', order: 0 }),
        featureMenuItem({
          menuItemId: 'menu_middle00000000000000',
          order: 1,
          featureKey: 'MY_LOCATION',
          label: 'My Location',
        }),
      ],
      [category()],
    );
    expect(result.map((item) => item.label)).toEqual(['Gourmet', 'My Location', 'Search']);
  });

  it('breaks a tied order deterministically by menuItemId', () => {
    const result = buildPublicMenuProjection(
      [
        featureMenuItem({ menuItemId: 'menu_zzz00000000000000000', order: 0, label: 'Z Feature' }),
        categoryMenuItem({ menuItemId: 'menu_aaa00000000000000000', order: 0, label: 'A Category' }),
      ],
      [category()],
    );
    expect(result.map((item) => item.label)).toEqual(['A Category', 'Z Feature']);
  });

  it('fails closed on a CATEGORY item referencing a categoryId that does not exist (broken reference)', () => {
    const result = buildPublicMenuProjection([categoryMenuItem({ categoryId: 'cat_does_not_exist0000000' })], [category()]);
    expect(result).toEqual([]);
  });

  it('fails closed on a CATEGORY item referencing a disabled category', () => {
    const result = buildPublicMenuProjection([categoryMenuItem()], [category({ enabled: false })]);
    expect(result).toEqual([]);
  });

  it('fails closed on a FEATURE item referencing an unreleased/unknown featureKey', () => {
    // menuItemSchema itself would reject this at the storage boundary, but
    // buildPublicMenuProjection must not assume every input already passed
    // that check — defense-in-depth against a stale/forged document.
    const result = buildPublicMenuProjection(
      [{ ...featureMenuItem(), featureKey: 'RANKING' } as unknown as MenuItemParsed],
      [],
    );
    expect(result).toEqual([]);
  });

  it('resolves the effective icon from the linked category when the menu item has no icon override', () => {
    const result = buildPublicMenuProjection([categoryMenuItem()], [category({ icon: 'MUSEUM' })]);
    expect(result[0]).toMatchObject({ icon: 'MUSEUM' });
  });

  it('prefers the menu item’s own icon override over the linked category’s icon', () => {
    const result = buildPublicMenuProjection([categoryMenuItem({ icon: 'STATION' })], [category({ icon: 'MUSEUM' })]);
    expect(result[0]).toMatchObject({ icon: 'STATION' });
  });

  it('a FEATURE item always uses its registry icon, never a client value', () => {
    const result = buildPublicMenuProjection([featureMenuItem({ featureKey: 'MY_LOCATION', label: 'My Location' })], []);
    expect(result[0]).toMatchObject({ icon: 'SIGHTSEEING' });
  });

  it('projects a realistic mixed menu (categories + features) in order, skipping disabled/broken entries', () => {
    const result = buildPublicMenuProjection(
      [
        categoryMenuItem({ menuItemId: 'menu_gourmet000000000000000', order: 0, label: 'Gourmet', categoryId: 'cat_restaurant00000000000' }),
        categoryMenuItem({
          menuItemId: 'menu_sight00000000000000000',
          order: 1,
          label: 'Sightseeing',
          categoryId: 'cat_sightseeing000000000000',
        }),
        categoryMenuItem({
          menuItemId: 'menu_disabled0000000000000',
          order: 2,
          label: 'Disabled Category Link',
          categoryId: 'cat_disabled000000000000000',
        }),
        featureMenuItem({ menuItemId: 'menu_search000000000000000', order: 3, label: 'Search', featureKey: 'SEARCH' }),
        featureMenuItem({
          menuItemId: 'menu_toggled_off00000000000',
          order: 4,
          label: 'Turned Off Feature',
          status: 'DISABLED',
        }),
      ],
      [
        category({ categoryId: 'cat_restaurant00000000000', name: 'Restaurants', icon: 'FOOD' }),
        category({ categoryId: 'cat_sightseeing000000000000', name: 'Sightseeing', icon: 'SIGHTSEEING' }),
        category({ categoryId: 'cat_disabled000000000000000', name: 'Retired', icon: 'OTHER', enabled: false }),
      ],
    );

    expect(result).toEqual([
      { type: 'CATEGORY', label: 'Gourmet', icon: 'FOOD', categoryId: 'cat_restaurant00000000000' },
      { type: 'CATEGORY', label: 'Sightseeing', icon: 'SIGHTSEEING', categoryId: 'cat_sightseeing000000000000' },
      { type: 'FEATURE', label: 'Search', icon: 'INFORMATION', featureKey: 'SEARCH' },
    ]);
  });

  it('never mutates the input arrays', () => {
    const menuItems = [featureMenuItem({ order: 1 }), categoryMenuItem({ order: 0 })];
    const categories = [category()];
    const menuItemsSnapshot = [...menuItems];
    const categoriesSnapshot = [...categories];

    buildPublicMenuProjection(menuItems, categories);

    expect(menuItems).toEqual(menuItemsSnapshot);
    expect(categories).toEqual(categoriesSnapshot);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { FieldValue } from 'firebase-admin/firestore';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * `/admin/maps/{mapId}/categories` integration tests — checkpoint 1B.2,
 * redesigned into the drawer-based professional CMS UI in the Category CMS
 * redesign checkpoint, moved onto explicit `mapId`-in-the-URL routing in
 * checkpoint 1B.6. Real Auth + Firestore Emulator + a real `next dev`
 * server, same pattern as the rest of this suite (see playwright.config.ts).
 *
 * exact: true is used throughout for role-name queries — this page has
 * several short, overlapping labels by design (row action "Enable" vs. the
 * drawer's status option "Enabled"; the drawer's field label "Order" vs.
 * the table's "Order" column header is a `<th>`, not a form label, so that
 * one is naturally unambiguous, but the button-label overlaps are not —
 * see e2e/admin-shell.spec.ts's identical "Bounded"/"Unbounded" lesson).
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function row(page: Page, name: string) {
  return page.locator('tbody tr', { hasText: name });
}

async function openCreateDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ New category', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create Category' })).toBeVisible();
}

async function createCategory(page: Page, name: string, icon: string): Promise<void> {
  await openCreateDrawer(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Icon', { exact: true }).selectOption(icon);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('categories (redesigned CMS)', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('a CLIENT_ADMIN creates, reorders, disables, and edits categories via the drawer, and reload shows persisted values', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-catcms-manage@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nara Tours Co',
      displayName: 'Naomi Nara',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/categories`);
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/categories$`));

    // Empty state.
    await expect(page.getByText('No categories yet', { exact: true })).toBeVisible();

    // Create "Restaurants" via the drawer.
    await createCategory(page, 'Restaurants', 'FOOD');
    await expect(row(page, 'Restaurants')).toContainText('Food');
    await expect(row(page, 'Restaurants')).toContainText('Enabled');

    // Reload shows Restaurants.
    await page.reload();
    await expect(row(page, 'Restaurants')).toBeVisible();

    // Create "Shopping".
    await createCategory(page, 'Shopping', 'SHOPPING');
    await expect(row(page, 'Shopping')).toBeVisible();

    // Reorder via the edit drawer's Order field — push Restaurants (order 0) behind Shopping (order 1).
    await row(page, 'Restaurants').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Category' })).toBeVisible();
    await page.getByLabel('Order', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row(page, 'Restaurants')).toContainText('5');

    let rows = page.locator('tbody tr');
    await expect(rows.nth(0)).toContainText('Shopping');
    await expect(rows.nth(1)).toContainText('Restaurants');

    // Disable Shopping via the row's safe table action.
    await row(page, 'Shopping').getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(row(page, 'Shopping')).toContainText('Disabled');

    // Reload preserves order + enabled status.
    await page.reload();
    rows = page.locator('tbody tr');
    await expect(rows.nth(0)).toContainText('Shopping');
    await expect(rows.nth(0)).toContainText('Disabled');
    await expect(rows.nth(1)).toContainText('Restaurants');
    await expect(rows.nth(1)).toContainText('Enabled');

    // Edit Restaurants' name/icon via the drawer.
    await row(page, 'Restaurants').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Food & Dining');
    await page.getByLabel('Icon', { exact: true }).selectOption('SIGHTSEEING');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row(page, 'Food & Dining')).toContainText('Sightseeing');

    // Final reload — everything above persisted through Firestore, not React state.
    await page.reload();
    await expect(row(page, 'Food & Dining')).toContainText('Sightseeing');
    await expect(row(page, 'Food & Dining')).toContainText('5');
    await expect(row(page, 'Shopping')).toContainText('Disabled');

    // Draft-only: no publishedMaps doc, no category snapshot anywhere public.
    const firestore = await getE2eFirestore();
    const publishedSnap = await firestore.doc(`publishedMaps/${tenant.mapId}`).get();
    expect(publishedSnap.exists).toBe(false);

    // Category CMS architecture: every category this route creates is
    // stamped CLIENT_CUSTOM server-side.
    const restaurantsSnap = await firestore
      .collection(`maps/${tenant.mapId}/categories`)
      .where('name', '==', 'Food & Dining')
      .limit(1)
      .get();
    expect(restaurantsSnap.docs[0]?.data().sourceType).toBe('CLIENT_CUSTOM');
  });

  test('Cancel discards the drawer without creating a category', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-catcms-cancel@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Cancel Test Co',
      displayName: 'Cara Cancel',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/categories`);

    await openCreateDrawer(page);
    await page.getByLabel('Name', { exact: true }).fill('Should Not Be Saved');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Should Not Be Saved')).toHaveCount(0);
    await expect(page.getByText('No categories yet', { exact: true })).toBeVisible();
  });

  test('search filters by name and the status filter narrows the list', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-catcms-search@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Search Test Co',
      displayName: 'Sara Search',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/categories`);

    await createCategory(page, 'Restaurants', 'FOOD');
    await createCategory(page, 'Shopping', 'SHOPPING');
    await row(page, 'Shopping').getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(row(page, 'Shopping')).toContainText('Disabled');

    // Search narrows to the matching category only.
    await page.getByLabel('Search categories', { exact: true }).fill('resta');
    await expect(row(page, 'Restaurants')).toBeVisible();
    await expect(page.getByText('Shopping', { exact: true })).toHaveCount(0);
    await page.getByLabel('Search categories', { exact: true }).fill('');

    // Status filter: Disabled shows only Shopping.
    await page.getByLabel('Filter', { exact: true }).selectOption('DISABLED');
    await expect(row(page, 'Shopping')).toBeVisible();
    await expect(page.getByText('Restaurants', { exact: true })).toHaveCount(0);

    // Enabled shows only Restaurants.
    await page.getByLabel('Filter', { exact: true }).selectOption('ENABLED');
    await expect(row(page, 'Restaurants')).toBeVisible();
    await expect(page.getByText('Shopping', { exact: true })).toHaveCount(0);

    // All shows both again.
    await page.getByLabel('Filter', { exact: true }).selectOption('ALL');
    await expect(row(page, 'Restaurants')).toBeVisible();
    await expect(row(page, 'Shopping')).toBeVisible();
  });

  test('order up/down arrows swap adjacent categories', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-catcms-reorder@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Reorder Test Co',
      displayName: 'Reo Reorder',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/categories`);

    await createCategory(page, 'Restaurants', 'FOOD'); // order 0
    await createCategory(page, 'Shopping', 'SHOPPING'); // order 1

    let rows = page.locator('tbody tr');
    await expect(rows.nth(0)).toContainText('Restaurants');
    await expect(rows.nth(1)).toContainText('Shopping');

    await page.getByRole('button', { name: 'Move Shopping up', exact: true }).click();

    rows = page.locator('tbody tr');
    await expect(rows.nth(0)).toContainText('Shopping');
    await expect(rows.nth(1)).toContainText('Restaurants');

    await page.reload();
    rows = page.locator('tbody tr');
    await expect(rows.nth(0)).toContainText('Shopping');
    await expect(rows.nth(1)).toContainText('Restaurants');
  });

  test('an old-shape category document (no sourceType/platformCategoryId) still renders (backward compatibility)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-catcms-legacy@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Legacy Data Co',
      displayName: 'Leo Legacy',
    });

    const firestore = await getE2eFirestore();
    const legacyCategoryId = 'cat_legacy_no_source_type0';
    await firestore.doc(`maps/${tenant.mapId}/categories/${legacyCategoryId}`).set({
      categoryId: legacyCategoryId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      name: 'Food',
      icon: 'FOOD',
      enabled: true,
      order: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Deliberately no sourceType/platformCategoryId — the exact shape
      // checkpoint 1B.2 wrote before this checkpoint's optional fields
      // existed.
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/categories`);

    await expect(row(page, 'Food')).toBeVisible();
    await expect(row(page, 'Food')).toContainText('Enabled');
  });

  test('tenant A cannot edit a tenant B category — neither via categoryId under A\'s own map nor by forging B\'s mapId', async ({
    page,
  }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-catcms-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Tours',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-catcms-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Tours',
      displayName: 'Bob B',
    });

    const firestore = await getE2eFirestore();
    const tenantBCategoryId = 'cat_tenant_b_seed_0000000';
    await firestore.doc(`maps/${tenantB.mapId}/categories/${tenantBCategoryId}`).set({
      categoryId: tenantBCategoryId,
      customerId: tenantB.customerId,
      mapId: tenantB.mapId,
      name: 'Tenant B Category',
      icon: 'OTHER',
      enabled: true,
      order: 0,
      sourceType: 'CLIENT_CUSTOM',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await login(page, tenantA);

    // Attempt 1: tenant A's OWN map, tenant B's categoryId — the category
    // simply doesn't exist at that path.
    const viaOwnMap = await page.evaluate(
      async ({ mapId, categoryId }: { mapId: string; categoryId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/categories/${categoryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Hacked' }),
        });
        return { status: response.status, body: await response.json() };
      },
      { mapId: tenantA.mapId, categoryId: tenantBCategoryId },
    );
    expect(viaOwnMap.status).toBe(404);

    // Attempt 2 (checkpoint 1B.6 — the more direct attack now that mapId is
    // explicit in the URL): tenant A forges tenant B's OWN mapId. This must
    // fail at `getOwnedMapContext()` — a 404 "map not found" — before the
    // request ever reaches the category lookup at all.
    const viaForgedMapId = await page.evaluate(
      async ({ mapId, categoryId }: { mapId: string; categoryId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/categories/${categoryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Hacked' }),
        });
        return { status: response.status, body: await response.json() };
      },
      { mapId: tenantB.mapId, categoryId: tenantBCategoryId },
    );
    expect(viaForgedMapId.status).toBe(404);
    expect(viaForgedMapId.body.code).toBe('map/not-found');

    const untouchedSnap = await firestore.doc(`maps/${tenantB.mapId}/categories/${tenantBCategoryId}`).get();
    expect(untouchedSnap.data()?.name).toBe('Tenant B Category');
  });

  test('a forged customerId/sourceType payload is rejected on both create and update', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-catcms-forged-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Forged Test Co A',
      displayName: 'Alice A',
    });

    await login(page, tenantA);

    const createResult = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Forged',
          icon: 'OTHER',
          customerId: 'cust_forged00000000000',
          sourceType: 'PLATFORM',
        }),
      });
      return { status: response.status };
    }, tenantA.mapId);
    expect(createResult.status).toBe(400);

    const patchResult = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/categories/cat_does_not_matter_00000`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, mapId: 'map_forged00000000000000', platformCategoryId: 'platcat_forged' }),
      });
      return { status: response.status };
    }, tenantA.mapId);
    expect(patchResult.status).toBe(400);

    // No category was ever created under tenant A's own map from either forged request.
    const firestore = await getE2eFirestore();
    const snapshot = await firestore.collection(`maps/${tenantA.mapId}/categories`).get();
    expect(snapshot.empty).toBe(true);
  });

  test('a signed-out visitor cannot list or create categories', async ({ page }) => {
    await page.goto('/login');
    const listResult = await page.evaluate(async () => {
      const response = await fetch('/api/maps/map_does_not_matter_0000000/categories');
      return response.status;
    });
    expect(listResult).toBe(401);

    const createResult = await page.evaluate(async () => {
      const response = await fetch('/api/maps/map_does_not_matter_0000000/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', icon: 'OTHER' }),
      });
      return response.status;
    });
    expect(createResult).toBe(401);
  });
});

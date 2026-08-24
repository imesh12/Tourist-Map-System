import { expect, test, type Page } from '@playwright/test';
import { FieldValue } from 'firebase-admin/firestore';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * `/admin/maps/{mapId}/pois` integration tests — checkpoint 1B.3, moved
 * onto explicit `mapId`-in-the-URL routing in checkpoint 1B.6, same pattern
 * as the rest of this suite (real Auth + Firestore Emulator + a real
 * `next dev` server — see playwright.config.ts). Covers the checkpoint's
 * own A–T test list; see each `test()`'s trailing `(letter)` for the
 * mapping.
 *
 * The Google Maps JS API is unreachable in this hermetic suite (empty
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, e2e/constants.ts) — every test here
 * drives the POI drawer's independently-editable Latitude/Longitude text
 * inputs directly rather than clicking a live map, per checkpoint §25
 * ("test the deterministic fallback/coordinate behavior instead of calling
 * the real Google API").
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

/** Mirrors e2e/categories.spec.ts's identical helper. */
async function createCategory(page: Page, mapId: string, name: string, icon: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/categories`);
  await page.getByRole('button', { name: '+ New category', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create Category' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Icon', { exact: true }).selectOption(icon);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

interface CreatePoiOptions {
  readonly name: string;
  /** Selects the Nth category option (0-based) — categories appear in creation order (`order` ASC), matching e2e/categories.spec.ts's own "order 0"/"order 1" convention. Defaults to the first (and often only) category. */
  readonly categoryIndex?: number;
  readonly address?: string;
  readonly description?: string;
  readonly latitude: number | string;
  readonly longitude: number | string;
  readonly status?: 'ENABLED' | 'DISABLED';
}

async function openCreatePoiDrawer(page: Page, mapId: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/pois`);
  await page.getByRole('button', { name: '+ New POI', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New POI' })).toBeVisible();
}

async function fillPoiForm(page: Page, options: CreatePoiOptions): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(options.name);
  if (options.categoryIndex !== undefined) {
    await page.getByLabel('Category', { exact: true }).selectOption({ index: options.categoryIndex });
  }
  if (options.address !== undefined) {
    await page.getByLabel('Address').fill(options.address);
  }
  if (options.description !== undefined) {
    await page.getByLabel('Description').fill(options.description);
  }
  await page.getByLabel('Latitude', { exact: true }).fill(String(options.latitude));
  await page.getByLabel('Longitude', { exact: true }).fill(String(options.longitude));
  if (options.status === 'DISABLED') {
    await page.getByRole('button', { name: 'Disabled', exact: true }).click();
  }
}

async function createPoi(page: Page, mapId: string, options: CreatePoiOptions): Promise<void> {
  await openCreatePoiDrawer(page, mapId);
  await fillPoiForm(page, options);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('1B.3 POIs / Spots', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('the /admin/maps/{mapId}/pois route renders inside the admin shell (A)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-shell@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Shell Co',
      displayName: 'Shelly Admin',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await expect(page.getByRole('heading', { name: 'POIs & Spots', exact: true })).toBeVisible();
    // Inside the shared admin shell, not a bare page — the header's
    // Sign out affordance (components/admin-shell/header.tsx) is present on
    // every real admin route.
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('the POIs sidebar link is a real, active route (B)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-nav@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nav Co',
      displayName: 'Nadia Nav',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    await page.goto(`/admin/maps/${tenant.mapId}`);
    const sidebar = page.getByRole('navigation', { name: 'Admin' });
    await sidebar.getByRole('link', { name: 'POIs / Spots', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/pois$`));
    await expect(sidebar.getByRole('link', { name: 'POIs / Spots', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('an empty POI list shows the empty state (C)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-empty@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Empty Co',
      displayName: 'Emma Empty',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await expect(page.getByText('No POIs yet')).toBeVisible();
  });

  test('a Client Admin creates a POI (D), it appears in the list (E), and survives a reload (F)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-create@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Create Co',
      displayName: 'Cara Create',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    await createPoi(page, tenant.mapId, { name: 'Sakura Restaurant', latitude: 35.6812, longitude: 139.7671 });

    const poiRow = row(page, 'Sakura Restaurant');
    await expect(poiRow).toBeVisible(); // (E)
    await expect(poiRow.getByText('Restaurants')).toBeVisible();
    await expect(poiRow.getByText('Manual')).toBeVisible();
    await expect(poiRow.getByText('Enabled')).toBeVisible();

    await page.reload(); // (F)
    await expect(row(page, 'Sakura Restaurant')).toBeVisible();
  });

  test('a Client Admin edits a POI (G)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-edit@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Edit Co',
      displayName: 'Eddie Edit',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Old Name', latitude: 1, longitude: 1 });

    await row(page, 'Old Name').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit POI' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('New Name');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(row(page, 'New Name')).toBeVisible();
    await expect(row(page, 'Old Name')).toHaveCount(0);
  });

  test('a Client Admin disables and re-enables a POI (H)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-toggle@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Toggle Co',
      displayName: 'Toby Toggle',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Toggle Spot', latitude: 1, longitude: 1 });

    await row(page, 'Toggle Spot').getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(row(page, 'Toggle Spot').getByText('Disabled')).toBeVisible();

    await row(page, 'Toggle Spot').getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(row(page, 'Toggle Spot').getByText('Enabled')).toBeVisible();
  });

  test('search narrows the list to matching POIs (I)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-search@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Search Co',
      displayName: 'Sam Search',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Sakura Restaurant', latitude: 1, longitude: 1 });
    await createPoi(page, tenant.mapId, { name: 'Local Cafe', latitude: 2, longitude: 2 });

    await page.getByLabel('Search POIs', { exact: true }).fill('Sakura');
    await expect(row(page, 'Sakura Restaurant')).toBeVisible();
    await expect(row(page, 'Local Cafe')).toHaveCount(0);
  });

  test('the category filter narrows the list to one category (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-catfilter@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Filter Co',
      displayName: 'Fiona Filter',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD'); // index 0
    await createCategory(page, tenant.mapId, 'Sightseeing', 'SIGHTSEEING'); // index 1
    await createPoi(page, tenant.mapId, { name: 'Sakura Restaurant', categoryIndex: 0, latitude: 1, longitude: 1 });
    await createPoi(page, tenant.mapId, { name: 'Central Park', categoryIndex: 1, latitude: 2, longitude: 2 });

    await page.getByLabel('Filter by category', { exact: true }).selectOption({ label: 'Sightseeing' });
    await expect(row(page, 'Central Park')).toBeVisible();
    await expect(row(page, 'Sakura Restaurant')).toHaveCount(0);
  });

  test('the status filter narrows the list by Enabled/Disabled (K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-statusfilter@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Status Co',
      displayName: 'Stan Status',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Enabled Spot', latitude: 1, longitude: 1, status: 'ENABLED' });
    await createPoi(page, tenant.mapId, { name: 'Disabled Spot', latitude: 2, longitude: 2, status: 'DISABLED' });

    await page.getByLabel('Status', { exact: true }).selectOption('DISABLED');
    await expect(row(page, 'Disabled Spot')).toBeVisible();
    await expect(row(page, 'Enabled Spot')).toHaveCount(0);

    await page.getByLabel('Status', { exact: true }).selectOption('ENABLED');
    await expect(row(page, 'Enabled Spot')).toBeVisible();
    await expect(row(page, 'Disabled Spot')).toHaveCount(0);
  });

  test('delete requires deliberate confirmation (L), Cancel preserves the POI (M), and confirming removes it (N)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-delete@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Delete Co',
      displayName: 'Dana Delete',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Doomed Spot', latitude: 1, longitude: 1 });

    await row(page, 'Doomed Spot').getByRole('button', { name: 'Delete Doomed Spot', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete POI?' });
    await expect(dialog).toBeVisible(); // (L)
    await expect(dialog.getByText('Doomed Spot')).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); // (M)
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(row(page, 'Doomed Spot')).toBeVisible();

    await row(page, 'Doomed Spot').getByRole('button', { name: 'Delete Doomed Spot', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Delete POI?' }).getByRole('button', { name: 'Delete', exact: true }).click(); // (N)
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(row(page, 'Doomed Spot')).toHaveCount(0);
  });

  test('a category belonging to another tenant cannot be assigned to a POI (O)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b3-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Co',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b3-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Co',
      displayName: 'Bob B',
    });

    const firestore = await getE2eFirestore();
    const tenantBCategoryId = 'cat_tenant_b_poi_seed_000';
    await firestore.doc(`maps/${tenantB.mapId}/categories/${tenantBCategoryId}`).set({
      categoryId: tenantBCategoryId,
      customerId: tenantB.customerId,
      mapId: tenantB.mapId,
      name: 'Tenant B Category',
      icon: 'OTHER',
      enabled: true,
      order: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await login(page, tenantA);

    const result = await page.evaluate(
      async ({ mapId, categoryId }: { mapId: string; categoryId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/pois`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Cross-Tenant POI', categoryId, latitude: 1, longitude: 1 }),
        });
        return { status: response.status };
      },
      { mapId: tenantA.mapId, categoryId: tenantBCategoryId },
    );

    expect(result.status).toBe(400);

    // Nothing was created under either tenant's map from this request.
    const tenantAPois = await firestore.collection(`maps/${tenantA.mapId}/pois`).get();
    expect(tenantAPois.empty).toBe(true);
  });

  test('forged customerId/mapId/sourceType cannot change ownership (P)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-forged@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Forged Co',
      displayName: 'Frank Forged',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    const categoryId = (await (await getE2eFirestore()).collection(`maps/${tenant.mapId}/categories`).limit(1).get()).docs[0]!.id;

    const result = await page.evaluate(
      async ({ mapId, categoryId: cid }: { mapId: string; categoryId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/pois`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Forged POI',
            categoryId: cid,
            latitude: 1,
            longitude: 1,
            customerId: 'cust_attacker_controlled0000',
            mapId: 'map_attacker_controlled00000',
            sourceType: 'GOOGLE_PLACES',
          }),
        });
        return { status: response.status };
      },
      { mapId: tenant.mapId, categoryId },
    );

    // poiCreateInputSchema is `.strict()` — any unrecognized/forbidden field
    // rejects the whole request rather than silently stripping it, so no
    // POI is created with forged ownership at all.
    expect(result.status).toBe(400);
    const firestore = await getE2eFirestore();
    const pois = await firestore.collection(`maps/${tenant.mapId}/pois`).get();
    expect(pois.empty).toBe(true);
  });

  test('a signed-out user cannot mutate POIs (Q)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-signedout@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'SignedOut Co',
      displayName: 'Sid SignedOut',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    const result = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/pois`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Should Not Exist', categoryId: 'cat_whatever00000000000000', latitude: 1, longitude: 1 }),
      });
      return { status: response.status };
    }, tenant.mapId);

    expect(result.status).toBe(401);
  });

  test('direct navigation to /admin/maps/{mapId}/pois remains protected when unauthenticated (R)', async ({ page }) => {
    await page.goto('/admin/maps/map_doesnotexist000000000/pois');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('a client with zero categories is directed to Categories instead of a broken create form (S)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-nocategory@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'NoCategory Co',
      displayName: 'Nia NoCategory',
    });
    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await expect(page.getByText('You need at least one category before adding a POI.')).toBeVisible();
    await page.getByRole('link', { name: 'Create category', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/categories$`));
  });

  test('map coordinates persist exactly across reload and reopening the edit drawer (T)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b3-coords@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Coords Co',
      displayName: 'Cody Coords',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Precise Spot', latitude: 35.681236, longitude: 139.767125 });

    await page.reload();
    await row(page, 'Precise Spot').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit POI' })).toBeVisible();
    await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('35.681236');
    await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue('139.767125');
  });
});

import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionAdditionalMap, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.6 "Multi-Map Tenant Foundation" integration tests — real
 * Auth + Firestore Emulator + a real `next dev` server, same pattern as the
 * rest of this suite. Covers the checkpoint's own §15 A–T scenario list;
 * see each `test()`'s trailing `(letter)` for the mapping. Scenarios
 * already fully exercised elsewhere are referenced rather than duplicated:
 *
 * - The real browser → Callable Function → Firestore registration path
 *   (R — "registration still provisions an initial map") is exercised
 *   end-to-end by `e2e/registration.spec.ts`; the test here adds a
 *   complementary API-level check that a freshly provisioned tenant owns
 *   exactly one map.
 * - Per-map Settings/Categories/POIs/Menu Builder CRUD (S — "existing
 *   single-map workflow remains functional") is already exhaustively
 *   covered by `e2e/map-settings.spec.ts`/`categories.spec.ts`/
 *   `pois.spec.ts`/`menu-builder.spec.ts`, all rewritten for the new
 *   mapId-scoped routes in this same checkpoint — this file adds only a
 *   light end-to-end smoke of the single-map workspace to prove it still
 *   works standalone, not another full CRUD suite.
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

interface CreateCategoryOptions {
  readonly linkToRestaurant?: boolean;
}

async function createCategory(page: Page, mapId: string, name: string, icon: string, options?: CreateCategoryOptions): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/categories`);
  await page.getByRole('button', { name: '+ New category', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create Category' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Icon', { exact: true }).selectOption(icon);
  if (options?.linkToRestaurant) {
    await page.getByLabel('Category type', { exact: true }).selectOption('platcat_restaurant');
  }
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function fetchJson<T>(page: Page, url: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ url: u, init: i }: { url: string; init?: { method?: string; body?: unknown } }) => {
      const response = await fetch(u, {
        method: i?.method ?? 'GET',
        headers: i?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: i?.body !== undefined ? JSON.stringify(i.body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    },
    { url, init },
  );
}

test.describe('1B.6 multi-map tenant foundation', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('the Maps dashboard shows the initial map, and a second map can be created and survives a reload (A, B, C, D)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-dashboard@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Dashboard Co',
      displayName: 'Dana Dashboard',
    });
    await login(page, tenant);

    await page.goto('/admin/maps'); // (A)
    await expect(page.getByRole('heading', { name: 'Maps', exact: true })).toBeVisible();
    await expect(row(page, tenant.mapName)).toBeVisible(); // (B) — the initial provisioned map appears

    // (C) create a second map through the real UI + trusted API.
    await page.getByRole('button', { name: '+ Create map', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Create map' })).toBeVisible();
    // Not `exact: true` — the real label text is "Map name *" (required-field
    // asterisk, see create-map-drawer.tsx), same non-exact substring match
    // every other "Map name" lookup in this suite already uses (e.g.
    // map-settings.spec.ts). Repair Round 1 (checkpoint 1B.6): this was this
    // test's own authoring bug from Phase A, not a production issue — an
    // `exact: true` match here never matched anything, hanging until the
    // 30s test timeout rather than failing fast.
    await page.getByLabel('Map name').fill('Osaka Downtown Map');
    await page.getByRole('button', { name: 'Create map', exact: true }).click();

    // Creating a map navigates straight to its own overview page.
    await expect(page).toHaveURL(/\/admin\/maps\/map_[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Osaka Downtown Map', exact: true })).toBeVisible();

    await page.goto('/admin/maps');
    await expect(row(page, tenant.mapName)).toBeVisible();
    await expect(row(page, 'Osaka Downtown Map')).toBeVisible();

    await page.reload(); // (D) — both maps survive a reload
    await expect(row(page, tenant.mapName)).toBeVisible();
    await expect(row(page, 'Osaka Downtown Map')).toBeVisible();
  });

  test('opening a map establishes it as active, and switching maps changes the actual route/context (E, F)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-switch@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Switch Co',
      displayName: 'Sam Switch',
      mapName: 'Shinjuku Tourist Map',
    });
    const osaka = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Osaka Tourist Map' });
    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}`);
    await expect(page.getByRole('heading', { name: 'Shinjuku Tourist Map', exact: true })).toBeVisible(); // (E)

    await page.goto(`/admin/maps/${tenant.mapId}/categories`);
    const switcher = page.getByLabel('Switch map', { exact: true });
    await expect(switcher).toHaveValue(tenant.mapId);
    await switcher.selectOption(osaka.mapId);

    // (F) — a real navigation to the new map's own URL, preserving the
    // current sub-page (stayed on Categories), not a cosmetic selector.
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${osaka.mapId}/categories$`));
    await expect(switcher).toHaveValue(osaka.mapId);
  });

  test('editing one map’s settings never alters another owned map’s settings (G)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-settings-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'SettingsIsolation Co',
      displayName: 'Sia Settings',
      mapName: 'Shinjuku Tourist Map',
    });
    const osaka = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Osaka Tourist Map' });
    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Map name').fill('Shinjuku Renamed');
    await page.getByLabel('Center latitude').fill('35.6938');
    await page.getByLabel('Center longitude').fill('139.7034');
    await page.getByLabel('Default zoom').fill('14');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // `PATCH /api/maps/{mapId}/settings` has no GET counterpart — read the
    // source of truth (Firestore) directly instead.
    const firestore = await getE2eFirestore();
    const osakaSnap = await firestore.doc(`maps/${osaka.mapId}`).get();
    expect(osakaSnap.data()?.name).toBe('Osaka Tourist Map');
    expect(osakaSnap.data()?.area).toEqual({ type: 'UNBOUNDED' });

    const shinjukuSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(shinjukuSnap.data()?.name).toBe('Shinjuku Renamed');
  });

  test('a category created under one map never appears under another owned map (H)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-category-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'CategoryIsolation Co',
      displayName: 'Cara Category',
      mapName: 'Shinjuku Tourist Map',
    });
    const osaka = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Osaka Tourist Map' });
    await login(page, tenant);

    await createCategory(page, tenant.mapId, 'Shinjuku Ramen', 'FOOD');
    await expect(row(page, 'Shinjuku Ramen')).toBeVisible();

    await page.goto(`/admin/maps/${osaka.mapId}/categories`);
    await expect(row(page, 'Shinjuku Ramen')).toHaveCount(0);
    await expect(page.getByText('No categories yet')).toBeVisible();
  });

  test('a manual POI created under one map never appears under another owned map (I)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-poi-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'PoiIsolation Co',
      displayName: 'Pia Poi',
      mapName: 'Shinjuku Tourist Map',
    });
    const osaka = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Osaka Tourist Map' });
    await login(page, tenant);

    await createCategory(page, tenant.mapId, 'Shinjuku Spots', 'SIGHTSEEING');
    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await page.getByRole('button', { name: '+ New POI', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Shinjuku Gyoen');
    await page.getByLabel('Latitude', { exact: true }).fill('35.6852');
    await page.getByLabel('Longitude', { exact: true }).fill('139.71');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row(page, 'Shinjuku Gyoen')).toBeVisible();

    await page.goto(`/admin/maps/${osaka.mapId}/pois`);
    await expect(row(page, 'Shinjuku Gyoen')).toHaveCount(0);
  });

  test('a Google Places-imported POI under one map never appears under another owned map (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-import-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'ImportIsolation Co',
      displayName: 'Ivy Import',
      mapName: 'Shinjuku Tourist Map',
    });
    const osaka = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Osaka Tourist Map' });
    await login(page, tenant);

    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await page.getByRole('button', { name: 'Discover Places', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discover Places' })).toBeVisible();
    await page.getByRole('button', { name: 'Search nearby', exact: true }).click();
    await page.getByRole('button', { name: 'Import Sakura Sushi Bar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Import Sakura Sushi Bar', exact: true })).toHaveCount(0);
    await page.getByRole('dialog', { name: 'Discover Places' }).getByText('Close', { exact: true }).click();
    await expect(row(page, 'Sakura Sushi Bar')).toBeVisible();

    await page.goto(`/admin/maps/${osaka.mapId}/pois`);
    await expect(row(page, 'Sakura Sushi Bar')).toHaveCount(0);

    // Same real-world place CAN legitimately be imported into a second map
    // of the same tenant (§9) — duplicate-import protection is per-map, not
    // per-tenant. This is the flip side of the isolation proof above: the
    // SAME provider+providerPlaceId that's already imported into Shinjuku
    // is accepted (not 409) when imported into Osaka.
    await createCategory(page, osaka.mapId, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    const osakaCategoryId = (await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/categories`);
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    }, osaka.mapId)) as string;

    const importResult = await fetchJson<{ code?: string }>(page, `/api/maps/${osaka.mapId}/pois/import`, {
      method: 'POST',
      body: { categoryId: osakaCategoryId, provider: 'GOOGLE', providerPlaceId: 'places/fake-restaurant-1' },
    });
    expect(importResult.status).toBe(201);

    await page.goto(`/admin/maps/${osaka.mapId}/pois`);
    await expect(row(page, 'Sakura Sushi Bar')).toBeVisible();

    // Shinjuku's own copy is untouched by Osaka's independent import.
    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await expect(row(page, 'Sakura Sushi Bar')).toHaveCount(1);
  });

  test('a menu item added under one map never appears under another owned map (K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-menu-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'MenuIsolation Co',
      displayName: 'Mia Menu',
      mapName: 'Shinjuku Tourist Map',
    });
    const osaka = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Osaka Tourist Map' });
    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}/menu`);
    await page.getByRole('button', { name: '+ Add menu item', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Add Menu Item' })).toBeVisible();
    await page.getByRole('button', { name: 'Feature', exact: true }).click();
    await page.getByLabel('Feature', { exact: true }).selectOption({ label: 'Search' });
    await page.getByLabel('Public label', { exact: true }).fill('Search');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row(page, 'Search')).toBeVisible();

    const osakaMenuItems = await fetchJson<{ menuItems: unknown[] }>(page, `/api/maps/${osaka.mapId}/menu-items`);
    expect(osakaMenuItems.status).toBe(200);
    expect(osakaMenuItems.body.menuItems).toEqual([]);
  });

  test('Google Places discovery searches around the SELECTED map’s own configured geography (L)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-geography@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Geography Co',
      displayName: 'Geo Graphy',
      mapName: 'Shinjuku Tourist Map',
    });
    const osaka = await provisionAdditionalMap({
      customerId: tenant.customerId,
      mapName: 'Osaka Tourist Map',
      area: { type: 'UNBOUNDED', center: { lat: 34.6937, lng: 135.5023 } },
    });
    // Give Shinjuku its own distinct configured center too, via direct
    // Firestore write — same doc shape `POST /api/maps/{mapId}/settings`
    // itself would produce.
    const firestore = await getE2eFirestore();
    await firestore.doc(`maps/${tenant.mapId}`).update({ area: { type: 'UNBOUNDED', center: { lat: 35.6938, lng: 139.7034 } } });

    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    await createCategory(page, osaka.mapId, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    const shinjukuCategoryId = (await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/categories`);
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    }, tenant.mapId)) as string;
    const osakaCategoryId = (await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/categories`);
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    }, osaka.mapId)) as string;

    const shinjukuResult = await fetchJson<{ candidates: Array<{ location: { latitude: number; longitude: number } }> }>(
      page,
      `/api/maps/${tenant.mapId}/pois/discover`,
      { method: 'POST', body: { categoryId: shinjukuCategoryId, radiusMeters: 1000 } },
    );
    const osakaResult = await fetchJson<{ candidates: Array<{ location: { latitude: number; longitude: number } }> }>(
      page,
      `/api/maps/${osaka.mapId}/pois/discover`,
      { method: 'POST', body: { categoryId: osakaCategoryId, radiusMeters: 1000 } },
    );

    // FakeGooglePlacesProvider offsets its fixed candidates relative to
    // whatever center it's asked to search around (see
    // lib/pois/fake-external-provider.ts) — so the two result sets landing
    // near their own map's configured center, and NOT near the other map's
    // center, is direct proof discovery geography is per-map, not global or
    // sticky to whichever map loaded first.
    const shinjukuLocation = shinjukuResult.body.candidates[0]!.location;
    expect(shinjukuLocation.latitude).toBeCloseTo(35.6938, 1);
    expect(shinjukuLocation.longitude).toBeCloseTo(139.7034, 1);

    const osakaLocation = osakaResult.body.candidates[0]!.location;
    expect(osakaLocation.latitude).toBeCloseTo(34.6937, 1);
    expect(osakaLocation.longitude).toBeCloseTo(135.5023, 1);

    expect(Math.abs(shinjukuLocation.latitude - osakaLocation.latitude)).toBeGreaterThan(0.5);
  });

  test('the same tenant can access both of their owned maps (M)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-same-tenant-access@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'SameTenant Co',
      displayName: 'Sam Same',
    });
    const secondMap = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Second Map' });
    await login(page, tenant);

    const listResult = await fetchJson<{ maps: Array<{ mapId: string }> }>(page, '/api/maps');
    expect(listResult.status).toBe(200);
    const ownedMapIds = listResult.body.maps.map((map) => map.mapId).sort();
    expect(ownedMapIds).toEqual([tenant.mapId, secondMap.mapId].sort());

    const firstMapCategories = await fetchJson(page, `/api/maps/${tenant.mapId}/categories`);
    expect(firstMapCategories.status).toBe(200);
    const secondMapCategories = await fetchJson(page, `/api/maps/${secondMap.mapId}/categories`);
    expect(secondMapCategories.status).toBe(200);

    await page.goto(`/admin/maps/${tenant.mapId}`);
    await expect(page.getByRole('heading', { name: tenant.mapName, exact: true })).toBeVisible();
    await page.goto(`/admin/maps/${secondMap.mapId}`);
    await expect(page.getByRole('heading', { name: 'Second Map', exact: true })).toBeVisible();
  });

  test('tenant A cannot read or mutate tenant B’s map by forging tenant B’s mapId (N, O)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b6-crosstenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'CrossTenant A',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b6-crosstenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'CrossTenant B',
      displayName: 'Bob B',
    });
    await login(page, tenantA);

    // (N) — read denial: the page itself fails closed with the same
    // non-leaking "Map not found" copy used for a genuinely nonexistent map.
    await page.goto(`/admin/maps/${tenantB.mapId}`);
    await expect(page.getByRole('heading', { name: 'Map not found', exact: true })).toBeVisible();

    const categoriesReadResult = await fetchJson<{ code?: string }>(page, `/api/maps/${tenantB.mapId}/categories`);
    expect(categoriesReadResult.status).toBe(404);
    expect(categoriesReadResult.body.code).toBe('map/not-found');

    // (O) — mutation denial: settings PATCH and category POST both fail
    // closed the same way, never partially succeeding.
    const settingsPatchResult = await fetchJson<{ code?: string }>(page, `/api/maps/${tenantB.mapId}/settings`, {
      method: 'PATCH',
      body: { name: 'Hijacked', mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' }, area: { type: 'UNBOUNDED' } },
    });
    expect(settingsPatchResult.status).toBe(404);
    expect(settingsPatchResult.body.code).toBe('map/not-found');

    const categoryCreateResult = await fetchJson<{ code?: string }>(page, `/api/maps/${tenantB.mapId}/categories`, {
      method: 'POST',
      body: { name: 'Hijacked Category', icon: 'OTHER' },
    });
    expect(categoryCreateResult.status).toBe(404);
    expect(categoryCreateResult.body.code).toBe('map/not-found');

    const firestore = await getE2eFirestore();
    const tenantBSnap = await firestore.doc(`maps/${tenantB.mapId}`).get();
    expect(tenantBSnap.data()?.name).toBe(tenantB.mapName);
    const tenantBCategories = await firestore.collection(`maps/${tenantB.mapId}/categories`).get();
    expect(tenantBCategories.empty).toBe(true);
  });

  test('a well-formed but nonexistent mapId fails closed the same way as a cross-tenant mapId (P)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-nonexistent@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nonexistent Co',
      displayName: 'Nora Nonexistent',
    });
    await login(page, tenant);

    const nonexistentMapId = 'map_does_not_exist_000000000';

    await page.goto(`/admin/maps/${nonexistentMapId}`);
    await expect(page.getByRole('heading', { name: 'Map not found', exact: true })).toBeVisible();

    const result = await fetchJson<{ code?: string }>(page, `/api/maps/${nonexistentMapId}/categories`);
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('map/not-found');
  });

  test('a signed-out caller cannot create or mutate maps (Q)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-signedout@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'SignedOut Co',
      displayName: 'Sid SignedOut',
    });
    await login(page, tenant);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    const createResult = await fetchJson<{ code?: string }>(page, '/api/maps', {
      method: 'POST',
      body: { name: 'Should Not Exist' },
    });
    expect(createResult.status).toBe(401);

    const settingsResult = await fetchJson(page, `/api/maps/${tenant.mapId}/settings`, {
      method: 'PATCH',
      body: { name: 'Should Not Change', mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' }, area: { type: 'UNBOUNDED' } },
    });
    expect(settingsResult.status).toBe(401);

    const firestore = await getE2eFirestore();
    const mapsSnap = await firestore.collection('maps').where('customerId', '==', tenant.customerId).get();
    expect(mapsSnap.size).toBe(1); // still exactly the one provisioned map — nothing created or renamed
  });

  test('a freshly provisioned tenant owns exactly one map (R) — complements the real UI registration flow in registration.spec.ts', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-initial-map@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'InitialMap Co',
      displayName: 'Ian Initial',
    });
    await login(page, tenant);

    const result = await fetchJson<{ maps: Array<{ mapId: string; name: string }> }>(page, '/api/maps');
    expect(result.status).toBe(200);
    expect(result.body.maps).toHaveLength(1);
    expect(result.body.maps[0]!.mapId).toBe(tenant.mapId);
    expect(result.body.maps[0]!.name).toBe(tenant.mapName);
  });

  test('a tenant with only their original single map still has a fully functional workspace (S)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-single-map-workflow@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'SingleMap Co',
      displayName: 'Sela Single',
    });
    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}`);
    // Scoped to the sidebar's own `<nav aria-label="Admin">` — the map
    // overview page ALSO renders its own "Manage this map" links with some
    // of the same text (e.g. "Map Settings", "Categories"), so an unscoped
    // `page.getByRole('link', ...)` would match two elements for those (see
    // e2e/admin-shell.spec.ts's identical `sidebar()` helper/reasoning).
    const sidebar = page.getByRole('navigation', { name: 'Admin' });
    await expect(sidebar.getByRole('link', { name: 'Map Settings', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Categories', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'POIs / Spots', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Menu Builder', exact: true })).toBeVisible();

    await createCategory(page, tenant.mapId, 'Sightseeing', 'SIGHTSEEING');
    await expect(row(page, 'Sightseeing')).toBeVisible();

    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await expect(page.getByLabel('Map name')).toHaveValue(tenant.mapName);
  });

  test('old pre-1B.6 URLs redirect to the tenant’s deterministically-resolved owned map (T)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b6-legacy-redirect@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'LegacyRedirect Co',
      displayName: 'Leo Legacy',
    });
    await login(page, tenant);

    await page.goto('/admin/map');
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/settings$`));

    await page.goto('/admin/categories');
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/categories$`));

    await page.goto('/admin/pois');
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/pois$`));

    await page.goto('/admin/menu');
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/menu$`));
  });
});

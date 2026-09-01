import { expect, test, type Page } from '@playwright/test';
import { E2E_BASE_URL, E2E_TOURIST_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionAdditionalMap, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.10 "Public Menu + POI Experience" E2E suite — §20.
 *
 * A focused, separate spec file rather than extending
 * `public-tourist-map.spec.ts` (already 10/10 and covering the 1B.9
 * foundation) — same real cross-app pattern (admin-web on 3100, tourist-web
 * on 3101, real Auth + Firestore + Functions emulators, no mocked publish
 * API — see that file's own header comment for the full reasoning, which
 * applies identically here).
 *
 * This project's tourist-web E2E environment deliberately never has a real
 * Google Maps browser key (`E2E_TOURIST_APP_ENV.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
 * is `''` — see `apps/admin-web/e2e/constants.ts`'s own doc comment, and
 * `apps/tourist-web/components/public-map/tourist-map.tsx`'s "E2E repair
 * round" doc comment), so no test here ever asserts a real `google.maps.Marker`
 * — every scenario instead proves POI/category/menu behavior through the
 * component's own deterministic, dev-mode-only diagnostics block
 * (`tourist-map-diag-poi-count`/`-poi-names`/`-selected-category`/
 * `-selected-poi`/`-user-location`) and through the fully DOM-driven
 * search/menu/detail-card UI, none of which depends on a live SDK load
 * (§20 scenario 1's own explicit instruction).
 *
 * "Never-published/nonexistent map → identical 404" (§20 scenario 20)
 * already has full, passing coverage in `public-tourist-map.spec.ts`
 * (tests 2/3) — POIs/menu items are irrelevant to that boundary, so it is
 * deliberately not duplicated here.
 *
 * Helper functions below mirror the established, already-proven UI-driven
 * patterns from `e2e/categories.spec.ts`/`e2e/pois.spec.ts`/
 * `e2e/menu-builder.spec.ts` (each of those three already mirrors the same
 * `login`/`createCategory` helper from one another) — copied locally rather
 * than imported cross-spec-file, matching this codebase's own established
 * convention for Playwright spec files.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Mirrors e2e/public-tourist-map.spec.ts's identical helper — see that file's own doc comment for why this must be `page.request` with an absolute admin URL and an explicit `Origin` header, never an in-page relative `fetch`. */
async function publishViaApi(page: Page, mapId: string): Promise<{ status: number; body: { publicationId?: string; version?: number } }> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/publish`, {
    headers: { Origin: E2E_BASE_URL },
  });
  return { status: response.status(), body: await response.json() };
}

function touristMapUrl(mapId: string): string {
  return `${E2E_TOURIST_BASE_URL}/maps/${mapId}`;
}

/** Mirrors e2e/categories.spec.ts's/e2e/pois.spec.ts's/e2e/menu-builder.spec.ts's identical helper. */
async function createCategory(page: Page, mapId: string, name: string, icon: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/categories`);
  await page.getByRole('button', { name: '+ New category', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create Category' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Icon', { exact: true }).selectOption(icon);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Mirrors e2e/menu-builder.spec.ts's identical helper. */
async function disableCategory(page: Page, mapId: string, name: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/categories`);
  await page.locator('tbody tr', { hasText: name }).getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.locator('tbody tr', { hasText: name }).getByText('Disabled')).toBeVisible();
}

interface CreatePoiOptions {
  readonly name: string;
  readonly categoryIndex?: number;
  readonly address?: string;
  readonly description?: string;
  readonly latitude: number | string;
  readonly longitude: number | string;
  readonly status?: 'ENABLED' | 'DISABLED';
}

/** Mirrors e2e/pois.spec.ts's identical helper (createPoi/openCreatePoiDrawer/fillPoiForm merged into one call for this file's own leaner needs). */
async function createPoi(page: Page, mapId: string, options: CreatePoiOptions): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/pois`);
  await page.getByRole('button', { name: '+ New POI', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New POI' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Mirrors e2e/menu-builder.spec.ts's identical helper. */
async function openAddMenuItemDrawer(page: Page, mapId: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/menu`);
  await page.getByRole('button', { name: '+ Add menu item', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add Menu Item' })).toBeVisible();
}

interface AddCategoryMenuItemOptions {
  readonly categoryIndex?: number;
  readonly label?: string;
  readonly status?: 'ENABLED' | 'DISABLED';
}

/** Mirrors e2e/menu-builder.spec.ts's identical helper. */
async function addCategoryMenuItem(page: Page, mapId: string, options: AddCategoryMenuItemOptions = {}): Promise<void> {
  await openAddMenuItemDrawer(page, mapId);
  await page.getByLabel('Category', { exact: true }).selectOption({ index: options.categoryIndex ?? 0 });
  if (options.label !== undefined) {
    await page.getByLabel('Public label', { exact: true }).fill(options.label);
  }
  if (options.status === 'DISABLED') {
    await page.getByRole('button', { name: 'Disabled', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

interface AddFeatureMenuItemOptions {
  readonly featureLabel?: string;
  readonly label?: string;
  readonly status?: 'ENABLED' | 'DISABLED';
}

/** Mirrors e2e/menu-builder.spec.ts's identical helper. */
async function addFeatureMenuItem(page: Page, mapId: string, options: AddFeatureMenuItemOptions = {}): Promise<void> {
  await openAddMenuItemDrawer(page, mapId);
  await page.getByRole('button', { name: 'Feature', exact: true }).click();
  if (options.featureLabel) {
    await page.getByLabel('Feature', { exact: true }).selectOption({ label: options.featureLabel });
  }
  if (options.label !== undefined) {
    await page.getByLabel('Public label', { exact: true }).fill(options.label);
  }
  if (options.status === 'DISABLED') {
    await page.getByRole('button', { name: 'Disabled', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('1B.10 public menu + POI experience', () => {
  // E2E failure investigation (post-checkpoint-1B.10) — `next dev` compiles
  // a route's module graph lazily, on its first request, not at server
  // startup; `playwright.config.ts`'s `webServer` readiness probe only hits
  // tourist-web's root `/`, which never touches `/maps/[mapId]` at all. When
  // this file runs on its own (this checkpoint's own targeted-run command),
  // this file's first test is therefore the very first request
  // `/maps/[mapId]` has ever received in the whole dev-server process's
  // life — and 1B.10 substantially grew that route's module graph (marker
  // layer, marker style adapter, camera utils, My Location, search, detail
  // card, bottom menu), which measurably lengthened its cold-compile time.
  // Stacked behind the first test's own admin-web setup (2 categories + 3
  // POIs + a category disable, each via a real UI dialog, which alone was
  // already consuming nearly the entire fixed 30s test timeout), the
  // now-cold compile pushed that one test's final `page.goto` over the
  // budget.
  //
  // A plain HTTP request — not a browser `page.goto` — is enough to make
  // `next dev` compile the route, and has no `waitUntil: 'load'` lifecycle
  // to hang on, so it cannot reproduce the very hang this hook exists to
  // avoid. The id is deliberately nonexistent (no tenant exists yet at
  // `beforeAll` time) and irrelevant: Next.js compiles a dynamic route's
  // module graph once per ROUTE PATTERN, not per resolved param, so this
  // warms every real `/maps/{mapId}` navigation below for free. Runs once
  // for the whole file, in `beforeAll`'s own independent timing budget —
  // outside, and unrelated to, any individual test's 30s timeout, and not a
  // config timeout change of any kind.
  test.beforeAll(async ({ request }) => {
    await request.get(`${E2E_TOURIST_BASE_URL}/maps/e2e-warmup-nonexistent-map-id`).catch(() => undefined);
  });

  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('published POIs appear publicly; a disabled POI and a POI whose category is disabled never do (1, 2, 3)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-visibility@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Beppu Onsen Co',
      displayName: 'Bebe Beppu',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createCategory(page, tenant.mapId, 'Old Tours', 'SIGHTSEEING');
    await createPoi(page, tenant.mapId, { name: 'Sushi Place', categoryIndex: 0, latitude: 35.0, longitude: 135.0 });
    await createPoi(page, tenant.mapId, { name: 'Closed Diner', categoryIndex: 0, latitude: 35.01, longitude: 135.01, status: 'DISABLED' });
    await createPoi(page, tenant.mapId, { name: 'Ghost Tour', categoryIndex: 1, latitude: 35.02, longitude: 135.02 });
    await disableCategory(page, tenant.mapId, 'Old Tours');

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('1');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Sushi Place');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Closed Diner');
    expect(bodyText).not.toContain('Ghost Tour');
  });

  test('the category filter narrows visible POIs, indicates active selection, and "All" restores them (4, 5, 6)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-filter@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kanazawa Craft Co',
      displayName: 'Kai Kanazawa',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createCategory(page, tenant.mapId, 'Shopping', 'SHOPPING');
    await createPoi(page, tenant.mapId, { name: 'Sushi Place', categoryIndex: 0, latitude: 35.0, longitude: 135.0 });
    await createPoi(page, tenant.mapId, { name: 'Souvenir Shop', categoryIndex: 1, latitude: 35.01, longitude: 135.01 });
    // "Not-already-linked" eligible-option filtering (see addCategoryMenuItem's
    // own doc comment) means index 0 is always the next unlinked category —
    // Restaurants first, then Shopping.
    await addCategoryMenuItem(page, tenant.mapId, { categoryIndex: 0, label: 'Food' });
    await addCategoryMenuItem(page, tenant.mapId, { categoryIndex: 0, label: 'Shops' });

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('2');
    await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Food' }).click();
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('1');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Sushi Place');
    await expect(page.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'All' }).click();
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('2');
    await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the public menu renders in published order, and a disabled menu item never appears (7, 8)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-menuorder@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Takayama Old Town Co',
      displayName: 'Taka Takayama',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    // Inserted in the exact order this test expects to see publicly —
    // reordering mechanics themselves are already covered by
    // e2e/menu-builder.spec.ts's own "reordering persists" test, not
    // re-proven here.
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' });
    await addCategoryMenuItem(page, tenant.mapId, { categoryIndex: 0, label: 'Food' });
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'My Location', label: 'Locate Me', status: 'DISABLED' });

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    const menuButtons = page.locator('[data-testid="public-bottom-menu"] button');
    await expect(menuButtons.nth(0)).toHaveText('All');
    await expect(menuButtons.nth(1)).toContainText('Search');
    await expect(menuButtons.nth(2)).toContainText('Food');
    await expect(menuButtons).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Locate Me' })).toHaveCount(0);
  });

  test('search opens, finds a published POI by name, has a safe no-results state, and Escape closes it (9, 10, 11)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-search@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Matsumoto Castle Co',
      displayName: 'Matsu Matsumoto',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Sushi Place', categoryIndex: 0, latitude: 35.0, longitude: 135.0 });
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' });

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await page.getByTestId('public-menu-feature-search').click();
    await expect(page.getByTestId('public-search-overlay')).toBeVisible();

    await page.getByTestId('public-search-input').fill('sushi');
    await expect(page.getByRole('button', { name: /Sushi Place/ })).toBeVisible();

    await page.getByTestId('public-search-input').fill('zzz-no-such-place');
    await expect(page.getByTestId('public-search-no-results')).toContainText('No places found.');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('public-search-overlay')).toHaveCount(0);
  });

  test('selecting a search result opens the POI detail card with only public fields, never private identifiers (12, 13, 14)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-detail@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Ginza District Co',
      displayName: 'Gin Ginza',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, {
      name: 'Sushi Place',
      categoryIndex: 0,
      latitude: 35.0,
      longitude: 135.0,
      description: 'Fresh fish daily.',
      address: '1-2-3 Ginza',
    });
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' });

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('sushi');
    await page.getByRole('button', { name: /Sushi Place/ }).click();

    await expect(page.getByTestId('poi-detail-card')).toBeVisible();
    await expect(page.getByTestId('poi-detail-name')).toHaveText('Sushi Place');
    await expect(page.getByTestId('poi-detail-category')).toContainText('Restaurants');
    await expect(page.getByTestId('poi-detail-description')).toContainText('Fresh fish daily.');
    await expect(page.getByTestId('poi-detail-address')).toContainText('1-2-3 Ginza');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(tenant.customerId);
    expect(bodyText).not.toContain(tenant.mapId);
    expect(bodyText).not.toContain(tenant.uid);

    await page.getByTestId('poi-detail-close').click();
    await expect(page.getByTestId('poi-detail-card')).toHaveCount(0);
  });

  test('My Location renders only when published, and reports a graceful outcome on success or denial (15, 16, 17)', async ({ browser }) => {
    const withoutFeature = await provisionTestTenant({
      email: 'checkpoint-1b10-nolocation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sapporo Snow Co',
      displayName: 'Sap Sapporo',
    });
    const pageA = await (await browser.newContext()).newPage();
    await login(pageA, withoutFeature);
    await addFeatureMenuItem(pageA, withoutFeature.mapId, { featureLabel: 'Search', label: 'Search' });
    const publishedA = await publishViaApi(pageA, withoutFeature.mapId);
    expect(publishedA.status).toBe(201);
    await pageA.goto(touristMapUrl(withoutFeature.mapId));
    await expect(pageA.getByTestId('public-menu-feature-my-location')).toHaveCount(0);

    const withFeature = await provisionTestTenant({
      email: 'checkpoint-1b10-location@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Otaru Canal Co',
      displayName: 'Ota Otaru',
    });
    const successContext = await browser.newContext();
    await successContext.grantPermissions(['geolocation'], { origin: E2E_TOURIST_BASE_URL });
    await successContext.setGeolocation({ latitude: 43.06, longitude: 141.35 });
    const successPage = await successContext.newPage();
    await login(successPage, withFeature);
    await addFeatureMenuItem(successPage, withFeature.mapId, { featureLabel: 'My Location', label: 'Locate Me' });
    const publishedB = await publishViaApi(successPage, withFeature.mapId);
    expect(publishedB.status).toBe(201);

    await successPage.goto(touristMapUrl(withFeature.mapId));
    await successPage.getByTestId('public-menu-feature-my-location').click();
    await expect(successPage.getByTestId('my-location-status')).toContainText('Showing your current location.');
    await expect(successPage.getByTestId('tourist-map-diag-user-location')).toHaveText('set');
    // Never the raw coordinates, in the always-visible status text (§10).
    await expect(successPage.getByTestId('my-location-status')).not.toContainText('43.06');

    // A context that never grants the permission — Chromium denies
    // automatically with no way to answer a permission prompt headlessly.
    const deniedContext = await browser.newContext();
    const deniedPage = await deniedContext.newPage();
    await deniedPage.goto(touristMapUrl(withFeature.mapId));
    await deniedPage.getByTestId('public-menu-feature-my-location').click();
    await expect(deniedPage.getByTestId('my-location-message')).toContainText(
      /Location access was denied\.|We couldn't get your location right now\./,
    );
    // The app stays fully usable — no crash, canvas region still present.
    await expect(deniedPage.getByTestId('tourist-map')).toBeVisible();
  });

  test('draft/publish isolation extends to POI content: a new draft POI is invisible until actually published (18)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kyoto Ramen Co',
      displayName: 'Kyo Kyoto',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Kyoto Ramen', categoryIndex: 0, latitude: 35.0, longitude: 135.0 });

    const v1 = await publishViaApi(page, tenant.mapId);
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Kyoto Ramen');

    // A brand-new draft POI, added but never published.
    await createPoi(page, tenant.mapId, { name: 'Kyoto Sushi', categoryIndex: 0, latitude: 35.01, longitude: 135.01 });
    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Kyoto Ramen');
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('1');

    const v2 = await publishViaApi(page, tenant.mapId);
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Kyoto Ramen | Kyoto Sushi');
  });

  test('two published maps under the same tenant expose independent POIs (19)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-multimap@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Hiroshima Peace Co',
      displayName: 'Hiro Hiroshima',
    });
    const mapB = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Hiroshima Peace Second Map' });

    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'A Diner', categoryIndex: 0, latitude: 34.39, longitude: 132.45 });
    const publishA = await publishViaApi(page, tenant.mapId);
    expect(publishA.status).toBe(201);

    await createCategory(page, mapB.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, mapB.mapId, { name: 'B Diner', categoryIndex: 0, latitude: 34.4, longitude: 132.46 });
    const publishB = await publishViaApi(page, mapB.mapId);
    expect(publishB.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('A Diner');

    await page.goto(touristMapUrl(mapB.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('B Diner');
  });

  test('an anonymous visitor with no admin cookie can filter and search published content (21)', async ({ browser }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-anonymous@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Yokohama Bay Co',
      displayName: 'Yoko Yokohama',
    });
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, tenant);
    await createCategory(adminPage, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(adminPage, tenant.mapId, { name: 'Sushi Place', categoryIndex: 0, latitude: 35.0, longitude: 135.0 });
    await addCategoryMenuItem(adminPage, tenant.mapId, { categoryIndex: 0, label: 'Food' });
    await addFeatureMenuItem(adminPage, tenant.mapId, { featureLabel: 'Search', label: 'Search' });
    const published = await publishViaApi(adminPage, tenant.mapId);
    expect(published.status).toBe(201);
    await adminContext.close();

    const touristContext = await browser.newContext();
    const touristPage = await touristContext.newPage();
    const cookiesBefore = await touristContext.cookies();
    expect(cookiesBefore).toHaveLength(0);

    await touristPage.goto(touristMapUrl(tenant.mapId));
    await touristPage.getByRole('button', { name: 'Food' }).click();
    await expect(touristPage.getByTestId('tourist-map-diag-poi-count')).toHaveText('1');

    await touristPage.getByTestId('public-menu-feature-search').click();
    await touristPage.getByTestId('public-search-input').fill('sushi');
    await expect(touristPage.getByRole('button', { name: /Sushi Place/ })).toBeVisible();

    const cookiesAfter = await touristContext.cookies();
    expect(cookiesAfter).toHaveLength(0);
    await touristContext.close();
  });

  test('no Google Maps network request occurs while interacting, in this hermetic no-key E2E environment (22)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b10-nonetwork@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Naha Shuri Co',
      displayName: 'Naha Naha',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await createPoi(page, tenant.mapId, { name: 'Sushi Place', categoryIndex: 0, latitude: 35.0, longitude: 135.0 });
    await addCategoryMenuItem(page, tenant.mapId, { categoryIndex: 0, label: 'Food' });
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' });
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'My Location', label: 'Locate Me' });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    const mapsRequests: string[] = [];
    page.on('request', (request) => {
      if (/maps\.googleapis\.com|maps\.gstatic\.com/.test(request.url())) {
        mapsRequests.push(request.url());
      }
    });

    await page.goto(touristMapUrl(tenant.mapId));
    await page.getByRole('button', { name: 'Food' }).click();
    await page.getByRole('button', { name: 'All' }).click();
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('sushi');
    await page.keyboard.press('Escape');
    await page.getByTestId('public-menu-feature-my-location').click();

    expect(mapsRequests).toEqual([]);
  });
});

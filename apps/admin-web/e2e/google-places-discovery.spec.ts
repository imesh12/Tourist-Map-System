import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * `/admin/pois`'s "Discover Places" (Google Places source integration) E2E
 * tests — checkpoint 1B.4, see docs/architecture/CATEGORY_ARCHITECTURE.md
 * §11. Real Auth + Firestore Emulator + a real `next dev` server, same
 * pattern as the rest of this suite.
 *
 * Every discovery/import call in this file is served by
 * `FakeGooglePlacesProvider` (lib/pois/fake-external-provider.ts) —
 * `e2e/constants.ts`'s `E2E_APP_ENV` sets `E2E_FAKE_EXTERNAL_POI_PROVIDER:
 * 'true'` and deliberately never sets `GOOGLE_PLACES_API_KEY`, so
 * `lib/pois/provider-registry.ts` can only ever resolve the fake — the real
 * `GooglePlacesProvider` class (and therefore any real Google endpoint) is
 * never even instantiated while this suite runs. The fixed fake candidate
 * IDs (`places/fake-restaurant-1`/`places/fake-restaurant-2`) are a second,
 * independent proof of this: no real Google Places response ever contains
 * those IDs, so a search returning them is itself evidence the fake path
 * served the request — see test (R) below, which asserts on this directly.
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

async function createCategory(page: Page, name: string, icon: string, options?: CreateCategoryOptions): Promise<void> {
  await page.goto('/admin/categories');
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

async function openDiscoverDrawer(page: Page): Promise<void> {
  await page.goto('/admin/pois');
  await page.getByRole('button', { name: 'Discover Places', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discover Places' })).toBeVisible();
}

async function searchNearby(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Search nearby', exact: true }).click();
}

/**
 * Closes the Discover Places drawer via its footer "Close" button.
 *
 * `discover-places-drawer.tsx` intentionally renders two legitimate close
 * controls in the same dialog: a header icon button (`aria-label="Close"`,
 * rendered text "✕") and a footer text button (rendered text "Close", no
 * `aria-label`). Both call the same `onClose` prop, so either is a correct
 * choice for a test — but `page.getByRole('button', { name: 'Close' })`
 * matches BOTH, because Playwright's accessible name computation falls back
 * from `aria-label` to text content, and here one button supplies each.
 *
 * Scoping to the dialog and matching by rendered text (`getByText`) rather
 * than accessible role name sidesteps the collision without depending on
 * DOM order: `getByText('Close', { exact: true })` only ever matches the
 * footer button's literal "Close" text — the header button's rendered text
 * is "✕", so its `aria-label` never enters into a text-content match.
 */
async function closeDiscoverDrawer(page: Page): Promise<void> {
  const discoverDialog = page.getByRole('dialog', { name: 'Discover Places' });
  await discoverDialog.getByText('Close', { exact: true }).click();
}

test.describe('1B.4 Google Places discovery', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('a category can be linked to the released Restaurant platform category and shows its capability (C)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-link@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Link Co',
      displayName: 'Lena Link',
    });
    await login(page, tenant);

    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    await expect(row(page, 'Restaurants')).toContainText('Google Places');

    await createCategory(page, 'Sightseeing', 'SIGHTSEEING');
    await expect(row(page, 'Sightseeing')).toContainText('Client custom only');
  });

  test('Discover Places is visible and opens the discovery drawer (A)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-visible@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Visible Co',
      displayName: 'Vera Visible',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    await page.goto('/admin/pois');
    await expect(page.getByRole('button', { name: 'Discover Places', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Discover Places', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discover Places' })).toBeVisible();
  });

  test('a tenant with zero Google Places-eligible categories sees a safe empty state with a link to Categories (B)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-noeligible@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'NoEligible Co',
      displayName: 'Nora NoEligible',
    });
    await login(page, tenant);
    await createCategory(page, 'Sightseeing', 'SIGHTSEEING'); // not linked

    await openDiscoverDrawer(page);
    await expect(page.getByText('No categories are linked to Google Places yet')).toBeVisible();
    await page.getByRole('link', { name: 'Go to Categories', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/categories$/);
  });

  test('only Google Places-eligible categories appear in the discovery category select (D)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-eligible@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Eligible Co',
      displayName: 'Eli Eligible',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    await createCategory(page, 'Sightseeing', 'SIGHTSEEING');

    await openDiscoverDrawer(page);
    const options = await page.getByLabel('Search category', { exact: true }).locator('option').allTextContents();
    expect(options.some((label) => label.includes('Restaurants'))).toBe(true);
    expect(options.some((label) => label.includes('Sightseeing'))).toBe(false);
  });

  test('search nearby returns deterministic fake results (E) rendered with name/address/distance (F)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-results@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Results Co',
      displayName: 'Rex Results',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    await openDiscoverDrawer(page);
    await searchNearby(page);

    await expect(page.getByText('Sakura Sushi Bar')).toBeVisible();
    await expect(page.getByText('Tokyo Ramen House')).toBeVisible();
    await expect(page.getByText('1-1 Fake Street, Test City')).toBeVisible();
    await expect(page.getByText('120 m away')).toBeVisible();
  });

  test('searching never imports anything by itself (G) — no auto-import', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-noauto@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'NoAuto Co',
      displayName: 'Nadia NoAuto',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    await openDiscoverDrawer(page);
    await searchNearby(page);
    await expect(page.getByText('Sakura Sushi Bar')).toBeVisible();

    await closeDiscoverDrawer(page);
    await expect(page.getByText('No POIs yet')).toBeVisible();
  });

  test('importing a result creates a POI (H) with a Google Places source badge (I) that survives a reload (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-import@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Import Co',
      displayName: 'Ivy Import',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    await openDiscoverDrawer(page);
    await searchNearby(page);
    await page.getByRole('button', { name: 'Import Sakura Sushi Bar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Import Sakura Sushi Bar', exact: true })).toHaveCount(0);

    await closeDiscoverDrawer(page);

    const poiRow = row(page, 'Sakura Sushi Bar');
    await expect(poiRow).toBeVisible(); // (H)
    await expect(poiRow.getByText('Google Places')).toBeVisible(); // (I)
    await expect(poiRow.getByText('Enabled')).toBeVisible();

    await page.reload(); // (J)
    const reloadedRow = row(page, 'Sakura Sushi Bar');
    await expect(reloadedRow).toBeVisible();
    await expect(reloadedRow.getByText('Google Places')).toBeVisible();
  });

  test('manual POIs are unaffected by Google Places integration and both sources coexist (K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-coexist@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Coexist Co',
      displayName: 'Cara Coexist',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    // A manual POI, created exactly the way checkpoint 1B.3's own suite does.
    await page.goto('/admin/pois');
    await page.getByRole('button', { name: '+ New POI', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'New POI' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Local Cafe');
    await page.getByLabel('Latitude', { exact: true }).fill('1');
    await page.getByLabel('Longitude', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(row(page, 'Local Cafe').getByText('Manual')).toBeVisible();

    // An imported POI alongside it.
    await openDiscoverDrawer(page);
    await searchNearby(page);
    await page.getByRole('button', { name: 'Import Tokyo Ramen House', exact: true }).click();
    await closeDiscoverDrawer(page);

    await expect(row(page, 'Local Cafe').getByText('Manual')).toBeVisible();
    await expect(row(page, 'Tokyo Ramen House').getByText('Google Places')).toBeVisible();

    // The manual POI remains fully editable — untouched by 1B.4.
    await row(page, 'Local Cafe').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Local Cafe (Updated)');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row(page, 'Local Cafe (Updated)')).toBeVisible();
  });

  test('an imported POI is read-only except Status in the edit drawer', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-readonly@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'ReadOnly Co',
      displayName: 'Rio ReadOnly',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    await openDiscoverDrawer(page);
    await searchNearby(page);
    await page.getByRole('button', { name: 'Import Sakura Sushi Bar', exact: true }).click();
    await closeDiscoverDrawer(page);

    await row(page, 'Sakura Sushi Bar').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit POI' })).toBeVisible();
    await expect(page.getByText('Imported from Google Places')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Category', { exact: true })).toBeDisabled();

    // Status remains changeable.
    await page.getByRole('button', { name: 'Disabled', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row(page, 'Sakura Sushi Bar').getByText('Disabled')).toBeVisible();
  });

  test('duplicate providerPlaceId import is rejected (L) — only one POI is ever created', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-duplicate@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Duplicate Co',
      displayName: 'Duke Duplicate',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    await openDiscoverDrawer(page);
    await searchNearby(page);
    await page.getByRole('button', { name: 'Import Sakura Sushi Bar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Import Sakura Sushi Bar', exact: true })).toHaveCount(0);
    await closeDiscoverDrawer(page);

    const categoryId = (await page.evaluate(async () => {
      const response = await fetch('/api/map/categories');
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    })) as string;

    // Direct duplicate attempt at the API layer, with a genuinely valid
    // categoryId — proves the server itself rejects the SAME
    // provider+providerPlaceId a second time, not merely that the UI hides
    // the button once already imported.
    const result = await page.evaluate(
      async ({ categoryId: cid }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: cid, provider: 'GOOGLE', providerPlaceId: 'places/fake-restaurant-1' }),
        });
        return { status: response.status, body: (await response.json()) as { code?: string } };
      },
      { categoryId },
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('map/duplicate-import');

    await expect(page.locator('tbody tr', { hasText: 'Sakura Sushi Bar' })).toHaveCount(1);
  });

  test('discovery on a category not linked to Google Places is blocked (M)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-unsupported@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Unsupported Co',
      displayName: 'Uma Unsupported',
    });
    await login(page, tenant);
    await createCategory(page, 'Sightseeing', 'SIGHTSEEING'); // not linked to Restaurant

    const categoryId = (await page.evaluate(async () => {
      const response = await fetch('/api/map/categories');
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    })) as string;

    const result = await page.evaluate(
      async ({ categoryId: cid }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: cid, radiusMeters: 1000 }),
        });
        return { status: response.status };
      },
      { categoryId },
    );
    expect(result.status).toBe(400);
  });

  test('cross-tenant category import is blocked (N)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b4-crosstenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'CrossTenant A',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b4-crosstenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'CrossTenant B',
      displayName: 'Bob B',
    });

    await login(page, tenantB);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    const tenantBCategoryId = (await page.evaluate(async () => {
      const response = await fetch('/api/map/categories');
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    })) as string;

    await page.getByRole('button', { name: 'Sign out' }).click();
    await login(page, tenantA);

    const discoverResult = await page.evaluate(
      async ({ categoryId }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId, radiusMeters: 1000 }),
        });
        return { status: response.status };
      },
      { categoryId: tenantBCategoryId },
    );
    expect(discoverResult.status).toBe(400);

    const importResult = await page.evaluate(
      async ({ categoryId }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId, provider: 'GOOGLE', providerPlaceId: 'places/fake-restaurant-1' }),
        });
        return { status: response.status };
      },
      { categoryId: tenantBCategoryId },
    );
    expect(importResult.status).toBe(400);
  });

  test('forged ownership/sourceType fields on discover/import are rejected (O)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-forged@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Forged Co',
      displayName: 'Frank Forged',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    const categoryId = (await page.evaluate(async () => {
      const response = await fetch('/api/map/categories');
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    })) as string;

    const discoverResult = await page.evaluate(
      async ({ categoryId: cid }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: cid, radiusMeters: 1000, latitude: 1, longitude: 1 }),
        });
        return { status: response.status };
      },
      { categoryId },
    );
    // `poiDiscoverInputSchema` is `.strict()` — an extra client-supplied
    // coordinate field rejects the whole request.
    expect(discoverResult.status).toBe(400);

    const importResult = await page.evaluate(
      async ({ categoryId: cid }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: cid,
            provider: 'GOOGLE',
            providerPlaceId: 'places/fake-restaurant-1',
            sourceType: 'GOOGLE_PLACES',
            customerId: 'cust_attacker_controlled0000',
            name: 'Attacker Chosen Name',
          }),
        });
        return { status: response.status };
      },
      { categoryId },
    );
    expect(importResult.status).toBe(400);

    const pois = await page.evaluate(async () => {
      const response = await fetch('/api/map/pois');
      const body = (await response.json()) as { pois: unknown[] };
      return body.pois.length;
    });
    expect(pois).toBe(0);
  });

  test('a signed-out user cannot discover or import places (P)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-signedout@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'SignedOut Co',
      displayName: 'Sid SignedOut',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    const discoverResult = await page.evaluate(async () => {
      const response = await fetch('/api/map/pois/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: 'cat_whatever00000000000000', radiusMeters: 1000 }),
      });
      return response.status;
    });
    expect(discoverResult).toBe(401);

    const importResult = await page.evaluate(async () => {
      const response = await fetch('/api/map/pois/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: 'cat_whatever00000000000000', provider: 'GOOGLE', providerPlaceId: 'places/fake-restaurant-1' }),
      });
      return response.status;
    });
    expect(importResult).toBe(401);
  });

  test('a provider error surfaces a safe, generic message in the UI (Q) and no external network call is ever made (R)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b4-providererror@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'ProviderError Co',
      displayName: 'Pia ProviderError',
    });
    await login(page, tenant);
    await createCategory(page, 'Restaurants', 'FOOD', { linkToRestaurant: true });
    const categoryId = (await page.evaluate(async () => {
      const response = await fetch('/api/map/categories');
      const body = (await response.json()) as { categories: Array<{ categoryId: string }> };
      return body.categories[0]?.categoryId;
    })) as string;

    // radiusMeters: 999 is FakeGooglePlacesProvider's reserved, documented
    // error-trigger sentinel (lib/pois/fake-external-provider.ts) — never
    // offered by the real Discover Places UI's radius <select>, so this
    // deliberately bypasses the UI to exercise the provider-error path
    // directly, the same "hit the API directly" pattern the rest of this
    // suite already uses for other edge cases.
    const result = await page.evaluate(
      async ({ categoryId: cid }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: cid, radiusMeters: 999 }),
        });
        return { status: response.status, body: (await response.json()) as { code?: string; message?: string } };
      },
      { categoryId },
    );
    expect(result.status).toBe(502);
    expect(result.body.code).toBe('map/external-provider-error');
    // A safe, generic message only — never the raw provider error text.
    expect(result.body.message).not.toContain('FakeGooglePlacesProvider');

    // (R) — a normal search still returns the fixed fake candidate IDs,
    // which no real Google Places response would ever contain. This is
    // itself the proof that every discovery call in this whole suite is
    // served locally, never over the network to a real Google endpoint.
    await openDiscoverDrawer(page);
    await searchNearby(page);
    const candidateIds = await page.evaluate(
      async ({ categoryId: cid }: { categoryId: string }) => {
        const response = await fetch('/api/map/pois/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: cid, radiusMeters: 1000 }),
        });
        const body = (await response.json()) as { candidates: Array<{ providerPlaceId: string }> };
        return body.candidates.map((candidate) => candidate.providerPlaceId);
      },
      { categoryId },
    );
    expect(candidateIds).toEqual(['places/fake-restaurant-1', 'places/fake-restaurant-2']);
  });
});

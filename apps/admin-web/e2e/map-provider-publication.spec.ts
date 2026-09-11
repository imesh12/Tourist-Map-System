import { expect, test, type Page } from '@playwright/test';
import { E2E_BASE_URL, E2E_TOURIST_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function publish(page: Page, mapId: string): Promise<void> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/publish`, {
    headers: { Origin: E2E_BASE_URL },
  });
  expect(response.status()).toBe(201);
}

async function readPublicMap(page: Page, mapId: string): Promise<{ map: { mapProvider: { provider: string } } }> {
  const response = await page.request.get(`${E2E_BASE_URL}/api/public/maps/${mapId}`);
  expect(response.status()).toBe(200);
  return response.json();
}

async function openPublic(page: Page, mapId: string): Promise<void> {
  await page.goto(`${E2E_TOURIST_BASE_URL}/maps/${mapId}`);
  await expect(page.getByTestId('tourist-map-diag-map-provider')).toBeVisible();
}

test.describe('1B.18 map provider publication', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('publishes MAPBOX independently, preserves it through draft edits, then republishes GOOGLE_MAPS', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b18-provider-publication@example.test',
      password: 'correct-horse-battery-staple',
      companyName: 'Map Provider E2E Co',
      displayName: 'Provider Admin',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await expect(page.getByLabel('Provider')).toHaveValue('GOOGLE_MAPS');

    await page.getByLabel('Provider').selectOption('MAPBOX');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Provider')).toHaveValue('MAPBOX');

    await publish(page, tenant.mapId);
    expect((await readPublicMap(page, tenant.mapId)).map.mapProvider.provider).toBe('MAPBOX');
    await openPublic(page, tenant.mapId);
    await expect(page.getByTestId('tourist-map-diag-map-provider')).toHaveText('MAPBOX');
    await expect(page.getByTestId('tourist-mapbox')).toHaveCount(1);
    await expect(page.getByTestId('tourist-map')).toHaveCount(0);

    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Provider').selectOption('GOOGLE_MAPS');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // Draft edits do not mutate the immutable public snapshot.
    expect((await readPublicMap(page, tenant.mapId)).map.mapProvider.provider).toBe('MAPBOX');
    await openPublic(page, tenant.mapId);
    await expect(page.getByTestId('tourist-map-diag-map-provider')).toHaveText('MAPBOX');
    await expect(page.getByTestId('tourist-mapbox')).toHaveCount(1);

    await publish(page, tenant.mapId);
    expect((await readPublicMap(page, tenant.mapId)).map.mapProvider.provider).toBe('GOOGLE_MAPS');
    await openPublic(page, tenant.mapId);
    await expect(page.getByTestId('tourist-map-diag-map-provider')).toHaveText('GOOGLE_MAPS');
    await expect(page.getByTestId('tourist-map')).toHaveCount(1);
    await expect(page.getByTestId('tourist-mapbox')).toHaveCount(0);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.1-D `/admin/maps/{mapId}/settings` map-preview integration
 * tests — real Auth + Firestore Emulator + a real `next dev` server, same
 * pattern as the rest of this suite. This suite deliberately runs with
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` unset (see e2e/constants.ts's
 * `E2E_APP_ENV` — no real Google Maps credential is ever configured for
 * hermetic/CI tests), so every test here exercises
 * `lib/map-preview/map-preview-summary.tsx`'s non-interactive fallback
 * path, never the live `google.maps.Map` SDK path
 * (`lib/map-preview/google-maps-preview.tsx`) — that path requires a real,
 * billed API key and is exercised manually only (see the 1B.1-D/1A.10
 * completion reports). The fallback path is still the right thing to test
 * automatically: it's a pure, prop-driven render of the same form state
 * the live map would receive, so "does the preview reflect the form
 * without saving" (requirement 6) is fully provable without a live map.
 *
 * Checkpoint 1A.10 moved the "Current Center / Current Zoom / Bounds" text
 * out of the fallback (`map-preview-summary`, which now only carries the
 * reason there's no live map) into an always-visible information area
 * (`map-preview-info`, checkpoint 1A.10 §8) rendered below `MapPreview`
 * regardless of which state it's in — these tests target that area's
 * `map-preview-current-center` / `map-preview-current-zoom` /
 * `map-preview-bounds` test ids, updated from the previous
 * `map-preview-center-zoom` (now split into two) / conditionally-rendered
 * `map-preview-bounds`.
 *
 * Checkpoint 1B.6 rewrite: `/admin/map` → `/admin/maps/{mapId}/settings` —
 * see `apps/admin-web/e2e/categories.spec.ts`'s own header comment for the
 * full reasoning.
 */

async function login(page: Page, tenant: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('1B.1-D map preview', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('shows the no-API-key fallback, initialized from real tenant map values', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b1d-initial@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nagano Alpine Co',
      displayName: 'Naoki Nagano',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    const summary = page.getByTestId('map-preview-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
    // Phase 1A provisioning default: UNBOUNDED, no center/zoom set yet.
    await expect(page.getByTestId('map-preview-current-center')).toContainText('Not set');
    await expect(page.getByTestId('map-preview-current-zoom')).toContainText('Not set');
    await expect(page.getByTestId('map-preview-bounds')).toContainText('No bounds (Unbounded area)');
  });

  test('changing center/zoom in the form updates the preview immediately, with no save (requirement 6)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b1d-sync@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sapporo Snow Co',
      displayName: 'Saki Sapporo',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByLabel('Center latitude').fill('43.0621');
    await page.getByLabel('Center longitude').fill('141.3544');
    await page.getByLabel('Default zoom').fill('11');

    await expect(page.getByTestId('map-preview-current-center')).toContainText('43.0621');
    await expect(page.getByTestId('map-preview-current-center')).toContainText('141.3544');
    await expect(page.getByTestId('map-preview-current-zoom')).toContainText('11');

    // Not saved yet — no "Map settings saved." confirmation, no PATCH sent.
    await expect(page.getByText('Map settings saved.')).toHaveCount(0);
  });

  test('switching to BOUNDED and filling bounds visualizes them in the preview (requirement 8)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b1d-bounds@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Fukuoka Ferry Co',
      displayName: 'Fumi Fukuoka',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByRole('button', { name: 'Bounded', exact: true }).click();
    await page.getByLabel('North').fill('33.7');
    await page.getByLabel('South').fill('33.5');
    await page.getByLabel('East').fill('130.5');
    await page.getByLabel('West').fill('130.3');

    await expect(page.getByTestId('map-preview-bounds')).toContainText('N 33.7');
    await expect(page.getByTestId('map-preview-bounds')).toContainText('S 33.5');
    await expect(page.getByTestId('map-preview-bounds')).toContainText('E 130.5');
    await expect(page.getByTestId('map-preview-bounds')).toContainText('W 130.3');

    // Switching back to UNBOUNDED shows the "no bounds" state again.
    await page.getByRole('button', { name: 'Unbounded', exact: true }).click();
    await expect(page.getByTestId('map-preview-bounds')).toContainText('No bounds (Unbounded area)');
  });

  test('selecting MAPBOX falls back to the "not yet implemented" preview, not a crash', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b1d-mapbox@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Okinawa Islands Co',
      displayName: 'Okina Okinawa',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByLabel('Provider').selectOption('MAPBOX');
    await expect(page.getByTestId('map-preview-summary')).toContainText('MAPBOX is not yet implemented');
  });

  test('after Save + reload, the preview initializes from the persisted Firestore values (requirement 11)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b1d-persist@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sendai Sights Co',
      displayName: 'Sen Sendai',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByLabel('Center latitude').fill('38.2682');
    await page.getByLabel('Center longitude').fill('140.8694');
    await page.getByLabel('Default zoom').fill('9');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    await page.reload();

    await expect(page.getByTestId('map-preview-current-center')).toContainText('38.2682');
    await expect(page.getByTestId('map-preview-current-center')).toContainText('140.8694');
    await expect(page.getByTestId('map-preview-current-zoom')).toContainText('9');
  });
});

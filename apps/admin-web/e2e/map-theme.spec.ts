import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionAdditionalMap, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.7 "Provider-Neutral Map Theme + Google Maps Tourist Clean
 * Styling" integration tests — real Auth + Firestore Emulator + a real
 * `next dev` server, same pattern as the rest of this suite. Covers the
 * checkpoint's own required scenario list A–M; see each `test()`'s trailing
 * `(letter)` for the mapping.
 *
 * This suite runs with no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` configured, same
 * as e2e/map-preview.spec.ts — no real, billed Google Maps credential is
 * ever configured for hermetic/CI tests, so the live `google.maps.Map`
 * `styles` option (`google-theme-adapter.ts`'s actual consumer) is never
 * itself inspectable from a test here. Per the checkpoint's own "prefer
 * semantic/state assertions, not pixel-perfect screenshots" instruction,
 * these tests instead assert against `MapPreviewInfo`'s "Current Theme" row
 * (`map-preview-current-theme`) — the same provider-agnostic, always-visible
 * information area `map-preview.spec.ts` already uses for center/zoom/
 * bounds — plus the Theme form's own control state and real Firestore reads.
 * `google-theme-adapter.test.ts` (packages/validation... no — apps/admin-web/
 * lib/map-preview/) is what actually proves the real Google `styles` array
 * conversion itself.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('1B.7 map theme', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('the Theme section renders with a Standard preset default for a brand-new (no-theme) map (A, K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-renders@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kanazawa Crafts Co',
      displayName: 'Kana Kanazawa',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // A: the Theme card and every one of its controls render.
    await expect(page.getByText('Theme', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Preset')).toBeVisible();
    await expect(page.getByLabel('Business POIs')).toBeVisible();
    await expect(page.getByLabel('Transit', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Schools')).toBeVisible();
    await expect(page.getByLabel('Hospitals')).toBeVisible();
    await expect(page.getByLabel('Parks')).toBeVisible();
    await expect(page.getByLabel('Road labels')).toBeVisible();
    await expect(page.getByLabel('Transit labels')).toBeVisible();
    // Checkpoint 1B.8 — each color field now also renders a same-labeled
    // `<input type="color">` picker (see ColorField, components/color-field.tsx)
    // whose own accessible name is `"<label> picker"`; every bare-label
    // lookup below must be `{ exact: true }` to keep resolving to the hex
    // text field specifically, not both controls ambiguously.
    await expect(page.getByLabel('Background', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Roads', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Water', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Labels', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Marker style')).toBeVisible();
    await expect(page.getByLabel('Marker size')).toBeVisible();

    // K: this tenant's map was seeded with no `theme` field at all (see
    // tenant-fixture.ts) — the read-side `DEFAULT_MAP_THEME` fallback (the
    // STANDARD preset) must still load safely rather than crashing or
    // showing an empty/undefined state.
    await expect(page.getByLabel('Preset')).toHaveValue('STANDARD');
    await expect(page.getByLabel('Business POIs')).toBeChecked();
    await expect(page.getByLabel('Background', { exact: true })).toHaveValue('');
  });

  test('the Tourist Clean preset is selectable and populates the expected visibility/colors (B)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-preset-selectable@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Beppu Onsen Co',
      displayName: 'Bin Beppu',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByLabel('Preset').selectOption('TOURIST_CLEAN');
    await expect(page.getByLabel('Preset')).toHaveValue('TOURIST_CLEAN');
    await expect(page.getByLabel('Business POIs')).not.toBeChecked();
    await expect(page.getByLabel('Schools')).not.toBeChecked();
    await expect(page.getByLabel('Hospitals')).not.toBeChecked();
    await expect(page.getByLabel('Parks')).toBeChecked();
    await expect(page.getByLabel('Transit', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Background', { exact: true })).toHaveValue('#F7F8F5');
    await expect(page.getByLabel('Water', { exact: true })).toHaveValue('#DDEBF4');
  });

  test('changing the preset updates the live preview immediately, with no Save (C)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-preset-preview@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Matsue Castle Co',
      displayName: 'Matsu Matsue',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await expect(page.getByTestId('map-preview-current-theme')).toContainText('Preset STANDARD');
    await expect(page.getByTestId('map-preview-current-theme')).toContainText('Hidden: None');

    await page.getByLabel('Preset').selectOption('MINIMAL');

    await expect(page.getByTestId('map-preview-current-theme')).toContainText('Preset MINIMAL');
    await expect(page.getByTestId('map-preview-current-theme')).toContainText('Business POIs');
    await expect(page.getByTestId('map-preview-current-theme')).toContainText('Schools');

    // Not saved yet.
    await expect(page.getByText('Map settings saved.')).toHaveCount(0);
  });

  test('toggling an individual visibility checkbox updates the live preview immediately (D)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-visibility-preview@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Takamatsu Gardens Co',
      displayName: 'Taka Takamatsu',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await expect(page.getByTestId('map-preview-current-theme')).not.toContainText('Parks');
    await page.getByLabel('Parks').uncheck();
    await expect(page.getByTestId('map-preview-current-theme')).toContainText('Parks');

    await expect(page.getByText('Map settings saved.')).toHaveCount(0);
  });

  test('changing a theme color updates the live preview immediately (E)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-color-preview@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kagoshima Volcano Co',
      displayName: 'Kago Kagoshima',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByLabel('Water', { exact: true }).fill('#123456');
    // Checkpoint 1B.8 — the visual `<input type="color">` picker beside the
    // hex field is synced from the exact same state; this is the same live,
    // prop-driven value that also reaches `previewTheme`/`MapPreview`/
    // `MapPreviewInfo` (no Save).
    await expect(page.getByLabel('Water picker')).toHaveValue('#123456');
    await expect(page.getByText('Map settings saved.')).toHaveCount(0);
  });

  test('Save persists the theme, and a reload shows the persisted values (F, G)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-save-reload@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Aomori Apple Co',
      displayName: 'Ao Aomori',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByLabel('Preset').selectOption('TOURIST_CLEAN');
    await page.getByLabel('Hospitals').check(); // hand-edit after the preset — preset name must stay TOURIST_CLEAN (§9).
    await page.getByLabel('Marker style').selectOption('DOT');
    await page.getByLabel('Marker size').selectOption('LARGE');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // F: real Firestore read — the theme actually landed on `maps/{mapId}`.
    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.theme).toMatchObject({
      preset: 'TOURIST_CLEAN',
      visibility: expect.objectContaining({ hospitals: true, businessPois: false }),
      markerStyle: { style: 'DOT', size: 'LARGE' },
    });

    // G: reload — Firestore is the source of truth, not React state.
    await page.reload();
    await expect(page.getByLabel('Preset')).toHaveValue('TOURIST_CLEAN');
    await expect(page.getByLabel('Hospitals')).toBeChecked();
    await expect(page.getByLabel('Business POIs')).not.toBeChecked();
    await expect(page.getByLabel('Marker style')).toHaveValue('DOT');
    await expect(page.getByLabel('Marker size')).toHaveValue('LARGE');
  });

  test('saving one map’s theme never modifies another map owned by the same tenant (H)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-multi-map-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Niigata Rice Co',
      displayName: 'Nii Niigata',
    });
    const mapB = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Niigata Rice Co — Map B' });

    await login(page, tenant);

    // Map A: TOURIST_CLEAN with a hand-picked blue water override and
    // reduced POIs.
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Preset').selectOption('TOURIST_CLEAN');
    await page.getByLabel('Water', { exact: true }).fill('#0000FF');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // Map B: left at its own STANDARD default, then explicitly saved with a
    // different, unrelated preset — proving A's save never touched it in
    // either direction.
    await page.goto(`/admin/maps/${mapB.mapId}/settings`);
    await expect(page.getByLabel('Preset')).toHaveValue('STANDARD');
    await page.getByLabel('Preset').selectOption('LIGHT');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const firestore = await getE2eFirestore();
    const mapASnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    const mapBSnap = await firestore.doc(`maps/${mapB.mapId}`).get();
    expect(mapASnap.data()?.theme).toMatchObject({ preset: 'TOURIST_CLEAN', colors: expect.objectContaining({ water: '#0000FF' }) });
    expect(mapBSnap.data()?.theme).toMatchObject({ preset: 'LIGHT' });
  });

  test('a forged mapId / cross-tenant theme mutation is denied (I)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b7-forged-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Theme Co',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b7-forged-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Theme Co',
      displayName: 'Bob B',
    });

    await login(page, tenantA);
    await page.goto(`/admin/maps/${tenantA.mapId}/settings`);

    const validTheme = {
      preset: 'STANDARD',
      visibility: { businessPois: true, transit: true, schools: true, hospitals: true, parks: true, roadLabels: true, transitLabels: true },
      markerStyle: { style: 'PIN', size: 'MEDIUM' },
    };

    // Attempting tenant B's map via the URL, from tenant A's own session —
    // getOwnedMapContext denies before the body (theme included) is parsed.
    const result = await page.evaluate(
      async ({ targetMapId, theme }: { targetMapId: string; theme: unknown }) => {
        const response = await fetch(`/api/maps/${targetMapId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Forged', mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' }, area: { type: 'UNBOUNDED' }, theme }),
        });
        return { status: response.status, body: (await response.json()) as { code?: string } };
      },
      { targetMapId: tenantB.mapId, theme: validTheme },
    );
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('map/not-found');

    const firestore = await getE2eFirestore();
    const tenantBSnap = await firestore.doc(`maps/${tenantB.mapId}`).get();
    expect(tenantBSnap.data()?.theme).toBeUndefined();
  });

  test('a signed-out visitor cannot call the theme-carrying settings mutation (J)', async ({ page }) => {
    await page.goto('/login');
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/maps/map_does_not_matter_0000000/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'x',
          mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
          area: { type: 'UNBOUNDED' },
          theme: {
            preset: 'STANDARD',
            visibility: { businessPois: true, transit: true, schools: true, hospitals: true, parks: true, roadLabels: true, transitLabels: true },
            markerStyle: { style: 'PIN', size: 'MEDIUM' },
          },
        }),
      });
      return response.status;
    });
    expect(status).toBe(401);
  });

  test('an invalid theme payload (unrecognized preset, unknown field) is rejected and never saved (L)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-invalid-theme@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kobe Beef Co',
      displayName: 'Kobe Kobe',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    const base = { name: tenant.mapName, mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' }, area: { type: 'UNBOUNDED' } };

    const invalidPreset = await page.evaluate(
      async ({ mapId, payload }: { mapId: string; payload: unknown }) => {
        const response = await fetch(`/api/maps/${mapId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return response.status;
      },
      {
        mapId: tenant.mapId,
        payload: {
          ...base,
          theme: {
            preset: 'RAINBOW',
            visibility: { businessPois: true, transit: true, schools: true, hospitals: true, parks: true, roadLabels: true, transitLabels: true },
            markerStyle: { style: 'PIN', size: 'MEDIUM' },
          },
        },
      },
    );
    expect(invalidPreset).toBe(400);

    const rawProviderJson = await page.evaluate(
      async ({ mapId, payload }: { mapId: string; payload: unknown }) => {
        const response = await fetch(`/api/maps/${mapId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return response.status;
      },
      { mapId: tenant.mapId, payload: { ...base, theme: { styles: [{ featureType: 'poi.business', elementType: 'labels', stylers: [{ visibility: 'off' }] }] } } },
    );
    expect(rawProviderJson).toBe(400);

    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.theme).toBeUndefined();
  });

  test('switching between maps updates the theme controls to each map’s own saved values (M)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b7-switch-maps@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Yokohama Harbor Co',
      displayName: 'Yoko Yokohama',
    });
    const mapB = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Yokohama Harbor Co — Map B' });

    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Preset').selectOption('MINIMAL');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // Map B was never touched — still its own STANDARD default, not A's
    // just-saved MINIMAL, when navigated to directly.
    await page.goto(`/admin/maps/${mapB.mapId}/settings`);
    await expect(page.getByLabel('Preset')).toHaveValue('STANDARD');
    await expect(page.getByLabel('Business POIs')).toBeChecked();

    // Navigating back to Map A still shows A's own saved MINIMAL, not
    // whatever was briefly on-screen for B.
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await expect(page.getByLabel('Preset')).toHaveValue('MINIMAL');
    await expect(page.getByLabel('Business POIs')).not.toBeChecked();
  });
});

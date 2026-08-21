import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.1 `/admin/map` integration tests — real Auth + Firestore
 * Emulator + a real `next dev` server, same pattern as the rest of this
 * suite (see playwright.config.ts). Covers the required scenarios A–K from
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md's 1B.1 checkpoint: viewing real
 * current settings, editing name/center/zoom/area-type/bounds/branding,
 * persistence across reload, invalid-bounds rejection, and cross-tenant
 * write isolation. Scenario L ("existing /admin/account/auth/registration
 * flows remain green") is proven by this file coexisting in the same
 * `pnpm test:e2e` run as auth.spec.ts/dashboard.spec.ts/protected-routes.spec.ts/
 * registration.spec.ts, not duplicated here.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('1B.1 map settings', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('a CLIENT_ADMIN sees real current settings, edits them, and reload shows the persisted values (A–I)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b1-edit@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kyoto Tours Co',
      displayName: 'Kenji Kyoto',
    });

    await login(page, tenant); // A
    await page.goto('/admin/map'); // B
    await expect(page).toHaveURL(/\/admin\/map$/);

    // C: real current values — Phase 1A provisioning defaults.
    await expect(page.getByLabel('Map name')).toHaveValue(tenant.mapName);
    await expect(page.getByLabel('Provider')).toHaveValue('GOOGLE_MAPS');
    await expect(page.getByLabel('Style')).toHaveValue('ROAD');
    await expect(page.getByRole('button', { name: 'Unbounded', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Bounded', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('Center latitude')).toHaveValue('');

    // D: map name.
    await page.getByLabel('Map name').fill('Kyoto Tours Renamed Map');

    // E: center + zoom.
    await page.getByLabel('Center latitude').fill('35.0116');
    await page.getByLabel('Center longitude').fill('135.7681');
    await page.getByLabel('Default zoom').fill('13');

    // F: UNBOUNDED -> BOUNDED (segmented control, checkpoint 1A.10 §7) reveals bounds fields.
    await expect(page.getByLabel('North')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bounded', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bounded', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('North')).toBeVisible();

    // G: valid bounds.
    await page.getByLabel('North').fill('35.1');
    await page.getByLabel('South').fill('34.9');
    await page.getByLabel('East').fill('135.85');
    await page.getByLabel('West').fill('135.65');

    // H: basic branding.
    await page.getByLabel('Logo URL').fill('https://example.com/kyoto-logo.png');
    await page.getByLabel('Primary color').fill('#112233');
    await page.getByLabel('Secondary color').fill('#445566');

    await page.getByRole('button', { name: 'Save' }).click();
    // Not `getByRole('alert'/'status')` — this app's Next.js dev route
    // announcer also renders with an accessibility-live-region role on every
    // page (see e2e/auth.spec.ts's identical note), so this is scoped to the
    // form's own success text instead.
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // I: reload — Firestore is the source of truth, not React state.
    await page.reload();
    await expect(page.getByLabel('Map name')).toHaveValue('Kyoto Tours Renamed Map');
    await expect(page.getByRole('button', { name: 'Bounded', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Center latitude')).toHaveValue('35.0116');
    await expect(page.getByLabel('Center longitude')).toHaveValue('135.7681');
    await expect(page.getByLabel('Default zoom')).toHaveValue('13');
    await expect(page.getByLabel('North')).toHaveValue('35.1');
    await expect(page.getByLabel('South')).toHaveValue('34.9');
    await expect(page.getByLabel('East')).toHaveValue('135.85');
    await expect(page.getByLabel('West')).toHaveValue('135.65');
    await expect(page.getByLabel('Logo URL')).toHaveValue('https://example.com/kyoto-logo.png');
    await expect(page.getByLabel('Primary color')).toHaveValue('#112233');
    await expect(page.getByLabel('Secondary color')).toHaveValue('#445566');

    // Draft-only: this checkpoint never creates a publishedMaps doc.
    const firestore = await getE2eFirestore();
    const publishedSnap = await firestore.doc(`publishedMaps/${tenant.mapId}`).get();
    expect(publishedSnap.exists).toBe(false);
  });

  test('invalid bounds (north <= south) show a validation error and do not save (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b1-invalid-bounds@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Osaka Maps Co',
      displayName: 'Ossan Osaka',
    });

    await login(page, tenant);
    await page.goto('/admin/map');

    await page.getByRole('button', { name: 'Bounded', exact: true }).click();
    await page.getByLabel('Center latitude').fill('34.6937');
    await page.getByLabel('Center longitude').fill('135.5023');
    await page.getByLabel('Default zoom').fill('12');
    // north <= south — invalid.
    await page.getByLabel('North').fill('34.5');
    await page.getByLabel('South').fill('34.8');
    await page.getByLabel('East').fill('135.6');
    await page.getByLabel('West').fill('135.4');

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('north must be greater than south')).toBeVisible();
    await expect(page.getByText('Map settings saved.')).toHaveCount(0);

    // Never saved: a direct Firestore read still shows the untouched
    // Phase-1A-provisioned UNBOUNDED default, not a half-applied BOUNDED area.
    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.area).toEqual({ type: 'UNBOUNDED' });
  });

  test('a CLIENT_ADMIN saving their own map settings never affects another tenant (K)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b1-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Maps',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b1-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Maps',
      displayName: 'Bob B',
    });

    await login(page, tenantA);
    await page.goto('/admin/map');
    await page.getByLabel('Map name').fill('Tenant A Renamed Map');
    await page.getByRole('button', { name: 'Save' }).click();
    // Not `getByRole('alert'/'status')` — this app's Next.js dev route
    // announcer also renders with an accessibility-live-region role on every
    // page (see e2e/auth.spec.ts's identical note), so this is scoped to the
    // form's own success text instead.
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // A request body that also tries to smuggle an explicit mapId/customerId
    // pointed at tenant B — mapSettingsUpdateSchema's `.strict()` mode
    // rejects this outright as an unrecognized field, and even if it didn't,
    // the route never reads a client-supplied mapId/customerId at all (see
    // app/api/map/settings/route.ts) — the target map always comes from the
    // caller's own verified session.
    const forgedResult = await page.evaluate(async (targetMapId: string) => {
      const response = await fetch('/api/map/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Forged Cross-Tenant Name',
          mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
          area: { type: 'UNBOUNDED' },
          mapId: targetMapId,
        }),
      });
      return { status: response.status, body: await response.json() };
    }, tenantB.mapId);
    expect(forgedResult.status).toBe(400);

    const firestore = await getE2eFirestore();
    const tenantBSnap = await firestore.doc(`maps/${tenantB.mapId}`).get();
    // Tenant B's map is completely untouched by tenant A's session — never
    // renamed to "Tenant A Renamed Map" or "Forged Cross-Tenant Name".
    expect(tenantBSnap.data()?.name).toBe(tenantB.mapName);

    const tenantASnap = await firestore.doc(`maps/${tenantA.mapId}`).get();
    expect(tenantASnap.data()?.name).toBe('Tenant A Renamed Map');
  });

  test('a signed-out visitor cannot call the map settings mutation at all', async ({ page }) => {
    await page.goto('/login');
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/map/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' }, area: { type: 'UNBOUNDED' } }),
      });
      return response.status;
    });
    expect(result).toBe(401);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1A.10 admin-shell integration tests — real Auth + Firestore
 * Emulator + a real `next dev` server, same pattern as the rest of this
 * suite. Covers the specifically-new shell behaviors from the checkpoint's
 * test checklist that no earlier spec exercises: sidebar active-navigation
 * state (I), future/disabled nav items never being real links (K), and the
 * account/logout affordances staying reachable from the shared header on
 * every admin page (J).
 *
 * Checkpoint 1B.6 rewrite: `components/admin-shell/nav-config.ts` changed
 * from a static `ADMIN_NAV_SECTIONS` list to `buildAdminNavSections(activeMapId)`
 * — the Map Settings/Categories/POIs/Menu Builder links (and the "Map
 * Preview" future item) now render ONLY while inside a map's own routes
 * (`/admin/maps/{mapId}/**`), never on the bare `/admin` dashboard. Every
 * test below that used to navigate straight to `/admin/map`,
 * `/admin/categories`, `/admin/pois`, `/admin/menu` now first opens the
 * tenant's provisioned map (`/admin/maps/{tenant.mapId}`) and asserts
 * against the map-scoped URLs (`/admin/maps/{mapId}/settings`, etc.) —
 * see components/admin-shell/nav-config.ts's own doc comment for the full
 * reasoning.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/**
 * Scoped to the sidebar's own `<nav aria-label="Admin">` — every map-scoped
 * page's breadcrumb ALSO renders a "Dashboard" link
 * (components/admin-shell/breadcrumb.tsx), so an unscoped
 * `page.getByRole('link', { name: 'Dashboard' })` would match two elements
 * there. This isolates assertions to the sidebar only.
 */
function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Admin' });
}

test.describe('1A.10 admin shell', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('sidebar active state tracks the current route (I)', async ({ page }) => {
    // Repair Round 2 (checkpoint 1B.6): this test's own whole-test budget,
    // not any single assertion, is what a real run exhausted — the Round 1
    // trace evidence (a fresh run's `error-context.md`/page snapshot) shows
    // the test correctly completing all four navigations, landing exactly
    // on the LAST step's expected state (Menu Builder link `aria-current`,
    // correct URL, correct breadcrumb, correct page heading) before the
    // default 30s `playwright.config.ts` `timeout` cut it off. That is
    // conclusive proof production behavior is correct end-to-end; this test
    // is simply the one place in the suite that deliberately performs FOUR
    // sequential FIRST-hit `next dev` route compiles (Settings, Categories,
    // POIs, Menu Builder) in a single test, so its cumulative cost can
    // legitimately exceed the suite's default per-test budget even though
    // each individual step's own 20s ceiling (below) is never itself
    // exceeded. Scoped to this one test only — not a global
    // `playwright.config.ts` change, and not another blanket per-assertion
    // timeout bump.
    test.setTimeout(90_000);

    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a10-nav@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Chiba Coast Co',
      displayName: 'Chika Chiba',
    });

    await login(page, tenant);

    // On /admin (no active map): only "All maps" renders under the Maps
    // section — Map Settings/Categories/POIs/Menu Builder don't exist here
    // at all yet (checkpoint 1B.6 — see this file's own header comment).
    await expect(sidebar(page).getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Map Settings', exact: true })).toHaveCount(0);

    await sidebar(page).getByRole('link', { name: 'All maps', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/maps$/);

    await page.goto(`/admin/maps/${tenant.mapId}`);

    // Inside the map's own routes, the four workspace links now exist and
    // "Dashboard" is no longer the active item.
    await expect(sidebar(page).getByRole('link', { name: 'Dashboard', exact: true })).not.toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Map Settings', exact: true })).not.toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Categories', exact: true })).not.toHaveAttribute('aria-current', 'page');

    // Repair Round 1 (checkpoint 1B.6): each of these four links is the
    // FIRST navigation to that particular dynamic route in this `next dev`
    // process — Next.js compiles a route on-demand on its first request, and
    // that compile can easily take longer than the default 5s assertion
    // timeout, independent of anything about this app's own routing logic
    // (which `href`/`aria-current` above already prove is correct: every
    // link's `href` points at the right map-scoped URL, and
    // `Sidebar`'s `aria-current={pathname === item.href ? 'page' : undefined}`
    // is a plain, correct string comparison). A generous explicit timeout
    // only on the `toHaveURL` wait (not a blanket suite-wide change) absorbs
    // that one-time first-compile cost without weakening what's asserted.
    const FIRST_COMPILE_NAV_TIMEOUT_MS = 20_000;

    await sidebar(page).getByRole('link', { name: 'Map Settings', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/settings$`), { timeout: FIRST_COMPILE_NAV_TIMEOUT_MS });
    await expect(sidebar(page).getByRole('link', { name: 'Map Settings', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Categories', exact: true })).not.toHaveAttribute('aria-current', 'page');

    await sidebar(page).getByRole('link', { name: 'Categories', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/categories$`), { timeout: FIRST_COMPILE_NAV_TIMEOUT_MS });
    await expect(sidebar(page).getByRole('link', { name: 'Categories', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Map Settings', exact: true })).not.toHaveAttribute('aria-current', 'page');

    await sidebar(page).getByRole('link', { name: 'POIs / Spots', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/pois$`), { timeout: FIRST_COMPILE_NAV_TIMEOUT_MS });
    await expect(sidebar(page).getByRole('link', { name: 'POIs / Spots', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Categories', exact: true })).not.toHaveAttribute('aria-current', 'page');

    await sidebar(page).getByRole('link', { name: 'Menu Builder', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/menu$`), { timeout: FIRST_COMPILE_NAV_TIMEOUT_MS });
    await expect(sidebar(page).getByRole('link', { name: 'Menu Builder', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'POIs / Spots', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('future/disabled navigation items are never real links to a nonexistent route (K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a10-future-nav@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kobe Harbor Co',
      displayName: 'Kobe Ken',
    });

    await login(page, tenant);

    // Organization/Media/Pages/Announcements/Analytics/Users/Settings are
    // always-present future items, checkable from the bare /admin dashboard.
    for (const label of ['Organization', 'Media', 'Pages', 'Announcements', 'Analytics', 'Users', 'Settings']) {
      await expect(sidebar(page).getByText(label, { exact: true })).toBeVisible();
      await expect(sidebar(page).getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
    await expect(page).toHaveURL(/\/admin$/);

    // "Map Preview" only renders inside a map's own routes (checkpoint
    // 1B.6) — checked there instead.
    await page.goto(`/admin/maps/${tenant.mapId}`);
    await expect(sidebar(page).getByText('Map Preview', { exact: true })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Map Preview', exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}$`));
  });

  test('Account and Sign out remain reachable from the header on every admin page (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a10-header@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Yokohama Bay Co',
      displayName: 'Yoko Yokohama',
    });

    await login(page, tenant);

    const paths = [
      '/admin',
      '/admin/maps',
      `/admin/maps/${tenant.mapId}`,
      `/admin/maps/${tenant.mapId}/settings`,
      `/admin/maps/${tenant.mapId}/categories`,
      `/admin/maps/${tenant.mapId}/pois`,
      `/admin/maps/${tenant.mapId}/menu`,
    ];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('banner').getByRole('link', { name: 'Account' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    }

    await page.getByRole('banner').getByRole('link', { name: 'Account' }).click();
    await expect(page).toHaveURL(/\/admin\/account$/);
  });
});

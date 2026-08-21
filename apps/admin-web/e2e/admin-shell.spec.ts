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
 * every admin page (J). Every other item on the checklist (A/B/C/D/E/F/G/H)
 * is already covered by e2e/map-settings.spec.ts, e2e/map-preview.spec.ts,
 * e2e/dashboard.spec.ts, and e2e/protected-routes.spec.ts and is not
 * duplicated here.
 *
 * Checkpoint 1B.3 update: "POIs / Spots" moved from the future/disabled nav
 * list to a real `kind: 'link'` route (`/admin/pois`) — see
 * components/admin-shell/nav-config.ts's doc comment. It is removed from
 * the "future" assertion below (test K) and added alongside Map
 * Settings/Categories in the active-state test (I) and the header
 * reachability test (J), exactly as those two routes are already covered —
 * this file is fixed here because 1B.3's own nav-config.ts change is what
 * makes the old assertion in test K false, not because e2e/pois.spec.ts
 * (which covers the POIs page's own content) is a substitute for it.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/**
 * Scoped to the sidebar's own `<nav aria-label="Admin">` — `/admin/map`'s
 * breadcrumb ALSO renders a "Dashboard" link (components/admin-shell/breadcrumb.tsx),
 * so an unscoped `page.getByRole('link', { name: 'Dashboard' })` would
 * match two elements there. This isolates assertions to the sidebar only.
 */
function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Admin' });
}

test.describe('1A.10 admin shell', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('sidebar active state tracks the current route (I)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a10-nav@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Chiba Coast Co',
      displayName: 'Chika Chiba',
    });

    await login(page, tenant);

    // On /admin: Dashboard is the active item, Map Settings and Categories are not.
    // exact: true throughout — "Map Settings" would otherwise ambiguously
    // substring-match a bare name: 'Settings' query, and non-exact role
    // name matching is substring-based generally.
    await expect(sidebar(page).getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Map Settings', exact: true })).not.toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Categories', exact: true })).not.toHaveAttribute('aria-current', 'page');

    await sidebar(page).getByRole('link', { name: 'Map Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/map$/);
    await expect(sidebar(page).getByRole('link', { name: 'Map Settings', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Dashboard', exact: true })).not.toHaveAttribute('aria-current', 'page');

    await sidebar(page).getByRole('link', { name: 'Categories', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/categories$/);
    await expect(sidebar(page).getByRole('link', { name: 'Categories', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Map Settings', exact: true })).not.toHaveAttribute('aria-current', 'page');

    await sidebar(page).getByRole('link', { name: 'POIs / Spots', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/pois$/);
    await expect(sidebar(page).getByRole('link', { name: 'POIs / Spots', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('link', { name: 'Categories', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('future/disabled navigation items are never real links to a nonexistent route (K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a10-future-nav@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kobe Harbor Co',
      displayName: 'Kobe Ken',
    });

    await login(page, tenant);

    // Visible for product direction, but structurally not navigable —
    // there is no `<a href>`/`<Link>` for any of these, so there is no
    // route for a user to be misled into. exact: true matters here
    // specifically for 'Settings': a non-exact role-name query is
    // substring-based, and the sidebar's real "Map Settings" link would
    // otherwise ambiguously match a bare name: 'Settings' query too.
    for (const label of ['Organization', 'Menu Builder', 'Map Preview', 'Media', 'Pages', 'Announcements', 'Analytics', 'Users', 'Settings']) {
      await expect(sidebar(page).getByText(label, { exact: true })).toBeVisible();
      await expect(sidebar(page).getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }

    // The URL never changes as a side effect of these items existing on the page.
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('Account and Sign out remain reachable from the header on every admin page (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a10-header@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Yokohama Bay Co',
      displayName: 'Yoko Yokohama',
    });

    await login(page, tenant);

    for (const path of ['/admin', '/admin/map', '/admin/categories', '/admin/pois']) {
      await page.goto(path);
      await expect(page.getByRole('banner').getByRole('link', { name: 'Account' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    }

    await page.getByRole('banner').getByRole('link', { name: 'Account' }).click();
    await expect(page).toHaveURL(/\/admin\/account$/);
  });
});

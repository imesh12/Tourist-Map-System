import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers, createEmulatorUser } from './helpers/emulator-auth';
import { getE2eFirestore, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1A.8 real-tenant-data tests — real Auth + Firestore Emulator +
 * a real `next dev` server, same pattern as the rest of this suite. Covers
 * the required scenarios A–K from the checkpoint spec: real data rendering
 * on `/admin` and `/admin/account`, cross-tenant isolation, and the
 * fail-closed behaviors (incomplete provisioning, missing/inconsistent
 * documents).
 *
 * Checkpoint 1B.6 update: `/admin` no longer resolves or renders any
 * specific map (that assumption is exactly what this checkpoint removes —
 * see `lib/tenant/tenant-identity.ts`'s doc comment) — it now shows a maps
 * COUNT via `listOwnedMaps()` and links to `/admin/maps`. Test (C)'s
 * assertion is updated accordingly. Test (K) — originally "a map document
 * with a mismatched customerId fails closed on /admin" — no longer applies
 * to `/admin` at all, by design: identity resolution
 * (`getCurrentTenantIdentity()`) never touches `maps/*` any more, so a
 * single map's own inconsistency correctly has ZERO effect on whether the
 * dashboard renders. The equivalent fail-closed guarantee now lives at the
 * MAP level (`getOwnedMapContext()`) — (K) is rewritten to prove that
 * instead, and the identical map-level scenario is also covered by
 * `e2e/maps.spec.ts`'s cross-tenant/forged-mapId matrix (§15 N/O/P).
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>, path = '/login'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

/**
 * Checkpoint 1A.10: the admin shell's header now also shows the signed-in
 * user's display name and company (see components/admin-shell/header.tsx)
 * on every `/admin/**` page, alongside the same page's own tenant-data
 * content — so a bare, unscoped `page.getByText(...)` for that same text
 * now legitimately matches two elements instead of one. Scoping to `main`
 * (the shell's page-content region; the header/sidebar render as siblings
 * outside it — see components/admin-shell/admin-shell.tsx) isolates these
 * assertions back to the page's own content, which is what they were
 * always actually testing.
 */
function pageMain(page: Page) {
  return page.locator('main');
}

test.describe('1A.8 client admin dashboard + real tenant data', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('a provisioned CLIENT_ADMIN sees real company, identity, and maps data on /admin (A/B/C)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-dashboard@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Acme Tourist Co',
      displayName: 'Ada Admin',
    });

    await login(page, tenant);
    await expect(page).toHaveURL(/\/admin$/);

    await expect(pageMain(page).getByText('Acme Tourist Co', { exact: true })).toBeVisible(); // A
    await expect(pageMain(page).getByText('Ada Admin', { exact: false })).toBeVisible(); // B
    await expect(pageMain(page).getByText(tenant.email, { exact: false })).toBeVisible(); // B
    await expect(pageMain(page).getByText('CLIENT_ADMIN')).toBeVisible(); // B
    // checkpoint 1B.6: the provisioned tenant has exactly one map (its
    // initial, provisioning-created one) — /admin shows a maps COUNT, not a
    // specific map's name. (C)
    await expect(pageMain(page).getByRole('link', { name: 'Go to Maps' })).toBeVisible();
    await expect(pageMain(page).getByText('You have one map.')).toBeVisible();
  });

  test('/admin/account renders real account and customer data (D)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-account@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Beta Tours Ltd',
      displayName: 'Bea Admin',
    });

    await login(page, tenant);
    // Wait for the post-login navigation (and, with it, the session cookie
    // that `completeFirebaseLogin()` sets via an async `fetch()` the login
    // form's click handler does not itself await the caller side of) to
    // actually land on /admin before navigating again — `login()` only
    // clicks "Sign In" and returns; without this wait, the immediately-
    // following `page.goto('/admin/account')` can race ahead of the
    // session cookie being set, hit /admin/account with no valid session,
    // and get redirected to /login instead — which is what happened here
    // (checkpoint 1A.8 repair round 1, task 2): a test-timing defect, not a
    // production one. Every other test in this file already has this wait
    // (directly or via an equivalent assertion) — this one was missing it.
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/account');

    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await expect(pageMain(page).getByText('Bea Admin')).toBeVisible();
    await expect(pageMain(page).getByText(tenant.email)).toBeVisible();
    await expect(pageMain(page).getByText('CLIENT_ADMIN')).toBeVisible();
    await expect(pageMain(page).getByText('Beta Tours Ltd')).toBeVisible();
    await expect(page.getByText(tenant.customerId)).toBeVisible();
    await expect(page.getByText('COMPLETE')).toBeVisible();
  });

  test('direct navigation and reload still work with real tenant data (E)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-reload@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Gamma Resorts',
      displayName: 'Gary Admin',
    });

    await login(page, tenant);
    await expect(pageMain(page).getByText('Gamma Resorts', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(pageMain(page).getByText('Gamma Resorts', { exact: true })).toBeVisible();

    await page.goto('/admin/account');
    await expect(page).toHaveURL(/\/admin\/account$/);
    await expect(pageMain(page).getByText('Gamma Resorts', { exact: true })).toBeVisible();
  });

  test('tenant A never renders tenant B data through a supported URL/query mechanism (F)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1a8-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Company',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1a8-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Company',
      displayName: 'Bob B',
    });

    await login(page, tenantA);
    await expect(pageMain(page).getByText('Tenant A Company', { exact: true })).toBeVisible();

    // No query parameter is ever read for tenant selection by
    // getCurrentTenantIdentity() — this proves that's actually true, not
    // just documented, against every plausible attempt.
    await page.goto(`/admin?customerId=${tenantB.customerId}`);
    await expect(pageMain(page).getByText('Tenant A Company', { exact: true })).toBeVisible();
    await expect(page.getByText('Tenant B Company')).toHaveCount(0);

    await page.goto(`/admin/account?customerId=${tenantB.customerId}&mapId=${tenantB.mapId}`);
    await expect(pageMain(page).getByText('Tenant A Company', { exact: true })).toBeVisible();
    await expect(page.getByText('Tenant B Company')).toHaveCount(0);
  });

  test('PENDING provisioning does not render the normal dashboard (G)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-pending@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Pending Co',
      displayName: 'Penny Pending',
      provisioningStatus: 'PENDING',
    });

    await login(page, tenant);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Finishing setup' })).toBeVisible();
    await expect(page.getByText('Pending Co')).toHaveCount(0);
  });

  test('FAILED provisioning does not render the normal dashboard (H)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-failed@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Failed Co',
      displayName: 'Fred Failed',
      provisioningStatus: 'FAILED',
    });

    await login(page, tenant);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Setup did not complete' })).toBeVisible();
    await expect(page.getByText('Failed Co')).toHaveCount(0);
  });

  test('an authenticated user with no tenant claims at all fails closed', async ({ page }) => {
    // Not one of A–K explicitly, but the most basic instance of "the smallest
    // clean tenant-context helper must fail closed on missing/malformed
    // claims" (checkpoint 1A.8 §2) — a bare Auth Emulator account with no
    // customerId/role claim and no Firestore docs at all, e.g. a user who
    // never went through any provisioning path.
    const email = 'checkpoint-1a8-no-claims@example.com';
    const password = 'correct-horse-battery-staple';
    await createEmulatorUser(email, password);

    await login(page, { email, password });
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Account unavailable' })).toBeVisible();
  });

  test('a missing customer document fails closed (I)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-missing-customer@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Missing Customer Co',
      displayName: 'Mia Missing',
    });

    const firestore = await getE2eFirestore();
    await firestore.doc(`customers/${tenant.customerId}`).delete();

    await login(page, tenant);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Account unavailable' })).toBeVisible();
    await expect(page.getByText('Missing Customer Co')).toHaveCount(0);
  });

  test('users/{uid}.customerId inconsistent with the token claim fails closed (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-user-mismatch@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'User Mismatch Co',
      displayName: 'Uma Mismatch',
    });

    const firestore = await getE2eFirestore();
    await firestore.doc(`users/${tenant.uid}`).update({ customerId: 'cust_deliberately_wrong_00000000' });

    await login(page, tenant);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Account unavailable' })).toBeVisible();
    await expect(page.getByText('User Mismatch Co')).toHaveCount(0);
  });

  test('maps/{mapId}.customerId inconsistent with the authenticated tenant fails closed at the MAP level, without affecting /admin (K)', async ({
    page,
  }) => {
    // checkpoint 1B.6: identity resolution (`getCurrentTenantIdentity()`,
    // what `/admin` depends on) never reads `maps/*` at all any more, so
    // this scenario's fail-closed guarantee moved to `getOwnedMapContext()`
    // — this test proves BOTH halves: /admin still renders normally (the
    // map's own inconsistency is not a tenant-identity problem), and
    // opening the now-inconsistent map's own URL fails closed.
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a8-map-mismatch@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Map Mismatch Co',
      displayName: 'Max Mismatch',
    });

    const firestore = await getE2eFirestore();
    await firestore.doc(`maps/${tenant.mapId}`).update({ customerId: 'cust_deliberately_wrong_00000000' });

    await login(page, tenant);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(pageMain(page).getByText('Map Mismatch Co', { exact: true })).toBeVisible();

    await page.goto(`/admin/maps/${tenant.mapId}`);
    await expect(page.getByRole('heading', { name: 'Map not found' })).toBeVisible();
    // Scoped to <main> only — Repair Round 1 (checkpoint 1B.6): the shared
    // admin-shell header (components/admin-shell/header.tsx) renders on
    // EVERY /admin/** page, including this fail-closed one, from the
    // AUTHENTICATED tenant's own `getCurrentTenantIdentity()` — a
    // completely separate, correct data source from the mismatched map's
    // own (never-loaded) content. It legitimately shows "Map Mismatch Co"
    // there, exactly as it does on the bare /admin dashboard the assertion
    // right above this one already confirms is correct. That is the
    // signed-in user's OWN company name, not foreign map data — not a leak.
    // An unscoped `page.getByText(...)` assertion incorrectly also matched
    // the header; restricting to `main` (mirroring `pageMain(page)` above)
    // correctly proves what this test actually cares about: no MAP content
    // (name, settings, categories, POIs) from the inconsistent map leaks
    // into the page body.
    await expect(pageMain(page).getByText('Map Mismatch Co')).toHaveCount(0);
  });
});

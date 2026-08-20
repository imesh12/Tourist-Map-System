import { expect, test } from '@playwright/test';
import { clearEmulatorUsers, disableEmulatorUser } from './helpers/emulator-auth';
import { provisionTestTenant } from './helpers/tenant-fixture';

/**
 * Checkpoint 1A.7 client session / protected-route tests — real Auth (and,
 * since checkpoint 1A.8, Firestore) Emulator + a real `next dev` server (see
 * playwright.config.ts's `webServer`), same pattern as e2e/auth.spec.ts.
 *
 * Scope: this file covers what's NEW in 1A.7 (the exact `next` redirect
 * target, session restore across reload/direct navigation, the safe-`next`
 * open-redirect guard, the already-authenticated `/login` redirect, and the
 * disabled-account denial). It deliberately does not re-test scenarios
 * checkpoint 1A.4's e2e/auth.spec.ts already covers and keeps green
 * (unauthenticated → /login, malformed session denied, logout denies later
 * /admin access) — see the 1A.7 completion report for the full mapping of
 * which required scenario is covered by which file. Real tenant/account
 * rendering assertions (checkpoint 1A.8) live in e2e/dashboard.spec.ts —
 * this file's fixture is provisioned as a full tenant (§13) so its own
 * assertions ("Client Admin" / "Account" headings still render) keep
 * meaning what they always meant, but it does not duplicate 1A.8's data
 * assertions.
 */

const TEST_EMAIL = 'checkpoint-1a7-test-user@example.com';
const TEST_PASSWORD = 'correct-horse-battery-staple';

async function login(page: import('@playwright/test').Page, path = '/login'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('1A.7 client session / protected routes', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
    await provisionTestTenant({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      companyName: 'Checkpoint 1A.7 Test Co',
      displayName: 'Checkpoint 1A.7 Test User',
    });
  });

  test('unauthenticated /admin redirects to /login with the exact next target', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  });

  test('unauthenticated /admin/account redirects to /login with the exact, correctly-encoded next target', async ({
    page,
  }) => {
    await page.goto('/admin/account');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Faccount$/);
  });

  test('a valid session survives a full page reload', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Client Admin' })).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Client Admin' })).toBeVisible();
  });

  test('a valid session allows direct navigation to /admin/account without another login', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/account');

    await expect(page).toHaveURL(/\/admin\/account$/);
    // exact: true — checkpoint 1A.8 added a "Your account" <h2> section
    // heading to this page (lib/tenant/client-context.ts-backed real data),
    // and Playwright's default (non-exact) name matching is a
    // case-insensitive substring match, so a bare `name: 'Account'` matches
    // BOTH the page's <h1>Account</h1> AND the <h2>Your account</h2> (which
    // contains "account" as a substring) — a strict-mode ambiguity. This
    // test only ever needed the page-level heading, so exact:true pins it
    // to that one (checkpoint 1A.8 repair round 1, task 3).
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  });

  test('an already-authenticated visit to /login redirects to /admin', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/login');

    await expect(page).toHaveURL(/\/admin$/);
  });

  test('a safe internal next parameter is respected after login', async ({ page }) => {
    await page.goto('/admin/account');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Faccount$/);

    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/admin\/account$/);
  });

  test('an unsafe external next parameter is ignored, falling back to /admin', async ({ page }) => {
    await login(page, '/login?next=https://evil.example.com');
    await expect(page).toHaveURL(/\/admin$/);
    expect(page.url()).not.toContain('evil.example.com');
  });

  test('an unsafe protocol-relative next parameter is ignored, falling back to /admin', async ({ page }) => {
    await login(page, '/login?next=//evil.example.com');
    await expect(page).toHaveURL(/\/admin$/);
    expect(page.url()).not.toContain('evil.example.com');
  });

  test('a disabled Firebase Auth account loses protected access and is redirected with the account-disabled reason', async ({
    page,
  }) => {
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);

    await disableEmulatorUser(TEST_EMAIL);

    await page.reload();

    await expect(page).toHaveURL(/\/login\?reason=account_disabled$/);
    await expect(page.getByText('This account has been disabled. Contact support for help.')).toBeVisible();

    // Access remains denied on a subsequent attempt too — not a one-time
    // redirect that a retry would slip past.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});

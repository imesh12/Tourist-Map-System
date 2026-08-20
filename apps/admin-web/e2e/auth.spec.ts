import { expect, test } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../lib/auth/session-config';
import { E2E_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant } from './helpers/tenant-fixture';

/**
 * Checkpoint 1A.4 auth-emulator integration tests — real Firestore/Auth
 * Emulator + a real `next dev` server (see playwright.config.ts's
 * `webServer`), no mocking of Firebase itself. Must run with the Firebase
 * Emulator Suite already active — invoked via the root `pnpm test:e2e`
 * script, which wraps this in `firebase emulators:exec`.
 *
 * Scope: email/password sign-in only. Google/federated sign-in against the
 * Auth Emulator's fake-IdP popup screen is exercised manually — see the
 * 1A.4 completion report for why that path isn't automated here (the
 * emulator's debug popup DOM isn't a stable Playwright automation target
 * across emulator versions).
 *
 * checkpoint 1A.8 §13: `/admin` now requires real tenant context, so "valid
 * authenticated user" here means a fully-provisioned tenant
 * (`provisionTestTenant`), not just a bare Auth Emulator account — an
 * unprovisioned account would only ever render the generic "Account
 * unavailable" fallback state, which would no longer be testing what these
 * tests are actually meant to prove. The authentication behavior under test
 * is unchanged; only the fixture got more realistic.
 */

const TEST_EMAIL = 'checkpoint-1a4-test-user@example.com';
const TEST_PASSWORD = 'correct-horse-battery-staple';

test.describe('1A.4 authentication foundation', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
    await provisionTestTenant({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      companyName: 'Checkpoint 1A.4 Test Co',
      displayName: 'Checkpoint 1A.4 Test User',
    });
  });

  test('unauthenticated access to /admin redirects to /login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a malformed session cookie is rejected and redirects to /login', async ({ page, context }) => {
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: 'not-a-real-session-cookie',
        url: E2E_BASE_URL,
      },
    ]);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('email/password sign-in reaches the protected admin route', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Client Admin' })).toBeVisible();
    expect(page.url()).not.toContain(TEST_PASSWORD);
  });

  test('wrong password shows a safe error and does not navigate to /admin', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill('completely-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Scoped to the app's own error text rather than `page.getByRole('alert')`,
    // which also matches Next.js's own `__next-route-announcer__` live region
    // (rendered on every page for accessibility route-change announcements) —
    // that ambiguity, not a missing/broken error message, was the actual test
    // defect (checkpoint 1A.4 E2E repair round 3). The application's mapped,
    // safe error message (see `lib/auth/errors.ts`'s `mapFirebaseAuthError`)
    // is still asserted precisely, so this remains a real assertion that the
    // safe error is shown — not a weakened one.
    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).not.toContain('completely-wrong-password');
  });

  test('submitting the login form never performs a native GET submission with credentials in the URL', async ({
    page,
  }) => {
    // Regression coverage for the "credentials leaked into the URL" failure
    // mode: if the form's onSubmit is ever NOT intercepted (e.g. a
    // hydration failure), the browser falls back to a native form
    // submission, which defaults to GET-with-query-string for a bare
    // <form> — appending every named field, including the password, to the
    // URL. Listening at the network-request level (not just the final page
    // URL) catches this even if such a request briefly occurs before any
    // subsequent navigation.
    const credentialLeakingRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      const isLoginPageNavigation = request.method() === 'GET' && url.pathname === '/login';
      if (isLoginPageNavigation && (url.searchParams.has('password') || url.searchParams.has('email'))) {
        credentialLeakingRequests.push(url.toString());
      }
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin/);

    expect(credentialLeakingRequests).toEqual([]);
  });

  test('logout clears the session and /admin becomes inaccessible again', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});

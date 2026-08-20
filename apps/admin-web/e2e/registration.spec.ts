import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant } from './helpers/tenant-fixture';

/**
 * Checkpoint 1A.9 registration integration tests — real Auth + Firestore +
 * Functions Emulator + a real `next dev` server, same pattern as the rest of
 * this suite (see playwright.config.ts). Unlike every other spec here, this
 * file drives the real `/register` UI, which calls the real `registerClient`
 * Callable Function (docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10) rather than
 * seeding a tenant directly via `e2e/helpers/tenant-fixture.ts` — this is
 * the one place the actual browser → Callable Function → Firestore
 * provisioning path is exercised end-to-end, closing the checkpoint 1A.9
 * "registration → dashboard" required scenario. The other required 1A.9
 * scenarios (second client isolation, logout, reload/session-restore,
 * disabled-account denial) are already covered by e2e/dashboard.spec.ts and
 * e2e/protected-routes.spec.ts and are not duplicated here.
 */

async function fillRegistrationForm(
  page: Page,
  fields: { companyName: string; contactName: string; email: string; password: string },
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Company name').fill(fields.companyName);
  await page.getByLabel('Your name').fill(fields.contactName);
  await page.getByLabel('Email').fill(fields.email);
  await page.getByLabel('Password').fill(fields.password);
}

test.describe('1A.9 registration integration', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('a new registrant reaches a fully provisioned /admin dashboard through the real UI and backend', async ({ page }) => {
    await fillRegistrationForm(page, {
      companyName: 'Checkpoint 1A.9 Registration Co',
      contactName: 'Rita Registrant',
      email: 'checkpoint-1a9-registration@example.com',
      password: 'correct-horse-battery-staple',
    });

    await page.getByRole('button', { name: 'Register' }).click();

    // A longer timeout than this suite's other post-submit assertions
    // (default 5s): this is the one test that drives the real
    // registerClient Callable Function over the Functions Emulator's HTTP
    // transport (registerClient itself, then a real sign-in, then the real
    // session POST) rather than provisionTestTenant()'s direct Admin SDK
    // writes — confirmed by measurement to sometimes take several seconds
    // end to end (Callable Function cold start/emulator overhead), not a
    // hang. 20s leaves ample margin without masking a genuine regression.
    await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Client Admin' })).toBeVisible();
    // exact: true — /admin also renders the derived map name ("Checkpoint
    // 1A.9 Registration Co Tourist Map"), which would otherwise ambiguously
    // match this same substring (see e2e/dashboard.spec.ts's identical
    // reasoning for the same assertion pattern).
    await expect(page.getByText('Checkpoint 1A.9 Registration Co', { exact: true })).toBeVisible();
    await expect(page.getByText('Rita Registrant', { exact: false })).toBeVisible();
    await expect(page.getByText('CLIENT_ADMIN')).toBeVisible();
  });

  test('registering with an email that already completed registration is rejected and never reaches /admin', async ({
    page,
  }) => {
    const email = 'checkpoint-1a9-duplicate@example.com';
    // Seeded via the trusted fixture (equivalent end state to a completed
    // real registration) rather than performing a first real UI registration
    // here — this test is specifically about the REJECTION path, not a
    // second exercise of the happy path already covered above.
    await provisionTestTenant({
      email,
      password: 'correct-horse-battery-staple',
      companyName: 'Already Registered Co',
      displayName: 'First Registrant',
    });

    await fillRegistrationForm(page, {
      companyName: 'Second Attempt Co',
      contactName: 'Second Registrant',
      email,
      password: 'a-different-password-1',
    });
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page.getByText('An account with this email already exists. Please sign in instead.')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByText('Second Attempt Co')).toHaveCount(0);
  });

  test('a too-short password is rejected client-side with a field error and never calls the backend', async ({ page }) => {
    await fillRegistrationForm(page, {
      companyName: 'Weak Password Co',
      contactName: 'Wanda Weakpass',
      email: 'checkpoint-1a9-weak-password@example.com',
      password: 'short',
    });

    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page.getByText('String must contain at least 8 character(s)')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('an already-authenticated visit to /register redirects to /admin', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1a9-already-authed@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Already Authed Co',
      displayName: 'Alan Authed',
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(tenant.email);
    await page.getByLabel('Password').fill(tenant.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/register');
    await expect(page).toHaveURL(/\/admin$/);
  });
});

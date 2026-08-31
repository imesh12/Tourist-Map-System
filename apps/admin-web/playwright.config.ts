import { defineConfig, devices } from '@playwright/test';
import {
  E2E_APP_ENV,
  E2E_BASE_URL,
  E2E_PORT,
  E2E_TOURIST_APP_ENV,
  E2E_TOURIST_BASE_URL,
  E2E_TOURIST_PORT,
} from './e2e/constants';

/**
 * Checkpoint 1A.4 auth-emulator integration tests.
 *
 * Must run with the Firebase Emulator Suite already active. Invoked via the
 * root `pnpm test:e2e` script, which wraps `playwright test` in
 * `firebase emulators:exec --only auth,firestore` (see root package.json).
 * Scoped to `auth,firestore` — checkpoint 1A.8 added real Firestore tenant
 * data loading (`/admin`, `/admin/account`), so both emulators are needed;
 * still no Cloud Functions emulator, since this suite calls no Callable
 * Function (test tenants are seeded directly via the Admin SDK against both
 * emulators — see `e2e/helpers/tenant-fixture.ts` — not by invoking
 * `registerClient` over the Functions transport). Do not run
 * `pnpm --filter admin-web test:e2e` directly without the emulators running
 * first — the app's Firebase client/admin init will fail to reach them.
 *
 * `webServer` starts `next dev` on a dedicated port (distinct from the
 * default 3000 a developer might already have running) so this suite never
 * collides with a manually-started dev server.
 *
 * `webServer.env` injects a full, deterministic, emulator-only application
 * configuration (`E2E_APP_ENV`) — Firebase config plus the server-only
 * `APP_ORIGIN` CSRF trust boundary (see `lib/auth/origin-check.ts`) — the
 * suite must not depend on an uncommitted, developer-specific
 * `apps/admin-web/.env.local` existing. `.env.example` is documentation
 * only; Next.js never loads it automatically. None of these values are
 * secrets (see `e2e/constants.ts`'s doc comment for the full reasoning).
 *
 * `workers: 1` — checkpoint 1A.7 E2E flake repair. `fullyParallel: false`
 * only serializes the tests *within* a single spec file; it does nothing to
 * stop Playwright's default worker pool from assigning different spec
 * files (e.g. `auth.spec.ts` and `protected-routes.spec.ts`) to separate
 * workers that run concurrently. Every spec file's `beforeEach` calls
 * `clearEmulatorUsers()`, which wipes *all* accounts in the shared Auth
 * Emulator project (`e2e/helpers/emulator-auth.ts`) — with >1 worker, one
 * file's `beforeEach` can delete another file's just-created, mid-test user
 * out from under it, surfacing as a spurious `auth/user-not-found` on an
 * otherwise-correct login. This was confirmed as the actual cause of an
 * intermittent failure in "a valid session survives a full page reload"
 * (`protected-routes.spec.ts`) that only reproduced when Playwright picked
 * 2 workers. Each Playwright worker is a separate process with its own
 * module state, so per-process caching/locking can't fix this — the shared
 * resource is the Auth Emulator's REST state itself, external to every
 * worker. Real fixture isolation (unique per-test users + a `deleteUser`
 * scoped to just that user, replacing the project-wide wipe) is the more
 * scalable long-term fix, but is more moving parts than a ~15-test Phase 1A
 * suite currently justifies — `workers: 1` is the smallest change that
 * fully removes the race, at the cost of this suite no longer running
 * spec files in parallel with each other (acceptable: it's a handful of
 * seconds either way, and every test here already made an emulator round
 * trip per assertion).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  // Checkpoint 1B.9 — `webServer` accepts an array of independently-started
  // servers (Playwright's own documented shape); admin-web's own entry below
  // is unchanged in every field. The added `tourist-web` entry starts a
  // SECOND `next dev` process, via `cwd` (this config file lives in
  // `apps/admin-web`, so `../tourist-web` is the sibling app directory in
  // this same pnpm workspace), on its own dedicated E2E port
  // (`E2E_TOURIST_PORT`, 3101) — never colliding with admin-web's E2E port
  // (3100) or either app's normal dev port (3000/3001). Both servers must be
  // up before any spec file's `page.goto()` — Playwright's own `webServer`
  // array semantics wait for every entry's `url` to respond before running
  // tests, so no spec needs to coordinate startup order itself.
  webServer: [
    {
      command: `next dev --port ${E2E_PORT}`,
      url: E2E_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E_APP_ENV,
    },
    {
      command: `next dev --port ${E2E_TOURIST_PORT}`,
      cwd: '../tourist-web',
      url: E2E_TOURIST_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E_TOURIST_APP_ENV,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

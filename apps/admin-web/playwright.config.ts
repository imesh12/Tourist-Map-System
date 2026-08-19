import { defineConfig, devices } from '@playwright/test';
import { E2E_APP_ENV, E2E_BASE_URL, E2E_PORT } from './e2e/constants';

/**
 * Checkpoint 1A.4 auth-emulator integration tests.
 *
 * Must run with the Firebase Emulator Suite already active. Invoked via the
 * root `pnpm test:e2e` script, which wraps `playwright test` in
 * `firebase emulators:exec --only auth` (see root package.json). Scoped to
 * `auth` only — this suite exercises the Next.js session-cookie pipeline
 * against the Auth Emulator exclusively; it reads/writes no Firestore data
 * and calls no Cloud Function, so starting those emulators here would only
 * add startup time without covering anything this suite touches. Do not run
 * `pnpm --filter admin-web test:e2e` directly without the emulator running
 * first — the app's Firebase client/admin init will fail to reach it.
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
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `next dev --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: E2E_APP_ENV,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

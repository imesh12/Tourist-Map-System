import { defineConfig } from 'vitest/config';

// `registerClient` provisioning tests — checkpoint 1A.5.
//
// This suite talks to REAL Auth + Firestore emulators (via the real Admin
// SDK, exactly as `register-client.ts` does in production) and will fail
// outright if no emulator is running. It is intentionally isolated from
// `vitest.config.ts` (the normal unit-test config) so `pnpm test` never
// accidentally tries to run it — mirrors `vitest.rules.config.ts`'s
// isolation reasoning from checkpoint 1A.3. Invoke via `pnpm test:provisioning`
// at the repo root, which wraps this in `firebase emulators:exec --only
// auth,firestore` so both emulators start, the test runs, and they shut
// down automatically.
//
// `FIREBASE_PROJECT_ID` is pinned here (rather than relying on
// `firebase emulators:exec` to set an ambient project-id env var, which is
// not documented/guaranteed behavior) so the Admin SDK deterministically
// talks to the same `touristmap-local` project identity as
// `firebase/.firebaserc`'s "default" alias — matching the already-proven
// pattern from apps/admin-web's E2E harness (`E2E_APP_ENV`).
export default defineConfig({
  test: {
    include: ['test/provisioning/**/*.test.ts'],
    testTimeout: 30_000,
    env: {
      FIREBASE_PROJECT_ID: 'touristmap-local',
    },
  },
});

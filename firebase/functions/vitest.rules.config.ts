import { defineConfig } from 'vitest/config';

// Firestore security-rules smoke test only.
//
// This suite talks to a *real* Firestore emulator (via
// @firebase/rules-unit-testing) and will hang or fail outright if no
// emulator is running. It is intentionally isolated from `vitest.config.ts`
// (the normal unit-test config) so `pnpm test` never accidentally tries to
// run it. Invoke via `pnpm test:rules` at the repo root, which wraps this in
// `firebase emulators:exec` so the emulator starts, the test runs, and the
// emulator shuts down automatically — no manually-managed background
// process required (checkpoint 1A.3, §11).
export default defineConfig({
  test: {
    include: ['test/security-rules/**/*.test.ts'],
    // No watch/retry semantics needed for a one-shot emulator-backed smoke
    // test; keep it a single deterministic run per `emulators:exec` call.
    testTimeout: 30_000,
  },
});

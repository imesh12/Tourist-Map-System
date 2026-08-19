import { defineConfig } from 'vitest/config';

// Normal unit tests for Cloud Functions source code.
//
// Deliberately scoped to `src/**` only. The Firestore security-rules smoke
// test under `test/security-rules/**` requires a running Firebase Emulator
// Suite and must never be picked up by the plain `pnpm test` run — see
// `vitest.rules.config.ts` and `package.json`'s `test:rules` script, which is
// only ever invoked through `firebase emulators:exec` (checkpoint 1A.3).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});

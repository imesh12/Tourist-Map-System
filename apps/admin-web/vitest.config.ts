import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests only. `e2e/**` is owned exclusively by Playwright
// (playwright.config.ts) — Vitest must never collect it: Playwright's
// `test.describe()`/`test()` API throws ("Playwright Test did not expect
// test.describe() to be called here") if Vitest's runner executes it
// directly. Spreading `configDefaults.exclude` first keeps Vitest's normal
// exclusions (node_modules, dist, .next, etc.) intact — setting a bare
// custom `exclude` array would otherwise replace them entirely rather than
// add to them.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});

// Native ESLint 9 flat config for Next.js 16 — no FlatCompat / @eslint/eslintrc
// bridge (see git history / prior 1A.1 repair notes for why FlatCompat was
// removed: it crashed with "Converting circular structure to JSON" loading
// the React plugin config via the legacy 'next/core-web-vitals' name).
//
// This does NOT use the `defineConfig`/`globalIgnores` helpers from
// `eslint/config` — that subpath export requires a newer ESLint than the
// 9.18.0 pinned in this workspace and fails with
// ERR_PACKAGE_PATH_NOT_EXPORTED. A plain flat-config array (what
// `defineConfig` just wraps) works with any ESLint 9.x and needs no extra
// export. Ignores are expressed as an ordinary flat-config object with an
// `ignores` key instead of `globalIgnores(...)`.
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**', 'playwright-report/**'],
  },
];

export default eslintConfig;

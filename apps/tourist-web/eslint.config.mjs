// Native ESLint 9 flat config for Next.js 16 — no FlatCompat / @eslint/eslintrc
// bridge. See apps/admin-web/eslint.config.mjs for the full root-cause notes
// (FlatCompat circular-JSON crash; and why `eslint/config`'s
// `defineConfig`/`globalIgnores` helpers aren't used — that subpath isn't
// exported by the ESLint 9.18.0 pinned in this workspace).
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**'],
  },
];

export default eslintConfig;

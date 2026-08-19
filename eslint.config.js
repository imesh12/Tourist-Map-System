// Root ESLint flat config.
// Used directly by non-Next.js workspaces (packages/*, firebase/functions).
// apps/admin-web and apps/tourist-web have their own eslint.config.mjs built on
// eslint-config-next, since Next.js 16 ships its own flat-config recommendations.
//
// NOTE: this file has not been validated by an actual `eslint` run in this
// session — dependency installation could not be performed here (see the
// Phase 1A.1 completion report). Review once `pnpm install` succeeds in an
// environment with registry access.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', '**/lib/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);

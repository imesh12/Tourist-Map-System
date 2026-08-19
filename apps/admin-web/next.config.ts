import type { NextConfig } from 'next';

// Turbopack is the default bundler for `next dev` / `next build` in Next.js 16 —
// no --turbopack flag or experimental.turbopack option needed.
const nextConfig: NextConfig = {
  // `allowedDevOrigins` only has any effect under `next dev` — Next.js
  // ignores it entirely for `next build`/`next start`, so this cannot
  // weaken the production origin policy no matter what's listed here. It
  // exists solely because `next dev`'s default cross-origin protection only
  // trusts `localhost` by default, and this repo's Playwright suite
  // (checkpoint 1A.4, `apps/admin-web/playwright.config.ts`) navigates to
  // `http://127.0.0.1:<port>` specifically — a different origin string from
  // Next's point of view even though it's the same loopback interface.
  // Without this, Next silently blocks the dev JS bundle/RSC requests
  // ("Blocked cross-origin request to Next.js dev resource"), the page
  // never hydrates, and React's `onSubmit` handlers never attach — which is
  // what caused the login form to fall back to a native browser form
  // submission. Scoped to exactly the one origin the E2E suite uses; not a
  // wildcard, not `0.0.0.0`.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;

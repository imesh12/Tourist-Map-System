import type { NextConfig } from 'next';

// `allowedDevOrigins` only has any effect under `next dev` — Next.js ignores
// it entirely for `next build`/`next start`, so this cannot weaken the
// production origin policy no matter what's listed here. It exists solely
// because `next dev`'s default cross-origin protection only trusts
// `localhost` by default, and this repo's Playwright suite
// (`apps/admin-web/playwright.config.ts`) navigates to
// `http://127.0.0.1:<port>` specifically — a different origin string from
// Next's point of view even though it's the same loopback interface. Without
// this, Next silently blocks the dev JS bundle/RSC requests ("Blocked
// cross-origin request to Next.js dev resource"), the page never hydrates,
// and `tourist-map.tsx`'s client-only Google Maps rendering never mounts —
// exactly `apps/admin-web/next.config.ts`'s own identical fix from
// checkpoint 1A.4, just never carried over when this app's real map route
// was built in 1B.9. Scoped to exactly the one origin the E2E suite uses;
// not a wildcard, not `0.0.0.0`.
const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;

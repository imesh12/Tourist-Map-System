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
  // E2E failure investigation (post-checkpoint-1B.10) — `next dev` always
  // renders its own dev-mode-only "Dev Tools" indicator badge
  // (`<nextjs-portal>`, containing `<script data-nextjs-dev-overlay="true">`)
  // fixed-positioned in a viewport corner, on every page, whether or not any
  // error exists. Its default corner is bottom-left. Checkpoint 1B.10 added
  // `.public-bottom-menu` (`components/public-map/public-bottom-menu.tsx`),
  // a full-width bar pinned to the bottom of the map (`globals.css`:
  // `.public-bottom-menu { position: absolute; left: 0; right: 0; bottom: 0;
  // }`) whose FIRST button ("All") sits exactly in that same bottom-left
  // corner. The two fixed-position elements physically overlap there, so
  // Chromium correctly reports the indicator as intercepting pointer events
  // aimed at "All" — not a runtime/application error (confirmed via the
  // failing E2E traces: no console error, no page error, no full-screen
  // error dialog — only the neutral, always-present "Open Next.js Dev
  // Tools" badge). `PublicMapShell`'s header/footer (`public-map-shell.tsx`)
  // are plain static text with no interactive controls and nothing else in
  // this app renders in a top corner, so moving the indicator there is safe
  // for every existing and future bottom-menu item. This only affects `next
  // dev`; Next.js omits `devIndicators` entirely from production builds, so
  // this has zero effect on `next build`/`next start`.
  devIndicators: {
    position: 'top-right',
  },
};

export default nextConfig;

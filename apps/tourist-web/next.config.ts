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
  // E2E failure investigation (post-checkpoint-1B.10, revisited post-1B.16)
  // — `next dev` always renders its own dev-mode-only "Dev Tools" indicator
  // badge (`<nextjs-portal>`, containing `<script data-nextjs-dev-overlay=
  // "true">`) fixed-positioned in a viewport corner, on every page, whether
  // or not any error exists. Its default corner is bottom-left. Checkpoint
  // 1B.10 found that corner collided with `.public-bottom-menu`'s first
  // ("All") button and moved the indicator to `top-right` — confirmed at the
  // time via the failing E2E traces: no console error, no page error, no
  // full-screen error dialog, only the neutral, always-present "Open
  // Next.js Dev Tools" badge intercepting pointer events aimed at our own
  // fixed-position control sharing its corner.
  //
  // Checkpoint 1B.16 reintroduced the exact same class of collision in the
  // NEW corner: `.page-overlay-close` and `.poi-detail-close`
  // (`app/globals.css`) are both `position: absolute; top: 0.7rem; right:
  // 0.7rem;` — i.e. top-right, exactly where the indicator was moved to.
  // Reproduced the same way: 3 E2E tests (`pages-cms.spec.ts`,
  // `public-tourist-map-interaction.spec.ts`) timed out clicking those close
  // buttons with the identical `<nextjs-portal>` "intercepts pointer
  // events" log, again with no error overlay/alert content in the page
  // snapshot — only the same neutral Dev Tools badge.
  //
  // Fix: `top-left`, not another guess at "the current safe corner". 1B.16
  // also removed `PublicMapShell`'s old `<header>` entirely (branding moved
  // into the floating `PublicMapDock`, which is bottom-center and capped at
  // `max-width: min(880px, calc(100% - 1.5rem))` — see `.public-map-dock`,
  // `app/globals.css` — so it never reaches either bottom corner either).
  // Nothing in this app renders in the top-left today, and the shell's own
  // architecture doc comment (`public-map-shell.tsx`) is explicit that all
  // chrome floats over one full-viewport map body rather than occupying a
  // layout row, so a future addition is far more likely to extend the
  // bottom dock or a corner overlay than to claim the top-left corner. This
  // relocates the SAME always-present, non-error indicator badge — it is
  // not hidden, suppressed, or removed, and remains fully visible/clickable
  // at its new position. This only affects `next dev`; Next.js omits
  // `devIndicators` entirely from production builds, so this has zero
  // effect on `next build`/`next start`.
  devIndicators: {
    position: 'top-left',
  },
};

export default nextConfig;

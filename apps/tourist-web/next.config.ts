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
  // EMBEDDABLE PUBLIC MAP FOUNDATION checkpoint — security headers, scoped
  // to THIS app only (apps/admin-web/next.config.ts is untouched by this
  // checkpoint; its own Admin CMS routes keep whatever framing posture they
  // already had — nothing here weakens that).
  //
  // Investigation (this checkpoint): neither app had ANY `headers()`
  // config, `middleware.ts`, or hosting-level (firebase/firebase.json has no
  // `hosting` block) header configuration before this change — this repo
  // never set X-Frame-Options/CSP anywhere. So this is the FIRST explicit,
  // intentional statement of tourist-web's framing policy, not a relaxation
  // of an existing restriction.
  //
  // Requirement: every published client map must be embeddable inside an
  // ARBITRARY client website (their own HTML/PHP/WordPress/React/other CMS
  // — checkpoint's own wording), and this app has no per-map/per-domain
  // allowlist of embedder origins yet (that is explicitly deferred to a
  // later "Admin Share & Embed UI" checkpoint, which could tighten this to
  // a per-map domain allowlist once it exists). Given that, an
  // `frame-ancestors` value naming specific domains would be actively wrong
  // today — it would block the exact "any client's own website" use case
  // this checkpoint exists to prove. `frame-ancestors *` is the deliberate,
  // documented choice: this app has no authenticated session, no
  // CSRF-relevant state-changing action, and no secret to protect from a
  // framing/clickjacking attack (`GET /maps/{mapId}` is the same
  // unauthenticated, publication-only content whether hosted directly or
  // embedded — see PublicMapShell/tourist-map-page-client's own doc
  // comments) — a wildcard here does not create a new vulnerability class
  // the way it would on, say, a login or payment page.
  //
  // Deliberately NOT `X-Frame-Options` — the checkpoint explicitly forbids
  // `X-Frame-Options: ALLOW-FROM` (removed from all modern browsers years
  // ago, and it never supported a wildcard anyway), and setting
  // `X-Frame-Options: SAMEORIGIN`/`DENY` alongside a permissive CSP
  // `frame-ancestors` would be self-contradictory — a browser that honors
  // `frame-ancestors` (every current browser) ignores `X-Frame-Options`
  // entirely once CSP is present, and a legacy browser with no CSP support
  // gets no framing restriction at all either way. So this omits
  // `X-Frame-Options` altogether rather than shipping a header whose value
  // could never be made to agree with the CSP directive next to it.
  //
  // `Permissions-Policy: geolocation=*` — checkpoint requirement "My
  // Location must continue working when browser/parent permissions allow."
  // A cross-origin iframe's ability to use `navigator.geolocation` is
  // gated by TWO independent things: the PARENT page's `<iframe allow=
  // "geolocation">` attribute (an integration contract the embedding site
  // controls — see the recommended snippet in this checkpoint's completion
  // report), and THIS app's own `Permissions-Policy` response header, which
  // can only ever further RESTRICT what a browser allows, never grant
  // something the iframe `allow` attribute didn't already permit. Explicitly
  // stating `geolocation=*` here removes any ambiguity/browser-default
  // difference and makes the intent — My Location must keep working when
  // embedded, not just when hosted directly — a documented, testable
  // contract rather than an accident of Next's defaults (which happen to
  // already omit this header, but "we never set a header that would block
  // it" and "we explicitly declared it must work" are different
  // guarantees).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
          { key: 'Permissions-Policy', value: 'geolocation=*' },
        ],
      },
    ];
  },
};

export default nextConfig;

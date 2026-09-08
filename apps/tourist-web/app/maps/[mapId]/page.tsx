import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { MapMessageState } from '@/components/public-map/map-message-state';
import { TouristMapPageClient } from '@/components/public-map/tourist-map-page-client';
import { fetchPublicMapSnapshot } from '@/lib/public-map/public-map-client';
import { parseAcceptLanguageHeader, resolveInitialLanguage } from '@/lib/public-map/language-selection';
import { resolvePublicPhotoPinTemplate } from '@/lib/public-map/marker-style-adapter';

/**
 * `GET /maps/{mapId}` — checkpoint 1B.9 §1/§10/§11. The first real public,
 * unauthenticated tourist-facing route.
 *
 * A SERVER Component: it receives `mapId`, fetches the public publication
 * snapshot (never draft Firestore data — see
 * lib/public-map/public-map-client.ts's own doc comment for the full
 * architectural boundary this enforces), handles every non-success state
 * itself, and passes only the already-validated, already-public-safe
 * snapshot down to the client map component. No login, no session, no
 * tenant cookie is ever read or required here — this route has no
 * authentication concept at all, by construction (nothing in this file or
 * anything it imports reads a cookie/session).
 *
 * Three outcomes, matching `PublicMapFetchResult` exactly (§1):
 *
 * - `'ok'` — (A) renders the tourist map inside the shell.
 * - `'not-found'` — (B, C) a valid-but-never-published map and a
 *   nonexistent map are DELIBERATELY indistinguishable (see the fetch
 *   client's own doc comment) — both call `notFound()`, which renders
 *   `./not-found.tsx`, a friendly, tourist-styled "not available" page with
 *   a real HTTP 404 status.
 * - `'error'` — (D) a network/server failure renders a friendly generic
 *   error state inline, with a 200 status (this is a "we're having
 *   trouble, please try again" page, not a broken one).
 *
 * Deliberately NO sibling `loading.tsx` in this route segment. Next.js
 * treats a segment with a `loading.tsx` as streamable: it wraps `page.tsx`
 * in an implicit `<Suspense>`, flushes the initial HTTP response (status
 * 200, the loading fallback markup) BEFORE this async component's fetch
 * resolves, and patches the real content in afterward over the
 * already-open connection — at which point the status code has already
 * been sent and can no longer become a real 404, even though `notFound()`
 * does still correctly swap in the not-found UI. That silently violated
 * this checkpoint's own requirement of a REAL HTTP 404 for the unpublished/
 * nonexistent cases (confirmed by E2E: the page reads as not-found, but
 * `page.status()` was 200). Removing `loading.tsx` makes this component
 * block like an ordinary async Server Component again: Next.js waits for
 * `fetchPublicMapSnapshot()` (and any `notFound()` it triggers) to fully
 * resolve before sending anything, so the one HTTP response this route ever
 * sends carries the correct status the first time. The tourist-visible
 * "Loading map…" requirement (§13) is unaffected — it's satisfied by
 * `tourist-map.tsx`'s own CLIENT-side loading text while the Google Maps
 * SDK script loads, which is the actually slow, user-perceptible part; the
 * internal snapshot fetch this file performs is a fast same-origin/
 * same-deployment call with nothing meaningful to show a spinner for.
 *
 * EMBEDDABLE PUBLIC MAP FOUNDATION checkpoint — `?embed=1`
 * (`searchParams.embed`) is accepted here purely as a documented,
 * additive INTEGRATION CONTRACT, never a rendering fork: this route
 * renders the exact same `TouristMapPageClient` tree whether `embed` is
 * present or not (checkpoint requirement: "do not fork markup just because
 * embed=1"). `isEmbed` is threaded one level down only so
 * `PublicMapShell` can stamp an inert `data-embed="1"` attribute on its
 * root element (see that component's own doc comment) — a hook for future
 * CSS/analytics/E2E assertions, never a behavioral branch. There is no
 * `embed`-specific desktop/mobile switch anywhere in this app: every
 * existing responsive rule is a CSS `@media` query against the rendered
 * document's own viewport (see `app/globals.css`), which is already
 * exactly the iframe's own viewport once embedded — no parent-window
 * width is ever read, so embedding requires no separate layout logic at
 * all. See apps/tourist-web/next.config.ts's own doc comment for the
 * accompanying CSP/`frame-ancestors` change that actually permits framing.
 */

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
  /**
   * checkpoint 1B.17B §12 — the `?lang=` query param, read by Next.js's own
   * async `searchParams` prop (same async-prop shape `params` already has on
   * this route). A value with more than one entry for `lang` (a malformed/
   * duplicated query string) collapses to `undefined` here — `resolveInitialLanguage()`
   * treats that exactly like "no `?lang` at all," never throwing.
   *
   * `embed` — EMBEDDABLE PUBLIC MAP FOUNDATION checkpoint, see this file's
   * header comment. Any presence of the key (`?embed=1`, `?embed=true`, even
   * `?embed=`) is treated as "embedded" — this route never validates a
   * specific value, since the parameter's only purpose is presence-as-a-
   * signal, not a mode selector with multiple meaningful states.
   */
  readonly searchParams: Promise<{
    readonly lang?: string | readonly string[];
    readonly embed?: string | readonly string[];
    /**
     * DEVELOPMENT-ONLY manual override, kept for continued manager visual
     * review — see `resolvePublicPhotoPinTemplate()`
     * (lib/public-map/marker-style-adapter.ts) for the full precedence
     * rule. `?photoMarker=1|2|3` selects one of the three approved
     * `'photo-pin'` templates directly, but ONLY outside a production build
     * (`process.env.NODE_ENV !== 'production'`) — in production this
     * param's value is completely ignored, no matter what a visitor puts in
     * the URL, and the map's currently PUBLISHED `photoMarkerStyle`
     * (Admin → Map → Settings → Photo Marker Style) is always used instead.
     * In development, an absent or invalid value likewise falls through to
     * the published style — this override never hides what a real tourist
     * would see; it only lets a manager preview an alternate template
     * on-demand.
     */
    readonly photoMarker?: string | readonly string[];
  }>;
}

export default async function PublicMapPage({ params, searchParams }: PageParams) {
  const { mapId } = await params;
  const { lang, embed, photoMarker } = await searchParams;
  const langParam = typeof lang === 'string' ? lang : undefined;
  const isEmbed = embed !== undefined;

  const result = await fetchPublicMapSnapshot(mapId);

  if (result.status === 'not-found') {
    notFound();
  }

  if (result.status === 'error') {
    return <MapMessageState message="We couldn't load this map right now." />;
  }

  const { snapshot } = result;

  // ADMIN PHOTO MARKER STYLE checkpoint — resolved AFTER the snapshot fetch
  // succeeds, since the published `photoMarkerStyle` (falling back safely to
  // `undefined` for a pre-checkpoint snapshot — see `resolvePhotoPinTemplate`'s
  // own doc comment) lives on `snapshot.map.theme`. See
  // `resolvePublicPhotoPinTemplate`'s own doc comment for the full dev-query-
  // override-vs-published-style precedence rule.
  const photoPinTemplate = resolvePublicPhotoPinTemplate({
    publishedStyle: snapshot.map.theme.photoMarkerStyle,
    devQueryOverride: typeof photoMarker === 'string' ? photoMarker : undefined,
    isProduction: process.env.NODE_ENV === 'production',
  });

  // checkpoint 1B.17B §12 — resolved server-side so the very first paint
  // already reflects the full precedence order (explicit `?lang=` → browser
  // preference → publication default), with no post-hydration flash. The
  // request's own `Accept-Language` header stands in for "the visitor's
  // browser preferred language" — a real signal every browser already sends
  // on every request, and reading it here keeps the actual matching logic in
  // one pure, unit-tested module (`lib/public-map/language-selection.ts`)
  // rather than duplicating it behind a client-only `navigator.languages`
  // check.
  const headersList = await headers();
  const browserLanguages = parseAcceptLanguageHeader(headersList.get('accept-language'));
  const initialLanguage = resolveInitialLanguage({
    langParam,
    browserLanguages,
    supportedLanguages: snapshot.supportedLanguages,
    defaultLanguage: snapshot.defaultLanguage,
  });

  return <TouristMapPageClient snapshot={snapshot} initialLanguage={initialLanguage} isEmbed={isEmbed} photoPinTemplate={photoPinTemplate} />;
}

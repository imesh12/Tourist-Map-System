import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { MapMessageState } from '@/components/public-map/map-message-state';
import { TouristMapPageClient } from '@/components/public-map/tourist-map-page-client';
import { fetchPublicMapSnapshot } from '@/lib/public-map/public-map-client';
import { parseAcceptLanguageHeader, resolveInitialLanguage } from '@/lib/public-map/language-selection';

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
 */

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
  /**
   * checkpoint 1B.17B §12 — the `?lang=` query param, read by Next.js's own
   * async `searchParams` prop (same async-prop shape `params` already has on
   * this route). A value with more than one entry for `lang` (a malformed/
   * duplicated query string) collapses to `undefined` here — `resolveInitialLanguage()`
   * treats that exactly like "no `?lang` at all," never throwing.
   */
  readonly searchParams: Promise<{ readonly lang?: string | readonly string[] }>;
}

export default async function PublicMapPage({ params, searchParams }: PageParams) {
  const { mapId } = await params;
  const { lang } = await searchParams;
  const langParam = typeof lang === 'string' ? lang : undefined;

  const result = await fetchPublicMapSnapshot(mapId);

  if (result.status === 'not-found') {
    notFound();
  }

  if (result.status === 'error') {
    return <MapMessageState message="We couldn't load this map right now." />;
  }

  const { snapshot } = result;

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

  return <TouristMapPageClient snapshot={snapshot} initialLanguage={initialLanguage} />;
}

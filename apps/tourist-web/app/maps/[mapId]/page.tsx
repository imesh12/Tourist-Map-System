import { notFound } from 'next/navigation';
import { MapMessageState } from '@/components/public-map/map-message-state';
import { PublicMapShell } from '@/components/public-map/public-map-shell';
import { TouristMap } from '@/components/public-map/tourist-map';
import { fetchPublicMapSnapshot } from '@/lib/public-map/public-map-client';

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
}

export default async function PublicMapPage({ params }: PageParams) {
  const { mapId } = await params;
  const result = await fetchPublicMapSnapshot(mapId);

  if (result.status === 'not-found') {
    notFound();
  }

  if (result.status === 'error') {
    return <MapMessageState message="We couldn't load this map right now." />;
  }

  const { snapshot } = result;
  return (
    <PublicMapShell mapName={snapshot.map.name}>
      <TouristMap snapshot={snapshot} />
    </PublicMapShell>
  );
}

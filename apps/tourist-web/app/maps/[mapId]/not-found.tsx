import { MapMessageState } from '@/components/public-map/map-message-state';

/**
 * Rendered by Next.js when `page.tsx` calls `notFound()` — checkpoint 1B.9
 * §1.B/§1.C. Scoped to this one route segment (`app/maps/[mapId]/`), not
 * the whole site, via Next's own file-convention routing — a future
 * top-level 404 (e.g. a stray `/maps/` with no id, or an unrelated path)
 * is unaffected by this file.
 *
 * Deliberately identical wording for "never published" and "does not
 * exist" — see `page.tsx`'s own doc comment for why these two cases are
 * indistinguishable by design, all the way from the admin API through this
 * app's fetch client to here.
 */
export default function MapNotFound() {
  return <MapMessageState message="This map is not currently available." />;
}

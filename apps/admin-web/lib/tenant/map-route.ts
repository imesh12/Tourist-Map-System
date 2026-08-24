import { MAP_ID_PREFIX } from 'shared-types';

/**
 * Pure, client-safe helpers for reading/rewriting the `mapId` segment of an
 * `/admin/maps/{mapId}/**` pathname — checkpoint 1B.6. Used by `Sidebar`
 * (to derive nav-link targets without any server-side prop drilling) and
 * `MapSwitcher` (to build the URL a map-switch navigates to). Deliberately
 * NOT a security boundary of any kind — this only ever produces a URL for
 * the browser to navigate to; every server-side route still independently
 * verifies ownership via `getOwnedMapContext()` regardless of how the
 * browser got there.
 */

const MAP_ROUTE_PATTERN = new RegExp(`^/admin/maps/(${MAP_ID_PREFIX}[A-Za-z0-9_-]+)(/.*)?$`);

/** Extracts the active `mapId` from a pathname, or `undefined` outside any map's routes. */
export function parseActiveMapId(pathname: string): string | undefined {
  return MAP_ROUTE_PATTERN.exec(pathname)?.[1];
}

/**
 * Rewrites `pathname` to point at `nextMapId`, preserving the sub-path
 * (`/settings`, `/categories`, `/pois`, `/menu`) if present — so switching
 * from Shinjuku's Categories page lands on Osaka's Categories page, not its
 * overview. Outside any map's routes, returns a plain map-overview link.
 */
export function withActiveMapId(pathname: string, nextMapId: string): string {
  const match = MAP_ROUTE_PATTERN.exec(pathname);
  const rest = match?.[2] ?? '';
  return `/admin/maps/${nextMapId}${rest}`;
}

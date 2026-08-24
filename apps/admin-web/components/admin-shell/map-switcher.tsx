'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { MapParsed } from 'validation';
import { parseActiveMapId, withActiveMapId } from '@/lib/tenant/map-route';

/**
 * The admin-shell map switcher — checkpoint 1B.6 §7 ("provide a map
 * switcher ... changing map must change the actual `mapId` route/context —
 * not a cosmetic selector that leaves APIs bound to the previous map").
 *
 * Renders nothing outside a map's own routes (`parseActiveMapId()` returns
 * `undefined` — see `lib/tenant/map-route.ts`), so it never appears on
 * `/admin`, `/admin/account`, or the Maps dashboard itself, only inside
 * `/admin/maps/{mapId}/**`. When active, it fetches `GET /api/maps` (the
 * same tenant-scoped listing the Maps dashboard uses) to populate the
 * dropdown with every map this tenant owns — never a client-supplied list,
 * always the server's own answer to "what does this tenant own."
 *
 * Selecting a different map calls `router.push()` with
 * `withActiveMapId(pathname, nextMapId)` — a REAL navigation to the new
 * map's own URL (preserving the current sub-page: Categories stays on
 * Categories), which is what makes this a genuine map switch rather than a
 * cosmetic control: every subsequent Server Component render and every
 * subsequent `fetch('/api/maps/{mapId}/...')` call is now bound to the new
 * `mapId`, verified again from scratch by `getOwnedMapContext()`.
 */
export function MapSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const activeMapId = parseActiveMapId(pathname);

  const [maps, setMaps] = useState<readonly MapParsed[] | undefined>(undefined);

  useEffect(() => {
    if (!activeMapId) {
      return;
    }
    let cancelled = false;
    fetch('/api/maps')
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: { maps: MapParsed[] } | undefined) => {
        if (!cancelled && body) {
          setMaps(body.maps);
        }
      })
      .catch(() => {
        // Best-effort — the switcher simply doesn't render if the list
        // can't be loaded; every page's own content is unaffected.
      });
    return () => {
      cancelled = true;
    };
  }, [activeMapId]);

  if (!activeMapId || !maps || maps.length === 0) {
    return null;
  }

  return (
    <select
      className="select admin-map-switcher"
      value={activeMapId}
      onChange={(event) => router.push(withActiveMapId(pathname, event.target.value))}
      aria-label="Switch map"
    >
      {maps.map((map) => (
        <option key={map.mapId} value={map.mapId}>
          {map.name}
        </option>
      ))}
    </select>
  );
}

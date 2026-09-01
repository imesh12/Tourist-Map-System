/// <reference types="google.maps" />
import type { CategoryIcon, PublishedPoi } from 'shared-types';
import { categoryIconMeta } from './category-icon-meta';
import { buildMarkerIcon, type MarkerShape } from './marker-style-adapter';

/**
 * Checkpoint 1B.10 §4/§12/§14 — the one place a real `google.maps.Marker` is
 * ever created for a POI. Kept as its own small, imperative module (not a
 * React component) rather than growing inside `tourist-map.tsx` — the same
 * "refactor as needed, do not turn tourist-map.tsx into a 1000-line
 * component" instruction the checkpoint gives, and the same reasoning
 * `google-maps-loader.ts` already established for keeping SDK-facing glue
 * separate from render logic.
 *
 * Deliberately the classic `google.maps.Marker` (part of the same `'maps'`
 * library `importLibrary('maps')` already loads — checkpoint 1B.9's
 * existing `google-maps-loader.ts`/`tourist-map.tsx` never imports a second
 * `'marker'` library), not the newer `AdvancedMarkerElement`, which needs a
 * configured Map ID and its own separate library import — unnecessary
 * complexity for this checkpoint's foundation.
 *
 * A full "clear everything, recreate everything" resync on every `sync()`
 * call, not an incremental diff — simple, correct, and more than fast
 * enough for a single tenant map's realistic POI count; a later checkpoint
 * can optimize this if it ever needs to.
 *
 * Never runs at all in this project's hermetic E2E environment (no real
 * Google Maps key — see `tourist-map.tsx`'s own "E2E repair round" doc
 * comment), which is exactly why the deterministic diagnostics block and
 * the search/menu UI, not this file, are what E2E actually exercises for
 * POI content (§20 scenario 1's own instruction).
 */

export interface PoiMarkerLayer {
  readonly sync: (options: SyncOptions) => void;
  readonly destroy: () => void;
}

export interface SyncOptions {
  readonly pois: readonly PublishedPoi[];
  readonly categoryIconById: ReadonlyMap<string, CategoryIcon>;
  readonly shape: MarkerShape;
  readonly pixelSize: number;
  readonly selectedPoiId: string | null;
  readonly onSelect: (poiId: string) => void;
}

/** How much larger a SELECTED marker renders than the theme's own base pixel size — a recognizable state (§4), not a redesign of the size scale itself. */
const SELECTED_SCALE = 1.3;

export function createPoiMarkerLayer(map: google.maps.Map): PoiMarkerLayer {
  let markers: google.maps.Marker[] = [];

  function clear(): void {
    for (const marker of markers) {
      marker.setMap(null);
    }
    markers = [];
  }

  function sync(options: SyncOptions): void {
    clear();

    for (const poi of options.pois) {
      const isSelected = options.selectedPoiId === poi.poiId;
      const icon = categoryIconMeta(options.categoryIconById.get(poi.categoryId) ?? 'OTHER');
      const spec = buildMarkerIcon({
        shape: options.shape,
        pixelSize: isSelected ? Math.round(options.pixelSize * SELECTED_SCALE) : options.pixelSize,
        color: icon.color,
        glyph: icon.emoji,
        selected: isSelected,
      });

      const marker = new google.maps.Marker({
        map,
        position: { lat: poi.location.latitude, lng: poi.location.longitude },
        title: poi.name,
        icon: {
          url: spec.url,
          scaledSize: new google.maps.Size(spec.width, spec.height),
          anchor: new google.maps.Point(spec.anchorX, spec.anchorY),
        },
        zIndex: isSelected ? 1000 : undefined,
      });
      marker.addListener('click', () => options.onSelect(poi.poiId));
      markers.push(marker);
    }
  }

  function destroy(): void {
    clear();
  }

  return { sync, destroy };
}

import type { MapAreaBounds } from 'shared-types';

/**
 * Server-side bounds enforcement for POI locations — checkpoint 1B.3 §16.
 *
 * Recommended behavior chosen by the checkpoint: when a map's configured
 * area is BOUNDED, reject creating/moving a POI outside the configured
 * rectangle rather than inventing a weak client-only check. This is the
 * ONLY place that decision is implemented — both `POST /api/map/pois` and
 * `PATCH /api/map/pois/{poiId}` call this before writing, so client-side
 * validation in the POI drawer is a UX convenience only, never the actual
 * boundary.
 *
 * Standard, non-antimeridian-crossing bounds only — matches
 * `mapAreaBoundsSchema` (packages/validation/src/map.ts)'s own
 * `east > west` invariant, so a map's stored bounds are always the simple
 * rectangle this comparison assumes.
 */
export function isLocationWithinBounds(
  location: { readonly latitude: number; readonly longitude: number },
  bounds: MapAreaBounds,
): boolean {
  return (
    location.latitude <= bounds.north &&
    location.latitude >= bounds.south &&
    location.longitude <= bounds.east &&
    location.longitude >= bounds.west
  );
}

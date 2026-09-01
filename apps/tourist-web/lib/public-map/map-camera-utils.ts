import type { PublishedPoi } from 'shared-types';

/**
 * Checkpoint 1B.10 §12 — pure camera-geometry helpers, deliberately kept
 * independent of `google.maps.*` so they stay unit-testable without a
 * browser/SDK (mirrors `marker-style-adapter.ts`'s own "pure, provider-
 * neutral" boundary). `tourist-map.tsx` converts the plain
 * `{north,south,east,west}` result into whatever shape `map.fitBounds()`
 * wants at the call site — this file never imports `google.maps` types.
 *
 * Used when a category filter changes (§12: "optional fit to filtered
 * markers if practical, but avoid jarring behavior") — `tourist-map.tsx`
 * only calls this on an EXPLICIT filter change after first paint, never on
 * initial mount, so the checkpoint's own configured UNBOUNDED/BOUNDED
 * initial camera (1B.9 §8) is never overridden the instant the page loads.
 */
export interface LatLngBoundsLiteral {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

/**
 * Returns `null` for zero or one POI — a single point has no meaningful
 * "bounds" to fit (a caller should `panTo`/`setCenter` instead), and an
 * empty list has nothing to frame at all.
 */
export function computeBoundsForPois(pois: readonly PublishedPoi[]): LatLngBoundsLiteral | null {
  // `pois.length < 2` alone guarantees `pois[0]` exists at runtime, but
  // `noUncheckedIndexedAccess` (tsconfig.base.json) still types every
  // indexed access as possibly `undefined` — narrowing into a local first,
  // guarded explicitly, satisfies the checker without changing behavior
  // (this branch is unreachable in practice; `first` is always defined
  // whenever `pois.length >= 2`).
  const first = pois[0];
  if (pois.length < 2 || !first) {
    return null;
  }

  let north = first.location.latitude;
  let south = first.location.latitude;
  let east = first.location.longitude;
  let west = first.location.longitude;

  for (const poi of pois) {
    north = Math.max(north, poi.location.latitude);
    south = Math.min(south, poi.location.latitude);
    east = Math.max(east, poi.location.longitude);
    west = Math.min(west, poi.location.longitude);
  }

  return { north, south, east, west };
}

import type { PublishedPoi } from 'shared-types';

/**
 * Checkpoint 1B.10 §6 — pure, snapshot-only category filtering. Input is
 * always `snapshot.pois` (already published-only, already category-integrity
 * checked at publish time by `buildPublicationContent()` — see
 * apps/admin-web/lib/tenant/build-publication-snapshot.ts) — this function
 * never re-derives "is this POI/category enabled", it only narrows an
 * already-safe list by `categoryId`.
 *
 * `categoryId === null` means "All" (§6: "Selecting All: visible POIs = all
 * published POIs") — returns every POI unchanged, same array identity
 * concerns aside (a fresh array, not the same reference, so callers can rely
 * on referential inequality signaling a real recompute if that ever matters).
 *
 * An unknown/stale `categoryId` (e.g. a menu item pointing at a category no
 * longer present in this snapshot — should not happen given publish-time
 * validation, but this function does not trust that invariant blindly)
 * safely returns an EMPTY list rather than throwing or silently falling back
 * to "All" — fail closed, matching this codebase's established "broken
 * reference → exclude, never leak, never crash" convention
 * (`buildPublicMenuProjection`'s own identical posture).
 */
export function filterPoisByCategory(pois: readonly PublishedPoi[], categoryId: string | null): readonly PublishedPoi[] {
  if (categoryId === null) {
    return [...pois];
  }
  return pois.filter((poi) => poi.categoryId === categoryId);
}

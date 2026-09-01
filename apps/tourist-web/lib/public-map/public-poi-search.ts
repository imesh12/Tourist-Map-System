import type { PublishedCategory, PublishedPoi } from 'shared-types';

/**
 * Checkpoint 1B.10 §9 — local, deterministic, publication-snapshot-only POI
 * search. Never calls Google Places or any external provider (§9: "Do NOT
 * call Google Places... Do NOT search unpublished Firestore data"); its only
 * input is `snapshot.pois`/`snapshot.categories`, so a disabled/unpublished
 * POI or category CANNOT appear in a result — not because this function
 * checks `status`/`enabled` itself, but because the publication snapshot
 * never contains one in the first place (the same "safe by construction"
 * argument `filterPoisByCategory`'s own doc comment makes).
 *
 * Matches case-insensitively against POI name, POI description (when
 * present), and the resolved category's name (§9's "at minimum" list) — a
 * POI whose `categoryId` doesn't resolve against `categories` (should not
 * happen given publish-time integrity checks) simply skips the category-name
 * comparison for that POI rather than throwing.
 *
 * An empty/whitespace-only query deliberately returns an EMPTY result list,
 * not "browse all" — "Search" is a distinct feature from "no filter";
 * showing every POI before a visitor has typed anything would make the
 * search overlay redundant with the plain map/category view (§9: "empty
 * query handled cleanly" — cleanly here means predictably empty, not a
 * silent full unsorted dump). This is a plain, deterministic substring
 * match — the checkpoint's own explicit "no fuzzy search or ranking
 * infrastructure yet" instruction.
 */
export function searchPois(
  pois: readonly PublishedPoi[],
  categories: readonly PublishedCategory[],
  query: string,
): readonly PublishedPoi[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') {
    return [];
  }

  const categoryNameById = new Map(categories.map((category) => [category.categoryId, category.name.toLowerCase()] as const));

  return pois.filter((poi) => {
    if (poi.name.toLowerCase().includes(trimmed)) {
      return true;
    }
    if (poi.description && poi.description.toLowerCase().includes(trimmed)) {
      return true;
    }
    const categoryName = categoryNameById.get(poi.categoryId);
    return categoryName !== undefined && categoryName.includes(trimmed);
  });
}

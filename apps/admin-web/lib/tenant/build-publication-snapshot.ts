import {
  DEFAULT_MAP_THEME,
  type PublicationMenuItem,
  type PublicContentLanguage,
  type PublishedCategory,
  type PublishedMapSummary,
  type PublishedPage,
  type PublishedPoi,
} from 'shared-types';
import type { CategoryParsed, MapParsed, MenuItemParsed, PageParsed, PoiParsed } from 'validation';
import { buildPublicMenuProjection } from './menu-projection';

/**
 * Pure content-selection for a Publish — checkpoint 1B.8 §13. No Firestore,
 * no network, no randomness/time dependency (mirrors
 * `buildPublicMenuProjection()`'s own "pure function, heavily unit-testable"
 * design) — takes the caller's already-loaded, already-tenant-scoped draft
 * content and derives exactly the subset a Publish should persist, applying
 * every "fail closed" content rule the checkpoint specifies:
 *
 * - Categories: only `enabled` categories are ever included (§13: "only
 *   valid enabled categories relevant to public content").
 * - Menu: `buildPublicMenuProjection()`'s own existing exclusion rules —
 *   disabled menu item, broken/disabled category reference, retired feature
 *   key — reused verbatim (§11 of this checkpoint: "Use existing
 *   buildPublicMenuProjection(). Do NOT recreate menu projection logic."),
 *   never reimplemented here.
 * - POIs: only `status === 'ENABLED'` POIs whose `categoryId` resolves to
 *   one of the categories already selected above — a POI referencing a
 *   disabled or nonexistent category is silently excluded, never published
 *   with a dangling reference (§13: "must reference valid included
 *   category... broken references: exclude safely").
 * - "Only IMPORTED Google Places POIs are persisted and eligible" / "Temporary
 *   Discover Places candidates: never published" (§13/§8) hold automatically
 *   here, by construction, not by an extra check: a Discover candidate is
 *   never written to `maps/{mapId}/pois/*` in the first place (see
 *   `POST /api/maps/{mapId}/pois/discover`, which only ever returns
 *   ephemeral results — nothing is persisted until a separate
 *   `POST .../pois/import` call), so it can never appear in this function's
 *   `pois` input to begin with.
 * - `theme` is always fully resolved (`DEFAULT_MAP_THEME` substituted when
 *   the draft map has no `theme` field at all) — the exact same read-side
 *   fallback every other admin-web reader of `MapTheme` already applies
 *   (see that type's own doc comment, shared-types/src/map.ts) — so a
 *   future public consumer of a published snapshot never has to re-implement
 *   that fallback itself; the contract guarantees `theme` is always present.
 */

export interface PublicationContent {
  readonly map: PublishedMapSummary;
  /**
   * checkpoint 1B.17A — sourced from the map's own `defaultLanguage`/
   * `enabledLanguages` (see shared-types' `TouristMap` doc comment for why
   * those field names, unchanged, now hold `PublicContentLanguage` values).
   * Captured onto the publication itself, not merely referenced from the
   * live map document, so an already-published snapshot's language config
   * stays exactly what it was at publish time even if the map's OWN
   * draft language settings are changed afterward (§10: "changing draft
   * translations/language settings later must not mutate an already-
   * published version").
   */
  readonly defaultLanguage: PublicContentLanguage;
  readonly supportedLanguages: readonly PublicContentLanguage[];
  readonly menu: readonly PublicationMenuItem[];
  readonly categories: readonly PublishedCategory[];
  readonly pois: readonly PublishedPoi[];
  readonly pages: readonly PublishedPage[];
}

export function buildPublicationContent(
  map: MapParsed,
  categories: readonly CategoryParsed[],
  pois: readonly PoiParsed[],
  menuItems: readonly MenuItemParsed[],
  pages: readonly PageParsed[] = [],
): PublicationContent {
  const publishedCategories: PublishedCategory[] = categories
    .filter((category) => category.enabled)
    .map((category) => ({
      categoryId: category.categoryId,
      name: category.name,
      icon: category.icon,
      // checkpoint 1B.17A — passed through unchanged from the source
      // document; absent for every category no editor has translated yet
      // (1B.17B builds that editor).
      ...(category.translations ? { translations: category.translations } : {}),
    }));

  const publishedCategoryIds = new Set(publishedCategories.map((category) => category.categoryId));

  const publishedPois: PublishedPoi[] = pois
    .filter((poi) => poi.status === 'ENABLED' && publishedCategoryIds.has(poi.categoryId))
    .map((poi) => ({
      poiId: poi.poiId,
      categoryId: poi.categoryId,
      name: poi.name,
      location: poi.location,
      ...(poi.address ? { address: poi.address } : {}),
      ...(poi.description ? { description: poi.description } : {}),
      ...(poi.translations ? { translations: poi.translations } : {}),
    }));

  // checkpoint 1B.11 — only `ENABLED` Pages are ever published, mirroring
  // `publishedCategories`'s identical "only enabled" filter above. A Page
  // creates no marker and has no category relationship, so — unlike POIs —
  // there is no cross-reference to validate here; a Page's PUBLIC visibility
  // depends only on its own `status`.
  const publishedPages: PublishedPage[] = pages
    .filter((page) => page.status === 'ENABLED')
    .map((page) => ({
      pageId: page.pageId,
      title: page.title,
      content: page.content,
      ...(page.translations ? { translations: page.translations } : {}),
    }));

  // `buildPublicMenuProjection()` is given every category/page (not just the
  // already-enabled subsets above) — it applies its own, already-correct
  // enabled/disabled check per menu item internally; passing the full lists
  // lets it make that decision itself rather than this function
  // second-guessing it.
  const menu = buildPublicMenuProjection(menuItems, categories, pages);

  const publishedMap: PublishedMapSummary = {
    name: map.name,
    mapProvider: map.mapProvider,
    area: map.area,
    ...(map.branding ? { branding: map.branding } : {}),
    theme: map.theme ?? DEFAULT_MAP_THEME,
  };

  return {
    map: publishedMap,
    defaultLanguage: map.defaultLanguage,
    supportedLanguages: map.enabledLanguages,
    menu,
    categories: publishedCategories,
    pois: publishedPois,
    pages: publishedPages,
  };
}

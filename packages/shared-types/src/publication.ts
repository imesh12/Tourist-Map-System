import type { CategoryIcon } from './enums.js';
import type { CategoryTranslations } from './category.js';
import type { PublicContentLanguage } from './language.js';
import type { MenuItemTranslations } from './menu-item.js';
import type { PageTranslations } from './page.js';
import type { PoiTranslations } from './poi.js';
import type { FirestoreTimestampLike } from './timestamp.js';
import type { MapAreaConfig, MapBranding, MapProviderConfig, MapTheme } from './map.js';

/**
 * Publish Foundation — checkpoint 1B.8, see
 * docs/architecture/PUBLISHING_ARCHITECTURE.md. This is the "Save != Publish"
 * checkpoint: an ordinary Map Settings/Categories/POIs/Menu Builder Save
 * still only ever writes the live DRAFT (`maps/{mapId}` and its existing
 * `categories`/`pois`/`menuItems` subcollections) — nothing here changes
 * that. Publishing is a SEPARATE, explicit, server-only action that reads
 * the current draft and writes an immutable snapshot at
 * `maps/{mapId}/publications/{publicationId}`.
 *
 * This is a Stage-1B-scoped foundation, not the full future
 * `PublishedMapConfig` contract SYSTEM_BLUEPRINT.md §10/§12 documents for
 * the eventual Publish Engine (Phase 1J) — that richer contract adds
 * languages/events/liveCameras/featureSettings and is explicitly out of
 * scope for this checkpoint (see this checkpoint's own "do not overbuild"
 * instruction). `maps/{mapId}/publications/{publicationId}` (a map-scoped
 * subcollection, matching every other map-owned collection in this
 * codebase — `categories`/`pois`/`menuItems`) is this checkpoint's own
 * storage shape; SYSTEM_BLUEPRINT.md's documented long-term
 * `publishedMaps/{mapId}/versions/{versionId}` top-level collection remains
 * the aspirational Phase 1J target and may be migrated to later — see the
 * architecture doc for the full reasoning, so this file's shape is not
 * mistaken for a change to that longer-term design.
 */

/**
 * Mirrors `apps/admin-web/lib/tenant/menu-projection.ts`'s
 * `PublicMenuProjectionItem` — independently declared here (not imported
 * across the shared-types/app-layer boundary) rather than duplicated logic:
 * `buildPublicMenuProjection()`'s actual output is structurally assignable
 * to this type with zero cast needed, since both describe the exact same
 * "resolved public navigation entry" shape. Plain `string` (not the branded
 * `CategoryId`) for `categoryId`/`featureKey`, matching how every
 * `validation`-package parsed type already flows through this codebase (zod
 * regex/enum schemas produce plain strings, never a branded alias).
 */
export interface PublicationMenuCategoryItem {
  readonly type: 'CATEGORY';
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly categoryId: string;
  /** checkpoint 1B.17A — see `MenuItemTranslations`'s own doc comment (./menu-item.js). Absent on every publication predating this checkpoint. */
  readonly translations?: MenuItemTranslations;
}

export interface PublicationMenuFeatureItem {
  readonly type: 'FEATURE';
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly featureKey: string;
  readonly translations?: MenuItemTranslations;
}

/** checkpoint 1B.11 — mirrors `PublicationMenuCategoryItem`'s shape for a `PAGE` menu item. Only ever produced when the referenced Page exists, is `ENABLED`, and is itself included in `pages` below — see `buildPublicMenuProjection()`'s own doc comment (apps/admin-web/lib/tenant/menu-projection.ts) for the exact fail-closed rule. */
export interface PublicationMenuPageItem {
  readonly type: 'PAGE';
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly pageId: string;
  readonly translations?: MenuItemTranslations;
}

export type PublicationMenuItem = PublicationMenuCategoryItem | PublicationMenuFeatureItem | PublicationMenuPageItem;

/** The narrow, public-safe projection of a `Category` a publication snapshot ever stores — never `customerId`/`mapId`/`enabled`/`order`/`sourceType`/timestamps, all of which are admin-only bookkeeping. */
export interface PublishedCategory {
  readonly categoryId: string;
  readonly name: string;
  readonly icon: CategoryIcon;
  /** checkpoint 1B.17A — see `CategoryTranslations`'s own doc comment (./category.js). Absent on every publication predating this checkpoint. */
  readonly translations?: CategoryTranslations;
}

/** The narrow, public-safe projection of a `Page` a publication snapshot ever stores — checkpoint 1B.11. Never `customerId`/`mapId`/`status`/timestamps, all of which are admin-only bookkeeping; only `ENABLED` pages are ever included (`buildPublicationContent()`'s own rule, mirroring `PublishedCategory`'s identical "only enabled" filter). */
export interface PublishedPage {
  readonly pageId: string;
  readonly title: string;
  readonly content: string;
  /** checkpoint 1B.17A — see `PageTranslations`'s own doc comment (./page.js). */
  readonly translations?: PageTranslations;
}

/** The narrow, public-safe projection of a `Poi` a publication snapshot ever stores — never `customerId`/`mapId`/`sourceType`/`provider`/`providerPlaceId`/`status`/timestamps. */
export interface PublishedPoi {
  readonly poiId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly address?: string;
  readonly description?: string;
  /** checkpoint 1B.17A — see `PoiTranslations`'s own doc comment (./poi.js). */
  readonly translations?: PoiTranslations;
}

/** The map-level fields a publication snapshot carries — a fixed, deliberately narrow subset of `TouristMap`, never `customerId`/`status`/`defaultLanguage`/`enabledLanguages`/`publication`/timestamps. `theme` is always fully resolved (never absent) — see `buildPublicationContent()`'s own doc comment (apps/admin-web/lib/tenant/build-publication-snapshot.ts) for why a snapshot never forces a public consumer to re-implement the `DEFAULT_MAP_THEME` fallback itself. */
export interface PublishedMapSummary {
  readonly name: string;
  readonly mapProvider: MapProviderConfig;
  readonly area: MapAreaConfig;
  readonly branding?: MapBranding;
  readonly theme: MapTheme;
}

/**
 * `maps/{mapId}/publications/{publicationId}` — the full, immutable, server-
 * only stored snapshot document. Created exactly once per successful
 * Publish (§9: "A publication document is immutable after creation.
 * Publishing again must create version 2, not modify version 1.") — no code
 * anywhere in this codebase ever calls `.update()`/`.set()` a second time
 * against an existing publication document.
 *
 * `schemaVersion` — a long-lived API contract needs a version tag from day
 * one (per the map-publishing skill's own guidance) so a future, richer
 * snapshot shape can be introduced without breaking an already-published
 * v1-shaped document; nothing in this checkpoint reads any value other than
 * `1` yet.
 *
 * `customerId`/`publishedByUid` are stored on the document for server-side
 * ownership/audit purposes only — `PublicMapSnapshot` (below) is the
 * distinct, narrower shape the actual public read endpoint returns, which
 * omits both (§16: "Never expose customerId... user ids except where
 * publication audit requires server-side only").
 */
export interface MapPublicationSnapshot {
  readonly schemaVersion: 1;
  readonly publicationId: string;
  readonly mapId: string;
  readonly customerId: string;
  readonly version: number;
  readonly publishedAt: FirestoreTimestampLike;
  readonly publishedByUid: string;
  readonly map: PublishedMapSummary;
  /**
   * checkpoint 1B.17A — the map's public-content language configuration AT
   * THE MOMENT OF THIS PUBLISH, captured into the immutable snapshot exactly
   * like every other published field (§10 of the checkpoint: "Published
   * content MUST remain immutable after publishing. Changing draft
   * translations/language settings later must not mutate an already-
   * published version."). Top-level (not nested inside `map`/
   * `PublishedMapSummary`) since it is not a visual/basemap concern — see
   * `PublishedMapSummary`'s own doc comment for why `defaultLanguage`/
   * `enabledLanguages` are deliberately excluded from that narrower summary.
   * REQUIRED on this parsed/output type — never absent — even though a
   * publication document written before this checkpoint has neither field at
   * all: `packages/validation`'s `mapPublicationSnapshotSchema` normalizes a
   * legacy snapshot to `DEFAULT_PUBLIC_CONTENT_LANGUAGE`/
   * `[DEFAULT_PUBLIC_CONTENT_LANGUAGE]` at parse time (`.default(...)`,
   * mirroring the exact pattern already established for this same schema's
   * `pages` field), so every consumer of the PARSED type can rely on these
   * being real values, never `undefined`.
   */
  readonly defaultLanguage: PublicContentLanguage;
  readonly supportedLanguages: readonly PublicContentLanguage[];
  readonly menu: readonly PublicationMenuItem[];
  readonly categories: readonly PublishedCategory[];
  readonly pois: readonly PublishedPoi[];
  /** checkpoint 1B.11 — only `ENABLED` Pages, see `PublishedPage`'s own doc comment. */
  readonly pages: readonly PublishedPage[];
}

/**
 * What `GET /api/public/maps/{mapId}` actually returns — the same snapshot
 * with every admin/audit-only field removed. See `MapPublicationSnapshot`'s
 * own doc comment for why `customerId`/`publishedByUid` are excluded.
 */
export type PublicMapSnapshot = Omit<MapPublicationSnapshot, 'customerId' | 'publishedByUid'>;

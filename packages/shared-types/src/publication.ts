import type { CategoryIcon, PoiProvider } from './enums.js';
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

/**
 * Photo Experience Prototype checkpoint — the PUBLIC-SAFE photo signal a
 * `PublishedPoi` carries. Deliberately the narrowest possible shape: a
 * presence flag only. This is NOT a photo reference — it never carries a
 * Google photo resource name, a temporary `photoUri`, a redirected/signed
 * image URL, or `providerPlaceId`/`provider`. Those stay entirely
 * server-only, on `MapPublicationSnapshot.photoProviderRefs` (see that
 * field's own doc comment for why, and for the architectural boundary this
 * type exists to preserve: a public consumer can learn "try showing a
 * photo for this POI" without ever learning WHICH provider or WHAT
 * provider-specific identity backs it). The actual image is always
 * resolved on demand, server-side, from fresh Google Places data — see
 * `apps/admin-web/app/api/public/maps/[mapId]/pois/[poiId]/photo/route.ts`.
 */
export interface PublishedPoiPhoto {
  readonly available: true;
}

/**
 * Photo Experience Prototype checkpoint (rich-detail expansion) — the
 * PUBLIC-SAFE, DISPLAY-ONLY price level of a `PublishedPoi.place`. A compact
 * normalization of the Google Places (New) `priceLevel` enum (its
 * `PRICE_LEVEL_` prefix stripped); `PRICE_LEVEL_UNSPECIFIED` normalizes to
 * "no `priceLevel` at all", never a member here.
 */
export const PUBLISHED_POI_PRICE_LEVELS = ['FREE', 'INEXPENSIVE', 'MODERATE', 'EXPENSIVE', 'VERY_EXPENSIVE'] as const;
export type PublishedPoiPriceLevel = (typeof PUBLISHED_POI_PRICE_LEVELS)[number];

/** One `regularOpeningHours` period, mirroring Google Places (New) `Place.OpeningHours.Period` — `day` 0=Sunday..6=Saturday, `hour` 0–23, `minute` 0–59. `close` is absent for a place open 24 h on that `open.day`. */
export interface PublishedPoiOpeningPeriod {
  readonly open: { readonly day: number; readonly hour: number; readonly minute: number };
  readonly close?: { readonly day: number; readonly hour: number; readonly minute: number };
}

/**
 * Photo Experience Prototype checkpoint (rich-detail expansion) — the
 * public-safe REGULAR (not "current") opening hours snapshotted at Publish.
 * `currentOpeningHours.openNow` is deliberately NOT snapshotted — it is
 * true only at the instant of Publish. The tourist client computes
 * "Open now / Closed / Opens at …" itself from `periods` + `utcOffsetMinutes`
 * against the visitor's own clock (see `lib/public-map/opening-hours.ts`).
 * `weekdayDescriptions` is Google's already-localized human schedule text.
 */
export interface PublishedPoiOpeningHours {
  readonly periods: readonly PublishedPoiOpeningPeriod[];
  readonly weekdayDescriptions: readonly string[];
}

/**
 * Photo Experience Prototype checkpoint (rich-detail expansion) — the
 * PUBLIC-SAFE Google Places place metadata snapshotted onto a `PublishedPoi`
 * at Publish time (§4 of the checkpoint expansion: "snapshot stable
 * public-safe place metadata at Publish so draft changes remain invisible
 * until Publish").
 *
 * NEVER carries `providerPlaceId`/`provider`/a photo resource name/any
 * Google review text — only already-public, display-oriented fields. Every
 * field is optional: Google returns them piecemeal, an old publication has
 * none of them, and the tourist detail panel renders a row ONLY when its
 * field is present (never a placeholder). `utcOffsetMinutes` is the place's
 * standard UTC offset, needed by the client to evaluate `openingHours`
 * against the visitor's clock.
 */
export interface PublishedPoiPlace {
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly priceLevel?: PublishedPoiPriceLevel;
  /** A compact currency-neutral glyph string for `priceLevel` (e.g. `"$$"`); FREE renders as the word, handled client-side. Derived, never from Google directly. */
  readonly priceLevelDisplay?: string;
  readonly primaryTypeDisplayName?: string;
  readonly openingHours?: PublishedPoiOpeningHours;
  readonly utcOffsetMinutes?: number;
  readonly websiteUri?: string;
  readonly nationalPhoneNumber?: string;
  readonly dineIn?: boolean;
  readonly takeout?: boolean;
  readonly delivery?: boolean;
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
  /** Photo Experience Prototype checkpoint — see `PublishedPoiPhoto`'s own doc comment. Absent whenever no photo was available at publish time (never a placeholder/false value — mirrors `address`/`description`'s own "absent, not falsy" optionality convention on this same interface). */
  readonly photo?: PublishedPoiPhoto;
  /** Photo Experience Prototype checkpoint (rich-detail expansion) — see `PublishedPoiPlace`'s own doc comment. Absent for every non-`GOOGLE_PLACES` POI, every publication predating this expansion, and any `GOOGLE_PLACES` POI whose Details lookup failed / returned nothing public-safe at Publish time. */
  readonly place?: PublishedPoiPlace;
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
 * Photo Experience Prototype checkpoint — the SERVER-ONLY Google Places
 * identity needed to resolve a POI's photo, keyed by `poiId`. Lives
 * exclusively on `MapPublicationSnapshot` (the raw, Admin-SDK-read
 * Firestore document) and is explicitly excluded from `PublicMapSnapshot`
 * below via `Omit` — the exact same pattern this file already establishes
 * for `customerId`/`publishedByUid` (see `PublicMapSnapshot`'s own doc
 * comment). This is the "server-only publication field / internal photo
 * reference" the checkpoint's architecture correction explicitly permits:
 * it carries only `provider`/`providerPlaceId` — the SAME identifier this
 * codebase already persists on `Poi.provider`/`Poi.providerPlaceId` and
 * treats as a stable place id. It deliberately does NOT carry a Places
 * photo resource name or any media URL: this implementation treats those
 * as non-durable values and never stores them (see
 * `apps/admin-web/lib/pois/external-provider.ts`'s header for the
 * conservative posture). Captured onto the immutable snapshot at publish
 * time exactly like every other published field, and read ONLY by the trusted
 * public photo endpoints
 * (apps/admin-web/app/api/public/maps/[mapId]/pois/[poiId]/photo{,-meta}/route.ts)
 * — never by `GET /api/public/maps/{mapId}` itself.
 */
export interface PublishedPoiPhotoProviderRef {
  readonly provider: PoiProvider;
  readonly providerPlaceId: string;
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
 * `customerId`/`publishedByUid`/`photoProviderRefs` are stored on the
 * document for server-side purposes only — `PublicMapSnapshot` (below) is
 * the distinct, narrower shape the actual public read endpoint returns,
 * which omits all three (§16: "Never expose customerId... user ids except
 * where publication audit requires server-side only"; `photoProviderRefs`
 * — see that field's own doc comment above).
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
  /** Photo Experience Prototype checkpoint — see `PublishedPoiPhotoProviderRef`'s own doc comment above. Absent (or missing entries for POIs with no resolvable photo) on every publication predating this checkpoint and on any publication with no photo-eligible POIs — never required, never defaulted to an empty object at the type level (the `PublicationContent`/publish-route call sites decide whether to include the key at all, matching this file's established "absent, not empty" convention for optional structured fields). */
  readonly photoProviderRefs?: Readonly<Record<string, PublishedPoiPhotoProviderRef>>;
}

/**
 * What `GET /api/public/maps/{mapId}` actually returns — the same snapshot
 * with every admin/audit-only AND server-only-resolution field removed.
 * See `MapPublicationSnapshot`'s own doc comment for why `customerId`/
 * `publishedByUid` are excluded, and `PublishedPoiPhotoProviderRef`'s own
 * doc comment for why `photoProviderRefs` is excluded — this `Omit` is the
 * actual TypeScript-level guarantee behind "do NOT expose providerPlaceId
 * through GET /api/public/maps/{mapId}".
 */
export type PublicMapSnapshot = Omit<MapPublicationSnapshot, 'customerId' | 'publishedByUid' | 'photoProviderRefs'>;

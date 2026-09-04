import type { CustomerId, MapId, PublicationId, Uid } from './ids.js';
import type {
  MapAreaType,
  MapMarkerSize,
  MapMarkerStyle,
  MapProviderName,
  MapStatus,
  MapStyle,
  MapThemePreset,
} from './enums.js';
import type { PublicContentLanguage } from './language.js';
import type { FirestoreTimestampLike } from './timestamp.js';

export interface MapProviderConfig {
  readonly provider: MapProviderName;
  readonly style: MapStyle;
}

export interface MapAreaBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export interface MapAreaConfig {
  readonly type: MapAreaType;
  readonly center?: { readonly lat: number; readonly lng: number };
  readonly defaultZoom?: number;
  readonly bounds?: MapAreaBounds;
}

/**
 * Basic client-controlled branding — checkpoint 1B.1, see
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md §2. A small, explicit set of
 * theme fields (matching SYSTEM_BLUEPRINT.md §11's "controlled theme
 * options, not arbitrary CSS"), not the full future theme system.
 * `logoUrl` is a plain URL string for 1B.1 — real Storage upload UI is
 * deferred to a later checkpoint; a client may paste an already-hosted URL.
 */
export interface MapBranding {
  readonly logoUrl?: string;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
}

/**
 * Which default-provider content categories are shown on the base map —
 * checkpoint 1B.7, see docs/architecture/MAP_THEME_ARCHITECTURE.md. Every
 * flag here is a REQUEST to a provider adapter (e.g.
 * `mapThemeToGoogleMapsStyles()`, apps/admin-web/lib/map-preview) to
 * show/hide that provider's own default POI/label category — never our own
 * tenant categories/POIs (those are always shown; §11 of the checkpoint:
 * "make OUR categories / POIs visually dominant" is achieved by suppressing
 * the PROVIDER's clutter, not by touching anything tenant-owned).
 */
export interface MapThemeVisibility {
  /**
   * Provider commercial + civic POIs (`poi.business`, `poi.government` in the
   * Google adapter). Since checkpoint 1B.16 this is NARROWER than the
   * pre-1B.16 field, which also bundled tourist landmarks — those moved to
   * `landmarkPois` below.
   */
  readonly businessPois: boolean;
  readonly transit: boolean;
  readonly schools: boolean;
  readonly hospitals: boolean;
  readonly parks: boolean;
  readonly roadLabels: boolean;
  readonly transitLabels: boolean;
  /**
   * checkpoint 1B.16 — provider-neutral, all OPTIONAL so every theme and
   * frozen publication predating 1B.16 keeps parsing and rendering
   * unchanged: an ABSENT field means "historical/permissive behaviour",
   * never a forced value. A provider adapter is free to map each to the
   * closest deterministic feature set it supports (see
   * `mapThemeToGoogleMapsStyles`).
   *
   * - `roads` — road GEOMETRY itself (distinct from `roadLabels`). Absent → shown.
   * - `buildings` — building / constructed-area geometry
   *   (`landscape.man_made`). Absent → shown.
   * - `placeLabels` — administrative place/area/locality/neighbourhood text
   *   (country labels are kept for orientation). Absent → shown.
   * - `landmarkPois` — tourist landmarks (`poi.attraction`,
   *   `poi.place_of_worship`). Absent → FOLLOWS `businessPois`, exactly
   *   reproducing the pre-1B.16 grouping.
   */
  readonly roads?: boolean;
  readonly buildings?: boolean;
  readonly placeLabels?: boolean;
  readonly landmarkPois?: boolean;
}

/**
 * Provider-neutral basemap colors — checkpoint 1B.7. Every field optional
 * and independently overridable; an absent field means "use the map
 * provider's own default color for that element," never a forced value.
 * Restricted to `#RRGGBB` (validated in packages/validation/src/map-theme.ts,
 * mirroring `MapBranding`'s identical "controlled color, not arbitrary CSS"
 * rule from SYSTEM_BLUEPRINT.md §11) — never a raw provider style-JSON
 * fragment.
 */
export interface MapThemeColors {
  readonly background?: string;
  readonly land?: string;
  readonly road?: string;
  readonly water?: string;
  readonly label?: string;
}

/** OUR OWN POI marker's visual style — checkpoint 1B.7 §10. See `MAP_MARKER_STYLES`/`MAP_MARKER_SIZES`'s own doc comments (./enums.js) for current renderer status. */
export interface MapThemeMarkerStyle {
  readonly style: MapMarkerStyle;
  readonly size: MapMarkerSize;
}

/**
 * A map's provider-neutral visual theme — checkpoint 1B.7, see
 * docs/architecture/MAP_THEME_ARCHITECTURE.md. Never raw provider style
 * JSON (§ "Do NOT expose raw Google Maps style JSON to Client Admins") —
 * this is the ONLY shape a Client Admin ever edits; a dedicated adapter
 * (`mapThemeToGoogleMapsStyles()`) is the sole place this gets translated
 * into a real Google Maps `styles` array. Optional on `TouristMap` for the
 * same backward-compatibility reason `branding` already is — every map
 * document that predates this checkpoint has no `theme` field at all, and
 * must keep parsing/rendering safely with the registry's own
 * `DEFAULT_MAP_THEME` (./map-theme-presets.js) substituted at the point of
 * use, rather than requiring a Firestore migration.
 */
export interface MapTheme {
  readonly preset: MapThemePreset;
  readonly visibility: MapThemeVisibility;
  readonly colors?: MapThemeColors;
  readonly markerStyle: MapThemeMarkerStyle;
}

/**
 * The map's own publish/versioning pointer — checkpoint 1B.8, see
 * docs/architecture/PUBLISHING_ARCHITECTURE.md. Absent means "this map has
 * never been published" — every map document that predates this checkpoint
 * has no `publication` field at all, and must keep parsing/rendering safely
 * as "Never published" rather than requiring a Firestore migration, the same
 * backward-compatibility contract `branding`/`theme` already establish on
 * this same interface.
 *
 * Only ever written by the trusted `POST /api/maps/{mapId}/publish` server
 * endpoint, atomically alongside the creation of the immutable
 * `maps/{mapId}/publications/{publicationId}` snapshot document it points
 * at (see `MapPublicationSnapshot`, ./publication.js) — never client-
 * writable directly, and never touched by an ordinary Map Settings Save
 * (`PATCH /api/maps/{mapId}/settings` has no `publication` field on its own
 * input schema at all, so a Save can never clear or forge this pointer).
 *
 * Deliberately a small, denormalized SUMMARY of the current publication
 * (not the full snapshot content) — cheap to read alongside the rest of the
 * map document wherever "is this map published, and as of when" is needed
 * (e.g. the Map Settings page header), without a second Firestore read. The
 * full public content lives only in the snapshot document itself.
 */
export interface MapPublicationMeta {
  readonly currentPublicationId: PublicationId;
  readonly version: number;
  readonly publishedAt: FirestoreTimestampLike;
  readonly publishedByUid: Uid;
}

/**
 * `maps/{mapId}` — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8/§11.
 *
 * Named `TouristMap` rather than `Map` deliberately, to avoid shadowing the
 * built-in JavaScript `Map` collection type in any file that imports it.
 *
 * `customerId` is the ownership field. It is written exclusively by trusted
 * backend code at creation time and is never derived from, or overwritable
 * by, client input — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10.
 * `enabledLanguages` must always include `defaultLanguage` — see
 * packages/validation's `mapSchema`, which enforces this invariant at
 * runtime.
 *
 * `defaultLanguage`/`enabledLanguages` — checkpoint 1B.17A "Multilingual
 * Data Foundation": this is a Phase-1A field (present, and required, on
 * every map document this system has ever created) that predates any actual
 * multilingual content model. 1B.17A repoints it at the real
 * `PublicContentLanguage` registry (./language.js) rather than introducing a
 * second, competing "which public languages does this map support" field —
 * `enabledLanguages` IS this checkpoint's "supportedLanguages" concept, kept
 * under its existing, already-established name. See `PublicContentLanguage`'s
 * own doc comment for why this is a DIFFERENT concept from a future Admin UI
 * locale, and `normalizeLegacyPublicContentLanguageCode()` for how a map
 * document stored with the pre-1B.17A `Language` codes (`EN`/`JA`/`ZH_CN`/`KO`)
 * keeps parsing safely.
 */
export interface TouristMap {
  readonly mapId: MapId;
  readonly customerId: CustomerId;
  readonly name: string;
  readonly status: MapStatus;
  readonly defaultLanguage: PublicContentLanguage;
  /** The map's public-content languages — always includes `defaultLanguage`, never empty, never duplicated. See this interface's own doc comment above. */
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly mapProvider: MapProviderConfig;
  readonly area: MapAreaConfig;
  /** Optional — absent until a Client Admin first saves branding (checkpoint 1B.1). */
  readonly branding?: MapBranding;
  /** Optional — absent until a Client Admin first saves a theme (checkpoint 1B.7). See `MapTheme`'s own doc comment for the backward-compatibility contract. */
  readonly theme?: MapTheme;
  /** Optional — absent until this map is first published (checkpoint 1B.8). See `MapPublicationMeta`'s own doc comment above. */
  readonly publication?: MapPublicationMeta;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

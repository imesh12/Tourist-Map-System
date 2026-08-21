import type { CategoryIcon, CategorySourceType } from './enums.js';

/**
 * Future Super-Admin-owned platform category catalog — Category CMS
 * architecture checkpoint. See docs/architecture/CATEGORY_ARCHITECTURE.md
 * for the full ownership boundary and data-flow this supports.
 *
 * DELIBERATELY TYPES-ONLY: no Firestore collection, no route, no Super
 * Admin UI exists for this yet ("do NOT create production Firestore
 * writes for platform categories in this checkpoint unless the canonical
 * roadmap already requires them" — it doesn't). This interface exists so
 * the shape is settled and reusable the moment a real Super Admin
 * checkpoint implements it, rather than inventing it ad hoc then. Nothing
 * in the current codebase constructs, stores, or reads a value of this
 * type.
 *
 * Ownership (§11): only Super Admin ever creates/releases these. A Client
 * Admin's `Category` (./category.js) MAY later reference one via
 * `platformCategoryId`, but never creates or edits a
 * `PlatformCategoryDefinition` itself — see `ClientCategoryConfig` doc
 * notes in the architecture doc for the enable/customize/reorder
 * boundary this implies.
 */
export interface PlatformCategoryDefinition {
  readonly platformCategoryId: string;
  /** Stable machine key, e.g. `'RESTAURANT'` — see `PLATFORM_CATEGORY_KEYS` below. Distinct from `platformCategoryId` (an opaque generated ID) so the key can be referenced in code/config without depending on a specific ID generation scheme. */
  readonly key: PlatformCategoryKey;
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly status: 'ACTIVE' | 'RETIRED';
  /**
   * Where END USER content for this category can come from — e.g. a
   * released `RESTAURANT` category might support `GOOGLE_PLACES` and
   * `CLIENT_CUSTOM`; a released `EVENT` category might support a
   * municipal/tourism event API plus `CLIENT_CUSTOM_EVENT`. See
   * docs/architecture/CATEGORY_ARCHITECTURE.md §"Restaurant category" /
   * §"Event category" for the documented-only future behavior this
   * models. Plain `string` (not a shared enum) deliberately — the real
   * source vocabulary differs per category and isn't settled yet; over-
   * constraining it now would be speculative.
   */
  readonly supportedSources: readonly string[];
  /** Whether a Client Admin may attach their own manual content items (POIs, events, ...) to this category — see docs/architecture/CATEGORY_ARCHITECTURE.md's CATEGORY → CONTENT ITEMS distinction. */
  readonly supportsManualContent: boolean;
  /** Whether this category's public content can be filtered/sorted by proximity to the tourist's current location. */
  readonly supportsNearbySearch: boolean;
  /** Whether this category's content carries a start/end date the public map can filter by (e.g. EVENT). */
  readonly supportsDateFilter: boolean;
  /** Whether a Client Admin may add this category to Menu Builder (a separate, later concept — see docs/architecture/CATEGORY_ARCHITECTURE.md's Menu Builder separation). */
  readonly canAppearInMenu: boolean;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

/**
 * Example future released category keys — illustrative only (§5 of the
 * checkpoint prompt). Not an exhaustive or committed list; Super Admin
 * would define these when that checkpoint actually ships.
 */
export const PLATFORM_CATEGORY_KEYS = ['RESTAURANT', 'EVENT', 'SHOPPING', 'SIGHTSEEING', 'HOTEL', 'PARKING'] as const;
export type PlatformCategoryKey = (typeof PLATFORM_CATEGORY_KEYS)[number];

/**
 * Future tenant-side selection of a platform (or fully custom) category —
 * see docs/architecture/CATEGORY_ARCHITECTURE.md. Documents the intended
 * eventual shape of "what a Client Admin configures"; today's `Category`
 * (./category.js) already covers the `CLIENT_CUSTOM` case fully (a
 * category with no `platformCategoryId` and no menu-visibility concept
 * yet — see that file's own doc comment for exactly which fields are and
 * are not implemented yet, and why).
 */
export interface ClientCategoryConfig {
  readonly platformCategoryId?: string;
  readonly sourceType: CategorySourceType;
  /** Overrides the platform category's default public label; irrelevant for a `CLIENT_CUSTOM` category, whose `name` IS the label — no separate field needed until a platform default exists to override. */
  readonly customName?: string;
  readonly customIcon?: CategoryIcon;
  readonly enabled: boolean;
  /**
   * Whether this category is exposed in the public menu — DEFERRED (§6 of
   * the checkpoint prompt: "menuEnabled may be deferred if adding it now
   * creates premature coupling"). Menu Builder does not exist yet; adding
   * this field to the real `Category` type/schema now would couple
   * category storage to a menu-visibility concept with no consumer to
   * define what it means. Implement on `Category` only when the Menu
   * Builder checkpoint actually needs it.
   */
  readonly menuEnabled: boolean;
  readonly order: number;
}

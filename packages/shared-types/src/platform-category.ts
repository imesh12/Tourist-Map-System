import type { CategoryIcon, CategorySourceType, PoiSourceType } from './enums.js';

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

/**
 * PlatformCategoryRegistry — checkpoint 1B.4, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md §11.
 *
 * `PlatformCategoryDefinition` above is the FUTURE, Firestore-backed,
 * Super-Admin-managed shape — it stays exactly as documented, with no
 * runtime consumer. This registry is a DELIBERATELY SEPARATE, TEMPORARY
 * stand-in: a small, developer-owned, code-based catalog that lets checkpoint
 * 1B.4 ship the first real "released platform category" concept (unblocking
 * Google Places integration) without building a full Super Admin console
 * first. It is not a shortcut taken carelessly — the checkpoint's own
 * instruction is explicit that a full Super Admin is out of scope, and that
 * a code-based registry is the sanctioned interim shape.
 *
 * Design choice that matters for the future migration: every entry's
 * `platformCategoryId` is a FIXED, STABLE, hand-chosen string (`'platcat_restaurant'`),
 * not a randomly generated ID the way `CategoryId`/`PoiId` are. This is
 * deliberate — `Category.platformCategoryId` (./category.js) is just a plain
 * `string`, so when a real Super-Admin-managed `platformCategories`
 * collection eventually replaces this registry, it only needs to be SEEDED
 * with a document whose ID/field matches this exact same string for every
 * tenant category that already links to it today. No migration script ever
 * needs to rewrite `Category.platformCategoryId` on existing tenant
 * documents, and by extension no `Poi` document ever needs touching either —
 * exactly the "migration never requires renaming tenant categories/POIs"
 * requirement this checkpoint calls for.
 *
 * Only `RESTAURANT` is released (`status: 'ACTIVE'`) today — see
 * checkpoint 1B.4's own "Restaurant category first" scope. Adding a second
 * released category later is a matter of adding one more entry here, not a
 * structural change.
 */
export const RELEASED_PLATFORM_CATEGORY_IDS = ['platcat_restaurant'] as const;
export type ReleasedPlatformCategoryId = (typeof RELEASED_PLATFORM_CATEGORY_IDS)[number];

/** The Google Places API surface a released category maps onto — see `GooglePlacesProvider` (apps/admin-web/lib/pois/google-places-provider.ts), the only code that reads this. */
export interface PlatformCategoryGooglePlacesMapping {
  /** Google Places "included type" values (Places API `includedTypes`), e.g. `['restaurant']`. */
  readonly includedTypes: readonly string[];
}

export interface PlatformCategoryRegistryEntry {
  readonly platformCategoryId: ReleasedPlatformCategoryId;
  /** Matches `PlatformCategoryKey` above — the same stable machine key the future Firestore-backed definition would also carry. */
  readonly key: PlatformCategoryKey;
  readonly label: string;
  readonly icon: CategoryIcon;
  readonly status: 'ACTIVE' | 'RETIRED';
  /** Which `PoiSourceType`s a tenant category linked to this platform category may draw content from. Checkpoint 1B.4 only ever produces `GOOGLE_PLACES` content from this list — `CLIENT_CUSTOM` is always allowed regardless of linking (see docs/architecture/CATEGORY_ARCHITECTURE.md's "client custom POIs must remain intact" requirement). */
  readonly allowedSources: readonly PoiSourceType[];
  readonly supportsManualContent: boolean;
  readonly supportsNearbySearch: boolean;
  /** Present only for entries that support `GOOGLE_PLACES` discovery. */
  readonly googlePlaces?: PlatformCategoryGooglePlacesMapping;
}

export const PLATFORM_CATEGORY_REGISTRY: Readonly<Record<ReleasedPlatformCategoryId, PlatformCategoryRegistryEntry>> = {
  platcat_restaurant: {
    platformCategoryId: 'platcat_restaurant',
    key: 'RESTAURANT',
    label: 'Restaurant',
    icon: 'FOOD',
    status: 'ACTIVE',
    allowedSources: ['CLIENT_CUSTOM', 'GOOGLE_PLACES'],
    supportsManualContent: true,
    supportsNearbySearch: true,
    googlePlaces: { includedTypes: ['restaurant'] },
  },
};

/** Safe lookup by an untrusted/arbitrary string (e.g. a stored `Category.platformCategoryId`) — returns `undefined` rather than throwing for any value not in the registry. */
export function getPlatformCategoryRegistryEntry(platformCategoryId: string): PlatformCategoryRegistryEntry | undefined {
  return (PLATFORM_CATEGORY_REGISTRY as Readonly<Record<string, PlatformCategoryRegistryEntry | undefined>>)[platformCategoryId];
}

/** Every currently-released (`status: 'ACTIVE'`) platform category — what a Client Admin's category-linking dropdown offers (never the full registry, which may also hold `RETIRED` entries once a future checkpoint adds one). */
export function listActivePlatformCategories(): readonly PlatformCategoryRegistryEntry[] {
  return Object.values(PLATFORM_CATEGORY_REGISTRY).filter((entry) => entry.status === 'ACTIVE');
}

/** Whether a resolved registry entry currently supports Google Places discovery/import — the single check both the discover and import API routes, and the Discover Places UI's category-eligibility filter, share. */
export function platformCategorySupportsGooglePlaces(entry: PlatformCategoryRegistryEntry | undefined): boolean {
  return entry !== undefined && entry.status === 'ACTIVE' && entry.allowedSources.includes('GOOGLE_PLACES');
}

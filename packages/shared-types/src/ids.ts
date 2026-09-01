/**
 * A nominal/branded string type, used to keep distinct ID kinds from being
 * accidentally interchanged (e.g. a CustomerId used where a MapId is
 * expected).
 */
export type Branded<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

/**
 * ID prefixes, shared with packages/validation so the "cust_"/"map_" literal
 * is defined exactly once. Actual ID *generation* is trusted-backend-only
 * (checkpoint 1A.5, the `registerClient` provisioning function) — this
 * package only defines the identity/branding, never generates IDs.
 * See docs/stages/STAGE_1A_TECHNICAL_PLAN.md §7.
 */
export const CUSTOMER_ID_PREFIX = 'cust_' as const;
export const MAP_ID_PREFIX = 'map_' as const;
export const CATEGORY_ID_PREFIX = 'cat_' as const;
export const POI_ID_PREFIX = 'poi_' as const;
/** checkpoint 1B.5 — see `MenuItem` (./menu-item.js). */
export const MENU_ITEM_ID_PREFIX = 'menu_' as const;
/** checkpoint 1B.8 — see `MapPublicationSnapshot` (./publication.js). */
export const PUBLICATION_ID_PREFIX = 'pub_' as const;
/** checkpoint 1B.11 — see `Page` (./page.js). */
export const PAGE_ID_PREFIX = 'page_' as const;

export type CustomerId = Branded<string, 'CustomerId'>;
export type MapId = Branded<string, 'MapId'>;
export type CategoryId = Branded<string, 'CategoryId'>;
export type PoiId = Branded<string, 'PoiId'>;
export type MenuItemId = Branded<string, 'MenuItemId'>;
export type PublicationId = Branded<string, 'PublicationId'>;
export type PageId = Branded<string, 'PageId'>;

/**
 * Firebase Authentication UID. Deliberately branded but otherwise treated as
 * an opaque string here — format/length validation lives in
 * packages/validation and does not assume one exact generated length (see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §7).
 */
export type Uid = Branded<string, 'Uid'>;

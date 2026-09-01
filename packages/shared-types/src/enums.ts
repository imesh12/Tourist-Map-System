/**
 * Phase 1A enums, exactly as defined in
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8. Each is expressed as a
 * `readonly` const array plus a derived union type, so
 * packages/validation can build `z.enum(...)` schemas directly from the
 * same array instead of re-declaring the literal list — one source of
 * truth for both the compile-time type and the runtime schema.
 *
 * Do not add enum values beyond what the technical plan defines for Phase
 * 1A without updating that document first.
 */

export const CLIENT_TYPES = [
  'RAILWAY',
  'HOTEL',
  'MUNICIPALITY',
  'TOURISM_ORGANIZATION',
  'SHOPPING_FACILITY',
  'OTHER',
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const CUSTOMER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const PROVISIONING_STATUSES = ['PENDING', 'COMPLETE', 'FAILED'] as const;
export type ProvisioningStatus = (typeof PROVISIONING_STATUSES)[number];

/**
 * Full platform role model. `SUPER_ADMIN` is part of this type because it is
 * part of the platform authorization model (Stage 3) — but Phase 1A client
 * registration must never be able to assign it. See
 * `CLIENT_ASSIGNABLE_ROLES` below: the registration input schema in
 * packages/validation has no `role` field at all, so this is enforced by
 * omission, not by a runtime check on an untrusted value.
 */
export const ROLES = ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_EDITOR'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles a Phase 1A client-facing flow is ever allowed to end up with.
 * `SUPER_ADMIN` is deliberately excluded — it can only be assigned by
 * trusted backend code outside of any client-initiated flow (Stage 3).
 */
export const CLIENT_ASSIGNABLE_ROLES = ['CLIENT_ADMIN', 'CLIENT_EDITOR'] as const;
export type ClientAssignableRole = (typeof CLIENT_ASSIGNABLE_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MAP_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];

export const LANGUAGES = ['EN', 'JA', 'ZH_CN', 'KO'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'EN';

export const MAP_PROVIDER_NAMES = ['GOOGLE_MAPS', 'MAPBOX'] as const;
export type MapProviderName = (typeof MAP_PROVIDER_NAMES)[number];

export const MAP_STYLES = ['ROAD', 'SATELLITE', 'HYBRID', 'TERRAIN', 'CUSTOM'] as const;
export type MapStyle = (typeof MAP_STYLES)[number];

export const MAP_AREA_TYPES = ['BOUNDED', 'UNBOUNDED'] as const;
export type MapAreaType = (typeof MAP_AREA_TYPES)[number];

/**
 * `MapTheme.preset` — checkpoint 1B.7, see docs/architecture/MAP_THEME_ARCHITECTURE.md.
 * Deliberately a DIFFERENT concept from `MapStyle` above (which selects the
 * provider's base map TYPE — road/satellite/hybrid/terrain — and is
 * unrelated to POI-clutter visibility or color). A theme preset instead
 * selects a bundle of `MapTheme.visibility`/`colors`/`markerStyle` defaults:
 *
 * - `STANDARD` — closest to the provider's own defaults (all default POI
 *   categories visible).
 * - `TOURIST_CLEAN` — this checkpoint's main goal: suppresses default
 *   business/school/hospital clutter while keeping roads, transit,
 *   geography, and OUR OWN categories/POIs visually dominant.
 * - `LIGHT` — a light, neutral palette variant.
 * - `MINIMAL` — the strongest suppression of provider POIs/labels.
 *
 * No `CUSTOM` value: per the checkpoint's own explicit guidance, selecting
 * a preset only ever POPULATES a starting `visibility`/`colors`/
 * `markerStyle` — it does not lock those fields. A Client Admin may still
 * hand-edit any individual visibility/color/marker field afterward while
 * the preset name stays exactly as selected; nothing auto-relabels the
 * theme as "CUSTOM". This keeps the model a plain, always-valid value
 * object with no extra "is this preset now dirty" state machine to get
 * wrong — see that doc's own "Preset Behavior" section for the full
 * reasoning.
 */
export const MAP_THEME_PRESETS = ['STANDARD', 'TOURIST_CLEAN', 'LIGHT', 'MINIMAL'] as const;
export type MapThemePreset = (typeof MAP_THEME_PRESETS)[number];

/**
 * `MapTheme.markerStyle.style` — checkpoint 1B.7. A foundation for OUR OWN
 * POI marker visual style (§10 of the checkpoint) — a plain teardrop pin, or
 * a simple filled dot/circle. Deliberately just these two for now; the
 * admin preview does not yet render actual tenant POI markers at all (see
 * that doc's own "Own POI Markers" section), so this value currently has no
 * renderer consuming it yet — it exists so the theme model has a settled
 * shape once one does, without a breaking schema change later.
 */
export const MAP_MARKER_STYLES = ['PIN', 'DOT'] as const;
export type MapMarkerStyle = (typeof MAP_MARKER_STYLES)[number];

/** `MapTheme.markerStyle.size` — checkpoint 1B.7. See `MAP_MARKER_STYLES`'s own doc comment — same "foundation, no renderer yet" status. */
export const MAP_MARKER_SIZES = ['SMALL', 'MEDIUM', 'LARGE'] as const;
export type MapMarkerSize = (typeof MAP_MARKER_SIZES)[number];

/**
 * Controlled category icon identifiers — checkpoint 1B.2, see
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md. A fixed, small, semantic set (not
 * arbitrary SVG markup, HTML, or a remote icon URL) — the actual glyph/asset
 * per identifier is an admin-web UI concern, not a domain concept. Extend
 * this list deliberately, not per-client.
 */
export const CATEGORY_ICONS = [
  'FOOD',
  'SHOPPING',
  'SIGHTSEEING',
  'HOTEL',
  'STATION',
  'MUSEUM',
  'NATURE',
  'ACTIVITY',
  'INFORMATION',
  'OTHER',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

/**
 * Where a tenant's `Category` document originated — Category CMS
 * architecture checkpoint, see docs/architecture/CATEGORY_ARCHITECTURE.md.
 *
 * - `CLIENT_CUSTOM` — created directly by a Client Admin. The only value
 *   any category can have today: no Super Admin platform-category release
 *   mechanism exists yet (see `PlatformCategoryDefinition` in
 *   ./platform-category.js, types-only, no Firestore consumer).
 * - `PLATFORM` — the tenant enabled a Super Admin-released platform
 *   category (`platformCategoryId` links to it). Reserved for that future
 *   flow; nothing in the current codebase ever produces this value.
 *
 * Optional on `Category` (see ./category.js) specifically so every
 * category document written before this field existed remains valid
 * without a migration — absence is not ambiguous, it just predates this
 * distinction and is treated as `CLIENT_CUSTOM` by any code that cares.
 */
export const CATEGORY_SOURCE_TYPES = ['PLATFORM', 'CLIENT_CUSTOM'] as const;
export type CategorySourceType = (typeof CATEGORY_SOURCE_TYPES)[number];

/**
 * Where a `Poi` document's content originated — checkpoint 1B.3, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md's POI section. Mirrors
 * `CategorySourceType`'s "reserve the future value now, produce only the
 * current one" shape:
 *
 * - `CLIENT_CUSTOM` — entered manually by a Client Admin. The only value
 *   any POI has today.
 * - `GOOGLE_PLACES` — reserved for a future sync from the Google Places
 *   API (§18 of the 1B.3 checkpoint). Nothing in this codebase ever
 *   produces this value yet — no Places API call exists anywhere here.
 *
 * Deliberately NOT including `MUNICIPAL_API`/`TOURISM_API` in this runtime
 * enum yet (unlike the two values above, no concrete integration for either
 * has been designed even at the type level) — they remain documentation-only
 * in the checkpoint's own future-source list until a real checkpoint defines
 * their shape.
 */
export const POI_SOURCE_TYPES = ['CLIENT_CUSTOM', 'GOOGLE_PLACES'] as const;
export type PoiSourceType = (typeof POI_SOURCE_TYPES)[number];

/**
 * A POI's visibility state — checkpoint 1B.3. Unlike `Category.enabled`
 * (a boolean, checkpoint 1B.2), POIs use an explicit canonical enum per the
 * checkpoint's own instruction ("status: canonical enum") — unlike a
 * category's simple on/off toggle, `Poi.status` is the field a later POI
 * source-merge (client custom + Google Places, §18) will need to widen
 * (e.g. a future `PENDING_REVIEW`), so it is modeled as an enum from the
 * start rather than a boolean that would need a breaking type change later.
 * Disabling a POI never deletes it (§5) — the document remains stored,
 * simply excluded from any future public-facing rendering.
 */
export const POI_STATUSES = ['ENABLED', 'DISABLED'] as const;
export type PoiStatus = (typeof POI_STATUSES)[number];

/**
 * A Page's visibility state — checkpoint 1B.11, see ./page.js. Mirrors
 * `PoiStatus`'s exact shape (its own doc comment's precedent: "separate
 * small enum per domain concept," even where the values happen to be
 * identical to another enum's). Disabling a Page never deletes it — the
 * document remains stored, simply excluded from `buildPublicationContent()`
 * and from any `PAGE` menu item's public projection until re-enabled.
 */
export const PAGE_STATUSES = ['ENABLED', 'DISABLED'] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

/**
 * Which external service authored a `sourceType: 'GOOGLE_PLACES'` POI's
 * content — checkpoint 1B.4. Only meaningful alongside that `sourceType`;
 * a `CLIENT_CUSTOM` POI's `provider`/`providerPlaceId` are always absent
 * (see `Poi`'s doc comment in ./poi.js). Modeled as its own small enum
 * (rather than reusing `PoiSourceType` for both concerns) because a single
 * external source library — Google — will eventually need to back more than
 * one `PoiSourceType` value (e.g. a future Event source), so "which service"
 * and "what kind of content" are kept as two separate, independently
 * extensible questions from the start.
 */
export const POI_PROVIDERS = ['GOOGLE'] as const;
export type PoiProvider = (typeof POI_PROVIDERS)[number];

/**
 * `MenuItem.type` — checkpoint 1B.5, see docs/architecture/CATEGORY_ARCHITECTURE.md
 * §12. A menu item is either a `CATEGORY`-backed item (references an
 * existing tenant `Category`) or a `FEATURE`-backed item (references a
 * released entry in `PUBLIC_FEATURE_REGISTRY`, ./public-feature.js) —
 * never both, never neither. Modeled as a real discriminated union at both
 * the shared-types level (`MenuItem`, ./menu-item.js) and the validation
 * level (`menuItemSchema`, packages/validation/src/menu-item.ts), not just
 * "two optional fields on one flat interface" — the checkpoint's own
 * instruction is explicit: "Do not support malformed mixed states."
 */
/**
 * checkpoint 1B.11 — extended with `PAGE`: a menu item may now also link to
 * a map-scoped informational `Page` (./page.js), a THIRD, independent
 * discriminated-union branch alongside `CATEGORY`/`FEATURE` — never encoded
 * as a `FEATURE` (a Page is tenant content, not a platform-registered
 * capability) and never as a fake `Category` (a Page creates no map marker
 * and has no `icon`/`enabled`/`order` taxonomy fields). See shared-types'
 * `MenuItem` (./menu-item.js) and `packages/validation/src/menu-item.ts`'s
 * `menuItemSchema`/`menuItemCreateInputSchema` discriminated unions for the
 * enforced shape.
 */
export const MENU_ITEM_TYPES = ['CATEGORY', 'FEATURE', 'PAGE'] as const;
export type MenuItemType = (typeof MENU_ITEM_TYPES)[number];

/**
 * A menu item's public-navigation visibility state — checkpoint 1B.5.
 * Deliberately its own enum (not a reuse of `PoiStatus`, even though the
 * values happen to be identical today) — the same "separate small enum per
 * domain concept" precedent `PoiProvider`'s own doc comment already
 * establishes, so a future divergence (e.g. a menu-item-specific status
 * value) never has to fight POI's own status vocabulary. `DISABLED` means
 * "stored, but excluded from `buildPublicMenuProjection()`'s output" — never
 * a delete (§15 of the checkpoint: "Disable != delete").
 */
export const MENU_ITEM_STATUSES = ['ENABLED', 'DISABLED'] as const;
export type MenuItemStatus = (typeof MENU_ITEM_STATUSES)[number];

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

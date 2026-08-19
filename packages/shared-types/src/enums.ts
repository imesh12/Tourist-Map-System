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

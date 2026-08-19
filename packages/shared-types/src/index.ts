/**
 * packages/shared-types
 *
 * Framework-agnostic domain types and enums, shared by admin-web, tourist-web,
 * and firebase/functions. This package must remain dependency-free (see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §2) so it can be imported from any
 * runtime without bundling or dependency-version concerns.
 *
 * Phase 1A.1 scope: package skeleton only, to prove the workspace wiring
 * (build, typecheck, cross-package import) works end to end.
 *
 * The real domain model — Customer, User, Map, and the Phase 1A enums
 * (ClientType, CustomerStatus, ProvisioningStatus, Role, UserStatus,
 * MapStatus, Language, MapProviderName, MapStyle, MapAreaType) — is defined
 * in checkpoint 1A.2 ("Shared domain foundation") per
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8 and §23. Intentionally not
 * implemented here yet.
 */

/** A nominal/branded string type, used to keep distinct ID kinds from being
 * accidentally interchanged (e.g. a CustomerId used where a MapId is
 * expected). Utility only — no domain-specific brands are declared yet. */
export type Branded<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export const SHARED_TYPES_PACKAGE_READY = true;

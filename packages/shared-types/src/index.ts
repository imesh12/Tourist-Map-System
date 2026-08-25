/**
 * packages/shared-types
 *
 * Framework-agnostic domain types and enums, shared by admin-web,
 * tourist-web, and firebase/functions. Zero runtime dependencies by design
 * (see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §2/§14) — everything exported
 * here is a compile-time-only type, a `const` literal array, or a plain
 * branded-string alias. No Firebase SDK objects, no secrets, no UI state,
 * and no persistence/validation logic belong in this package.
 *
 * Phase 1A domain model only: Customer, User, TouristMap, and their
 * supporting IDs/enums/timestamp shape, per
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8. Later-phase concepts (Place,
 * Category, Translation, Event, LiveCamera, PublishedMapConfig, …) are
 * intentionally not defined here yet. `MapTheme` (checkpoint 1B.7, see
 * docs/architecture/MAP_THEME_ARCHITECTURE.md) is the one exception: a
 * per-map, provider-neutral visual theme, distinct from the future
 * platform-level Super Admin "themes"/"mapStyles" catalog collections
 * SYSTEM_BLUEPRINT.md §12 reserves for Stage 3 — see that file's own doc
 * comment for the distinction.
 */

export * from './timestamp.js';
export * from './ids.js';
export * from './enums.js';
export * from './customer.js';
export * from './user.js';
export * from './map.js';
export * from './map-theme-presets.js';
export * from './category.js';
export * from './platform-category.js';
export * from './poi.js';
export * from './public-feature.js';
export * from './menu-item.js';

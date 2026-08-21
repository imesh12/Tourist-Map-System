/**
 * packages/validation
 *
 * Zod schemas for anything that crosses a trust boundary in the Tourist Map
 * System, plus defense-in-depth schemas mirroring the Phase 1A Firestore
 * document shapes. Imported by admin-web for client-side pre-validation and
 * by firebase/functions for authoritative server-side validation — see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §14.
 *
 * Server-side validation remains authoritative in all cases; client-side use
 * of these same schemas is a UX convenience only.
 *
 * Phase 1A scope: registration input, login input (checkpoint 1A.4), and the
 * Customer/User/TouristMap document schemas. Firebase Auth calls, Firestore
 * access, and the actual `registerClient` provisioning logic live outside
 * this package (in `apps/admin-web` and `firebase/functions` respectively) —
 * see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §23.
 */

export * from './timestamp.js';
export * from './ids.js';
export * from './registration.js';
export * from './login.js';
export * from './customer.js';
export * from './user.js';
export * from './map.js';
export * from './branding.js';
export * from './map-settings.js';
export * from './category.js';
export * from './poi.js';
export * from './external-poi.js';

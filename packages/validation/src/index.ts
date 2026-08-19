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
 * Phase 1A scope only: registration input and the Customer/User/TouristMap
 * document schemas. Login input, Firebase Auth calls, Firestore access, and
 * the actual `registerClient` provisioning logic are out of scope for this
 * checkpoint (1A.2) — they belong to later checkpoints (1A.4/1A.5) per
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §23.
 */

export * from './timestamp';
export * from './ids';
export * from './registration';
export * from './customer';
export * from './user';
export * from './map';

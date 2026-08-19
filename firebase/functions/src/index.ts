/**
 * Cloud Functions entry point — Tourist Map System.
 *
 * `registerClient` (checkpoint 1A.5, docs/stages/STAGE_1A_TECHNICAL_PLAN.md
 * §10/§15) is the sole trusted tenant-provisioning boundary — Auth user
 * creation, customerId/mapId generation, the atomic Firestore batched
 * write, custom-claims assignment, compensation on failure, and idempotent
 * retry. See ./register-client.ts and ./provisioning/provision-client.ts.
 *
 * Per Amendment 2 (approved alongside the Phase 1A plan): an hourly
 * scheduled reconciliation function was originally planned as part of
 * Phase 1A but is now explicitly DEFERRED — not implemented in the initial
 * Phase 1A build. Phase 1A instead relies on `registerClient`'s
 * idempotency, its compensation-on-thrown-error behavior, and detectable
 * provisioning states (`customers/{customerId}.provisioning.status`) to
 * avoid unusable half-created tenants. The reconciliation design remains
 * documented in docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10 and should only
 * be implemented later if testing or real operational experience
 * demonstrates it is actually needed.
 */

export { registerClient } from './register-client.js';

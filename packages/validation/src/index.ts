/**
 * packages/validation
 *
 * Zod schemas for anything that crosses a trust boundary in the Tourist Map
 * System: registration input, login input, and (from 1A.5 onward) the
 * Firestore document shapes written by the tenant-provisioning Cloud
 * Function. Imported by admin-web for client-side pre-validation and by
 * firebase/functions for authoritative server-side validation — see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §14.
 *
 * Phase 1A.1 scope: package skeleton only, to prove the workspace wiring
 * (build, typecheck, cross-package import of `shared-types`) works end to
 * end. Registration/login schemas are added in checkpoint 1A.2 per
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §23. Intentionally not implemented
 * here yet.
 */
import { z } from 'zod';
import { SHARED_TYPES_PACKAGE_READY } from 'shared-types';

// Placeholder schema proving the zod + shared-types wiring compiles.
// Replaced by real registration/login schemas in checkpoint 1A.2.
export const placeholderSchema = z.object({
  ok: z.literal(SHARED_TYPES_PACKAGE_READY),
});

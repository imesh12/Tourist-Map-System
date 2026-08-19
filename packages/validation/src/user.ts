import { z } from 'zod';
import { ROLES, USER_STATUSES } from 'shared-types';
import { customerIdSchema, uidSchema } from './ids.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * Mirrors shared-types' `User` interface. `role` accepts the full `ROLES`
 * union (including `SUPER_ADMIN`) because a *stored* user document may
 * legitimately be a Super Admin once Stage 3 exists — the invariant this
 * checkpoint enforces is that client *registration* can never produce one
 * (see registration.ts, which has no `role` field at all), not that this
 * general-purpose document schema should reject the value entirely.
 * See docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8/§9/§14.
 */
export const userSchema = z.object({
  uid: uidSchema,
  customerId: customerIdSchema,
  role: z.enum(ROLES),
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(1).max(200),
  status: z.enum(USER_STATUSES),
  createdAt: firestoreTimestampLikeSchema,
  updatedAt: firestoreTimestampLikeSchema,
});

export type UserParsed = z.infer<typeof userSchema>;

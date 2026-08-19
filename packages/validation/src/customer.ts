import { z } from 'zod';
import { CLIENT_TYPES, CUSTOMER_STATUSES, PROVISIONING_STATUSES } from 'shared-types';
import { customerIdSchema } from './ids';
import { firestoreTimestampLikeSchema } from './timestamp';

/**
 * Mirrors shared-types' `Customer` interface for defense-in-depth validation
 * before the provisioning function writes a `customers/{customerId}`
 * document (checkpoint 1A.5) — see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8/§14. Server-side validation
 * remains authoritative regardless of what a client may have pre-validated.
 */
export const customerSchema = z.object({
  customerId: customerIdSchema,
  companyName: z.string().trim().min(1).max(200),
  clientType: z.enum(CLIENT_TYPES),
  status: z.enum(CUSTOMER_STATUSES),
  primaryContactName: z.string().trim().min(1).max(200),
  primaryContactEmail: z.string().trim().toLowerCase().email().max(254),
  provisioning: z.object({
    status: z.enum(PROVISIONING_STATUSES),
    startedAt: firestoreTimestampLikeSchema,
    completedAt: firestoreTimestampLikeSchema.optional(),
    lastError: z.string().max(2000).optional(),
  }),
  createdAt: firestoreTimestampLikeSchema,
  updatedAt: firestoreTimestampLikeSchema,
});

export type CustomerParsed = z.infer<typeof customerSchema>;

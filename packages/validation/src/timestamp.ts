import { z } from 'zod';

/**
 * Runtime shape check matching shared-types' `FirestoreTimestampLike`.
 * Defined once here and reused by every schema below rather than repeated
 * inline.
 */
export const firestoreTimestampLikeSchema = z.object({
  seconds: z.number(),
  nanoseconds: z.number(),
});

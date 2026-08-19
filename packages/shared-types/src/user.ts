import type { CustomerId, Uid } from './ids.js';
import type { Role, UserStatus } from './enums.js';
import type { FirestoreTimestampLike } from './timestamp.js';

/**
 * `users/{uid}` — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8.
 *
 * `role` and `customerId` are written exclusively by trusted backend code.
 * If either of these ever appears in client-submitted input, it must never
 * be trusted — see packages/validation's registration schema, which has no
 * `role` or `customerId` field at all.
 */
export interface User {
  readonly uid: Uid;
  readonly customerId: CustomerId;
  readonly role: Role;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

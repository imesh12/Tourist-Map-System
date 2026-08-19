import type { CustomerId } from './ids';
import type { ClientType, CustomerStatus, ProvisioningStatus } from './enums';
import type { FirestoreTimestampLike } from './timestamp';

export interface CustomerProvisioningInfo {
  readonly status: ProvisioningStatus;
  readonly startedAt: FirestoreTimestampLike;
  readonly completedAt?: FirestoreTimestampLike;
  readonly lastError?: string;
}

/**
 * `customers/{customerId}` — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8.
 *
 * Every field is written exclusively by trusted backend code (the
 * `registerClient` provisioning function, and later Super Admin). None of
 * these fields — especially `customerId` and `status` — are ever
 * client-writable in Phase 1A.
 */
export interface Customer {
  readonly customerId: CustomerId;
  readonly companyName: string;
  readonly clientType: ClientType;
  readonly status: CustomerStatus;
  readonly primaryContactName: string;
  readonly primaryContactEmail: string;
  readonly provisioning: CustomerProvisioningInfo;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

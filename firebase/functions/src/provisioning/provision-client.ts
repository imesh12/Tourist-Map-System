import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { CustomerId, MapId, Role } from 'shared-types';
import type { RegistrationInput } from 'validation';

/**
 * The trusted tenant-provisioning core — checkpoint 1A.5, implementing
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10 in full. This is the ONLY code
 * that is ever permitted to create `customers/*`, `users/*`, `maps/*`
 * documents or assign a role/customerId to a Firebase Auth user — the
 * browser can never reach this directly; only `register-client.ts`'s
 * `onCall` wrapper invokes it, after validating input through
 * `registrationInputSchema` (which has no `role`/`customerId`/`mapId`/
 * `status` field at all — see packages/validation/src/registration.ts).
 *
 * Kept separate from the `onCall` wrapper specifically so it can be tested
 * directly against the Auth + Firestore emulators (via the real Admin SDK)
 * without needing the Callable HTTPS transport itself — see
 * test/provisioning/provision-client.test.ts.
 */

const CLIENT_ADMIN_ROLE: Role = 'CLIENT_ADMIN';

export type ProvisioningErrorCode = 'provisioning/duplicate-email' | 'provisioning/failed';

export class ProvisioningError extends Error {
  readonly code: ProvisioningErrorCode;

  constructor(code: ProvisioningErrorCode, message: string) {
    super(message);
    this.name = 'ProvisioningError';
    this.code = code;
  }
}

export interface ProvisionClientDeps {
  readonly auth: Auth;
  readonly firestore: Firestore;
  /** Trusted-backend-only ID generation — see ../ids.ts. */
  readonly generateCustomerId: () => CustomerId;
  readonly generateMapId: () => MapId;
  /**
   * Defaults to `auth.setCustomUserClaims`. Overridable ONLY so tests can
   * inject a failure at this exact step to verify compensation (see
   * test/provisioning/provision-client.test.ts's "compensation" case) —
   * `register-client.ts`, the only production caller, never overrides this.
   */
  readonly setCustomClaims?: (uid: string, claims: Record<string, unknown>) => Promise<void>;
}

export interface ProvisionClientResult {
  readonly customerId: CustomerId;
  readonly mapId: MapId;
}

function isUserNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'auth/user-not-found';
}

/**
 * Provisions a brand-new tenant, or safely resumes an interrupted prior
 * attempt for the same email — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md
 * §10 ("Idempotency by email") for the full rationale. This function never
 * throws Firebase's own raw errors to its caller — only `ProvisioningError`
 * (safe code + message) or a generic rethrow of an unexpected error, both of
 * which `register-client.ts` maps to a structured `HttpsError`.
 */
export async function provisionClient(input: RegistrationInput, deps: ProvisionClientDeps): Promise<ProvisionClientResult> {
  const { auth, firestore, generateCustomerId, generateMapId } = deps;
  const setCustomClaims = deps.setCustomClaims ?? ((uid, claims) => auth.setCustomUserClaims(uid, claims));

  const email = input.email;

  // --- Idempotency check (§10): does an Auth user for this email already exist? ---
  let existingUserRecord: Awaited<ReturnType<Auth['getUserByEmail']>> | undefined;
  try {
    existingUserRecord = await auth.getUserByEmail(email);
  } catch (error) {
    if (!isUserNotFoundError(error)) {
      throw new ProvisioningError('provisioning/failed', 'Registration could not be completed. Please try again.');
    }
  }

  let uid: string;
  let createdAuthUserThisInvocation = false;
  let reuseCustomerId: CustomerId | undefined;
  let reuseMapId: MapId | undefined;
  let userDocAlreadyExists = false;
  let customerDocAlreadyExists = false;
  let mapDocAlreadyExists = false;

  if (existingUserRecord) {
    uid = existingUserRecord.uid;
    const existingUserDoc = await firestore.doc(`users/${uid}`).get();
    userDocAlreadyExists = existingUserDoc.exists;

    if (existingUserDoc.exists) {
      const existingCustomerId = existingUserDoc.data()?.customerId as CustomerId | undefined;
      if (existingCustomerId) {
        const existingCustomerDoc = await firestore.doc(`customers/${existingCustomerId}`).get();
        const existingStatus = (existingCustomerDoc.data()?.provisioning as { status?: string } | undefined)?.status;

        if (existingCustomerDoc.exists && existingStatus === 'COMPLETE') {
          // Genuinely already fully provisioned — this is a real duplicate
          // registration attempt for an active account, not an interrupted
          // one. No side effects have occurred yet; safe to reject outright.
          throw new ProvisioningError(
            'provisioning/duplicate-email',
            'An account with this email already exists. Please sign in instead.',
          );
        }

        reuseCustomerId = existingCustomerId;
        customerDocAlreadyExists = existingCustomerDoc.exists;

        // checkpoint 1B.6: this `.limit(1)` lookup is idempotency-by-email
        // retry-resume ONLY — "did an earlier, interrupted attempt for this
        // SAME email already create a map for this customer, which this
        // retry should reuse rather than duplicate" — never a general
        // "a customer may have at most one map" constraint. A tenant is free
        // to own additional maps afterward via `POST /api/maps`
        // (apps/admin-web/app/api/maps/route.ts); this function only ever
        // concerns itself with the FIRST map created during registration.
        const existingMaps = await firestore.collection('maps').where('customerId', '==', existingCustomerId).limit(1).get();
        if (!existingMaps.empty) {
          reuseMapId = existingMaps.docs[0]!.id as MapId;
          mapDocAlreadyExists = true;
        }
      }
    }
    // else: an Auth user exists with no `users/{uid}` doc at all — the
    // "process killed between createUser and the batch" gap described in
    // §10. Treated identically to a fresh registration from here on, except
    // `createUser` is skipped and the existing uid is reused.
  } else {
    const created = await auth.createUser({ email, password: input.password, displayName: input.contactName });
    uid = created.uid;
    createdAuthUserThisInvocation = true;
  }

  const customerId = reuseCustomerId ?? generateCustomerId();
  const mapId = reuseMapId ?? generateMapId();

  const customerRef = firestore.doc(`customers/${customerId}`);
  const userRef = firestore.doc(`users/${uid}`);
  const mapRef = firestore.doc(`maps/${mapId}`);
  const mapName = input.initialMapName ?? `${input.companyName} Tourist Map`;

  async function rollbackFirestoreDocs(): Promise<void> {
    try {
      const cleanupBatch = firestore.batch();
      cleanupBatch.delete(customerRef);
      cleanupBatch.delete(userRef);
      cleanupBatch.delete(mapRef);
      await cleanupBatch.commit();
    } catch {
      // Best-effort: if the rollback itself fails, fall through — the
      // caller's catch block still compensates the Auth user (if this
      // invocation created it) and returns a safe error either way. A
      // residual Firestore doc in this rare double-failure case is a known,
      // accepted residual risk — see §10/§24 (deferred reconciliation).
    }
  }

  try {
    const provisionBatch = firestore.batch();

    provisionBatch.set(
      customerRef,
      {
        customerId,
        companyName: input.companyName,
        clientType: input.clientType,
        status: 'ACTIVE',
        primaryContactName: input.contactName,
        primaryContactEmail: email,
        // Every (re)attempt resets provisioning to a fresh PENDING — a retry
        // is a new attempt, and any stale `lastError` from a prior failed
        // attempt should not linger once a new attempt is underway.
        provisioning: { status: 'PENDING', startedAt: FieldValue.serverTimestamp() },
        // createdAt is immutable (see docs/stages/STAGE_1A_TECHNICAL_PLAN.md
        // §8) — only set it the first time this document is created, never
        // overwrite it on a retry that reuses an existing doc.
        ...(customerDocAlreadyExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    provisionBatch.set(
      userRef,
      {
        uid,
        customerId,
        role: CLIENT_ADMIN_ROLE,
        email,
        displayName: input.contactName,
        status: 'ACTIVE',
        ...(userDocAlreadyExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    provisionBatch.set(
      mapRef,
      {
        mapId,
        customerId,
        name: mapName,
        status: 'DRAFT',
        defaultLanguage: 'EN',
        enabledLanguages: ['EN'],
        mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
        area: { type: 'UNBOUNDED' },
        ...(mapDocAlreadyExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await provisionBatch.commit();

    try {
      // Custom claims are the only thing every server-side authorization
      // check ever trusts for identity/role (§6) — set only here, only
      // after the Firestore docs they describe actually exist.
      await setCustomClaims(uid, { customerId, role: CLIENT_ADMIN_ROLE });

      // Dotted field paths so this only touches `provisioning.status`/
      // `.completedAt` — NOT a full-map overwrite, which would otherwise
      // clobber the `startedAt` just written above in the same batch.
      await customerRef.update({
        'provisioning.status': 'COMPLETE',
        'provisioning.completedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await rollbackFirestoreDocs();
      throw error;
    }
  } catch (error) {
    // Compensation (§10): a *fresh* Auth user created by this invocation is
    // deleted on any later failure, so a caught error never leaves an
    // orphaned Auth user with no Firestore docs. A *reused* (retry) Auth
    // user is left alone — it wasn't created by this call, and the
    // just-attempted rollback above already returns Firestore to a clean
    // "orphan Auth user, no docs" state that a future retry can safely
    // resume from from scratch (fresh customerId/mapId).
    if (createdAuthUserThisInvocation) {
      try {
        await auth.deleteUser(uid);
      } catch {
        // Best-effort — the primary error is still surfaced below. A
        // residual Auth user here is the same accepted residual risk noted
        // in §10/§24 for the true-crash case (reconciliation deferred).
      }
    }

    if (error instanceof ProvisioningError) {
      throw error;
    }
    throw new ProvisioningError('provisioning/failed', 'Registration could not be completed. Please try again.');
  }

  return { customerId, mapId };
}

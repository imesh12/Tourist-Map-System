import { cache } from 'react';
import type { ClientAssignableRole } from 'shared-types';
import { CLIENT_ASSIGNABLE_ROLES } from 'shared-types';
import { customerSchema, userSchema, type CustomerParsed, type UserParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';
import { verifySession } from '../auth/verify-session';

/**
 * Authenticated TENANT IDENTITY resolution — checkpoint 1B.6 §4, replacing
 * checkpoint 1A.8/1A.10's `lib/tenant/client-context.ts`.
 *
 * Through checkpoint 1B.5, this module (as `client-context.ts`) also
 * resolved "the tenant's one map" in the same step, because Phase 1B never
 * needed to distinguish the two: a customer had exactly one map, so
 * authenticating AS a tenant and selecting THE map were the same operation.
 * Checkpoint 1B.6 breaks that coupling on purpose (§4: "authentication
 * establishes uid/role/customerId/customer-user info but does NOT
 * permanently bind the session to one map") — a customer may now own zero,
 * one, or many `maps/{mapId}` documents, so "who is this tenant" and "which
 * map are they working on right now" have to be resolved separately.
 *
 * This module answers ONLY the first question. It is the direct successor
 * of `resolveClientContext()`'s identity-resolution half — same
 * `verifySession()` → claims → `users/{uid}` → `customers/{customerId}`
 * chain, same fail-closed treatment of every missing/malformed/inconsistent
 * document, same `cache()`-wrapping so `/admin/**` layouts and pages can all
 * call it independently within one request's render pass without repeating
 * the underlying Firestore reads — but it stops at the customer, and never
 * touches `maps/*` at all. Map ownership is `lib/tenant/map-context.ts`'s
 * job now (`getOwnedMapContext(mapId)`), built on top of this module rather
 * than duplicating it.
 */

export type TenantIdentityDenialReason =
  | 'no_session'
  | 'missing_claims'
  | 'invalid_role'
  | 'user_doc_missing'
  | 'user_doc_invalid'
  | 'user_mismatch'
  | 'customer_doc_missing'
  | 'customer_doc_invalid'
  | 'customer_mismatch'
  | 'provisioning_incomplete';

export interface TenantIdentity {
  readonly uid: string;
  readonly email: string | null;
  readonly role: ClientAssignableRole;
  // `*Parsed` (validation's Zod-inferred output types) — the types that come
  // with an actual runtime-validation guarantee, same reasoning the old
  // `ClientContext` documented.
  readonly user: UserParsed;
  readonly customer: CustomerParsed;
}

export type TenantIdentityResult =
  | { readonly ok: true; readonly identity: TenantIdentity }
  | {
      readonly ok: false;
      readonly reason: TenantIdentityDenialReason;
      /** Only populated for `reason === 'provisioning_incomplete'`. */
      readonly provisioningStatus?: 'PENDING' | 'FAILED';
    };

function denied(reason: TenantIdentityDenialReason, provisioningStatus?: 'PENDING' | 'FAILED'): TenantIdentityResult {
  // Diagnostic-code-only logging (never document contents, never a
  // token/cookie value) — same convention the old `client-context.ts`
  // established.
  console.info(JSON.stringify({ event: 'tenant.identity.denied', reason, provisioningStatus: provisioningStatus ?? null }));
  return provisioningStatus ? { ok: false, reason, provisioningStatus } : { ok: false, reason };
}

function isClientAssignableRole(value: string): value is ClientAssignableRole {
  return (CLIENT_ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

async function resolveTenantIdentity(): Promise<TenantIdentityResult> {
  const { session } = await verifySession();
  if (!session) {
    // Should not normally be reachable — the `(protected)` layout already
    // requires a verified session before any page under it renders. Handled
    // defensively rather than assumed, in case that ever changes.
    return denied('no_session');
  }

  const { uid, email, customerId, role } = session;
  if (!customerId || !role) {
    return denied('missing_claims');
  }
  if (!isClientAssignableRole(role)) {
    // Covers SUPER_ADMIN (no console exists yet — Stage 3, explicitly out
    // of scope here) and any other unexpected claim value.
    return denied('invalid_role');
  }

  const firestore = getFirebaseAdminFirestore();

  const [userSnap, customerSnap] = await Promise.all([
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`customers/${customerId}`).get(),
  ]);

  if (!userSnap.exists) {
    return denied('user_doc_missing');
  }
  const userParsed = userSchema.safeParse(userSnap.data());
  if (!userParsed.success) {
    return denied('user_doc_invalid');
  }
  const user = userParsed.data;

  // Consistency boundary: the stored doc must agree with the verified token
  // on every identity field the token also carries.
  if (user.uid !== uid || user.customerId !== customerId || user.role !== role) {
    return denied('user_mismatch');
  }

  if (!customerSnap.exists) {
    return denied('customer_doc_missing');
  }
  const customerParsed = customerSchema.safeParse(customerSnap.data());
  if (!customerParsed.success) {
    return denied('customer_doc_invalid');
  }
  const customer = customerParsed.data;

  if (customer.customerId !== customerId) {
    return denied('customer_mismatch');
  }

  if (customer.provisioning.status !== 'COMPLETE') {
    // PENDING/FAILED are the only other values PROVISIONING_STATUSES
    // allows (shared-types enums.ts) — narrowed here so the UI layer can
    // show the right copy without re-deriving it.
    return denied('provisioning_incomplete', customer.provisioning.status);
  }

  return { ok: true, identity: { uid, email, role, user, customer } };
}

/**
 * `cache()`-wrapped for the same reason checkpoint 1A.10 wrapped the old
 * `getCurrentClientContext()`: the admin shell layout, the Maps dashboard,
 * every `/admin/maps/{mapId}/**` layout/page, and old-URL redirect pages can
 * all call this independently — the natural way to consume it from a Server
 * Component tree — without each one repeating the underlying
 * `verifySession()` + Firestore reads. `cache()` dedupes by function
 * identity + arguments *within a single request's render pass only*;
 * nothing persists across requests.
 */
export const getCurrentTenantIdentity = cache(resolveTenantIdentity);

/**
 * Safe, reviewed copy for a denied `TenantIdentityResult` — shared by every
 * page that only needs tenant identity (not a specific map), so they all
 * show identical, non-leaking messaging (checkpoint 1A.8 §3, carried
 * forward: "do not expose internal Firebase errors or implementation
 * details"). Only `provisioning_incomplete` gets its own distinct message;
 * every other denial reason collapses to one generic, safe message. The
 * specific reason is only ever visible in the server-side
 * `tenant.identity.denied` log line above, never in the response.
 */
export function describeTenantIdentityDenial(result: Extract<TenantIdentityResult, { ok: false }>): {
  readonly heading: string;
  readonly message: string;
} {
  if (result.reason === 'provisioning_incomplete') {
    if (result.provisioningStatus === 'PENDING') {
      return { heading: 'Finishing setup', message: 'Your account setup is still in progress. This page will update automatically — try refreshing in a moment.' };
    }
    return {
      heading: 'Setup did not complete',
      message: 'Your account setup did not complete. Please try registering again or contact support.',
    };
  }

  return {
    heading: 'Account unavailable',
    message: 'We could not load your account. Please contact support if this continues.',
  };
}

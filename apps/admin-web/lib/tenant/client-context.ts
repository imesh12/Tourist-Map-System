import { cache } from 'react';
import type { ClientAssignableRole } from 'shared-types';
import { CLIENT_ASSIGNABLE_ROLES } from 'shared-types';
import { customerSchema, mapSchema, userSchema, type CustomerParsed, type MapParsed, type UserParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';
import { verifySession } from '../auth/verify-session';

/**
 * Authenticated tenant-context loading — checkpoint 1A.8 §2/§3/§7/§8.
 *
 * This is the ONE place `/admin` and `/admin/account` resolve "which tenant
 * is this, and is it safe to render" — so the checks below are written once
 * and reused, not reimplemented per page (per the checkpoint spec). It is
 * server-only trusted code (imports `getFirebaseAdminFirestore()`, which
 * itself asserts server-only), so its Firestore reads correctly bypass the
 * 1A.6 security rules — that's expected (Admin SDK reads always bypass
 * rules by design; see `lib/firebase/admin.ts`'s updated doc comment).
 * Tenant isolation for THESE reads is enforced explicitly here, in code,
 * using only the verified session's own claims — never a client-supplied
 * `customerId`/`mapId`/query/route param/body field.
 *
 * Every failure mode below is "fail closed": any missing/malformed/
 * inconsistent claim or document produces a denial, never a best-effort
 * partial render and never a fabricated fallback value.
 */

export type ClientContextDenialReason =
  | 'no_session'
  | 'missing_claims'
  | 'invalid_role'
  | 'user_doc_missing'
  | 'user_doc_invalid'
  | 'user_mismatch'
  | 'customer_doc_missing'
  | 'customer_doc_invalid'
  | 'customer_mismatch'
  | 'provisioning_incomplete'
  | 'map_doc_missing'
  | 'map_doc_invalid'
  | 'map_mismatch';

export interface ClientContext {
  readonly uid: string;
  readonly email: string | null;
  readonly role: ClientAssignableRole;
  // `*Parsed` (validation's Zod-inferred output types), not shared-types'
  // structural `User`/`Customer`/`TouristMap` interfaces directly — these
  // are the types that come with an actual runtime-validation guarantee
  // (userSchema/customerSchema/mapSchema.safeParse below), which is exactly
  // what §8 asks this module to enforce before anything downstream treats
  // Firestore data as trustworthy.
  readonly user: UserParsed;
  readonly customer: CustomerParsed;
  readonly map: MapParsed;
}

export type ClientContextResult =
  | { readonly ok: true; readonly context: ClientContext }
  | {
      readonly ok: false;
      readonly reason: ClientContextDenialReason;
      /** Only populated for `reason === 'provisioning_incomplete'`. */
      readonly provisioningStatus?: 'PENDING' | 'FAILED';
    };

function denied(reason: ClientContextDenialReason, provisioningStatus?: 'PENDING' | 'FAILED'): ClientContextResult {
  // Diagnostic-code-only logging (never document contents, never a
  // token/cookie value) — same convention as lib/auth/verify-session.ts and
  // docs/stages/STAGE_1A_TECHNICAL_PLAN.md §19.
  console.info(JSON.stringify({ event: 'tenant.client_context.denied', reason, provisioningStatus: provisioningStatus ?? null }));
  return provisioningStatus ? { ok: false, reason, provisioningStatus } : { ok: false, reason };
}

function isClientAssignableRole(value: string): value is ClientAssignableRole {
  return (CLIENT_ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

async function resolveClientContext(): Promise<ClientContextResult> {
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

  // Consistency boundary (§8): the stored doc must agree with the verified
  // token on every identity field the token also carries.
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
    // show the right §16 copy without re-deriving it.
    return denied('provisioning_incomplete', customer.provisioning.status);
  }

  // Map resolution (§7): the tenant model links customer → map only via a
  // shared `customerId`, not a stored `mapId` on the customer doc (see
  // packages/shared-types/src/customer.ts — no such field exists), so this
  // queries strictly by the AUTHENTICATED customerId. Never a client-
  // supplied mapId. `limit(1)` matches checkpoint 1A.5's "one initial map
  // per tenant" provisioning model (§11) — Phase 1A never creates more than
  // one.
  const mapQuery = await firestore.collection('maps').where('customerId', '==', customerId).limit(1).get();
  if (mapQuery.empty) {
    return denied('map_doc_missing');
  }
  const mapParsed = mapSchema.safeParse(mapQuery.docs[0]!.data());
  if (!mapParsed.success) {
    return denied('map_doc_invalid');
  }
  const map = mapParsed.data;

  if (map.customerId !== customerId) {
    // In practice unreachable through the query above (Firestore's own
    // `where('customerId', '==', customerId)` filter guarantees every
    // returned doc already matches — a doc whose stored `customerId` was
    // changed out from under it would simply stop matching the query and
    // surface as `map_doc_missing` instead, which is itself still a correct
    // fail-closed outcome). Kept anyway as defense-in-depth per the
    // checkpoint spec's explicit example ("map.customerId matches
    // authenticated tenant") — e.g. it still protects this function if
    // `map` is ever sourced from something other than this exact
    // tenant-scoped query in the future.
    return denied('map_mismatch');
  }

  return { ok: true, context: { uid, email, role, user, customer, map } };
}

/**
 * Checkpoint 1A.10: wrapped in React's `cache()` so the new admin shell
 * layout (`app/(protected)/admin/layout.tsx`, header data) and each page
 * under it (`/admin`, `/admin/account`, `/admin/map`, `/admin/categories`)
 * can all call this independently — the natural way to consume it from a
 * Server Component tree — without each one repeating the underlying
 * `verifySession()` + Firestore reads. `cache()` dedupes by function
 * identity + arguments *within a single request's render pass only*; nothing
 * persists across requests, so this changes nothing about the trust
 * boundary or the fail-closed checks above, only how many times they run.
 */
export const getCurrentClientContext = cache(resolveClientContext);

/**
 * Safe, reviewed copy for a denied `ClientContextResult` — shared by
 * `/admin` and `/admin/account` so both pages show identical, non-leaking
 * messaging (checkpoint 1A.8 §3: "do not expose internal Firebase errors or
 * implementation details"). Only `provisioning_incomplete` gets its own
 * distinct message (§16: PENDING → "finishing setup", FAILED → "contact
 * support"); every other denial reason — malformed claims, a missing/
 * inconsistent document, an unexpected role — collapses to one generic,
 * safe message. The specific reason is only ever visible in the server-side
 * `tenant.client_context.denied` log line above, never in the response.
 */
export function describeClientContextDenial(result: Extract<ClientContextResult, { ok: false }>): {
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

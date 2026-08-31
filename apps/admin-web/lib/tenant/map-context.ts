import { mapIdSchema, mapSchema, type MapParsed } from 'validation';
import { getFirebaseAdminFirestore } from '../firebase/admin';
import { getCurrentTenantIdentity, type TenantIdentity, type TenantIdentityDenialReason } from './tenant-identity';

/**
 * The shared MAP-OWNERSHIP resolver — checkpoint 1B.6 §3/§4/§14. This is
 * the one place every map-scoped page/Route Handler answers "does the
 * requested map exist, and does it belong to the authenticated tenant" —
 * written once and reused, exactly as checkpoint 1A.8 required for
 * `getCurrentClientContext()` before it, and for the identical reason: a
 * check this security-critical must not be reimplemented per route.
 *
 * §14's core invariant, restated as code: "A browser-controlled `mapId` is
 * an identifier, NOT authorization." This function never trusts a `mapId`
 * merely because it is well-formed — it always re-derives the authenticated
 * tenant's OWN `customerId` first (via `getCurrentTenantIdentity()`, which
 * itself never trusts anything client-supplied), then checks that the
 * fetched `maps/{mapId}` document's `customerId` matches. A `mapId` from
 * another tenant, a `mapId` that doesn't exist, and a `mapId` that is not
 * even well-formed all fail this the same way — every failure path returns
 * the same `'map_not_found'` reason (see the doc comment on
 * `MapOwnershipDenialReason` below for why this is deliberate, not an
 * oversight).
 *
 * Checkpoint 1B.8 repair round — this function was previously wrapped in
 * React's `cache()` (`export const getOwnedMapContext = cache(resolveOwnedMapContext)`),
 * intended purely as a same-request read dedupe (e.g. a `[mapId]` layout and
 * the page beneath it both resolving the same map within one Server
 * Component render). `React.cache()`'s memoization is only guaranteed to be
 * scoped to a single React render pass — that guarantee does not extend to
 * a Route Handler (`route.ts`) invocation, which is a plain request handler
 * outside the render tree, not a render. Two genuinely separate HTTP
 * requests hitting different Route Handlers for the SAME `mapId` in quick
 * succession (exactly what a real "Save, then immediately Publish" or
 * "create a category, sign out, then hit an import/discover endpoint"
 * sequence produces) are exactly the shape of call this project's own E2E
 * suite newly started exercising back-to-back once checkpoint 1B.8 added
 * the Publish flow — and are exactly the shape of call for which a
 * memoization keyed only on the `mapId` argument (not on the request, not
 * on the caller's identity) can return an earlier request's STALE result:
 * a since-updated map's old name, or worse, an earlier signed-in caller's
 * authorization decision reused for a since-signed-out caller. For a
 * security-critical, per-request authorization check, "always re-read" is
 * the only safe default — the same-request read-dedup `cache()` provided
 * was a minor efficiency nicety, never something correctness depended on,
 * so this function is now a plain, always-fresh `async function` again.
 */

export type MapOwnershipDenialReason =
  | TenantIdentityDenialReason
  // Deliberately ONE reason for "invalid mapId format", "no such map",
  // "map belongs to a different tenant", AND "stored map doc fails
  // mapSchema validation" — §14: "must not leak map names/configuration
  // from unauthorized maps through error differences where reasonably
  // avoidable." If a forged/cross-tenant mapId got its own distinct denial
  // reason, an attacker could use the response itself to enumerate which
  // mapIds exist versus which exist-but-aren't-theirs. Collapsing all four
  // into one `'map_not_found'` (same convention `PATCH /api/map/categories/
  // {categoryId}` already established for a cross-tenant categoryId — see
  // that route's own doc comment) makes "exists but not yours" and "doesn't
  // exist at all" indistinguishable from the outside, which is the correct,
  // safer default.
  | 'map_not_found';

export interface OwnedMapContext {
  readonly identity: TenantIdentity;
  readonly map: MapParsed;
}

export type OwnedMapContextResult =
  | { readonly ok: true; readonly context: OwnedMapContext }
  | {
      readonly ok: false;
      readonly reason: MapOwnershipDenialReason;
      /** Only populated for `reason === 'provisioning_incomplete'`. */
      readonly provisioningStatus?: 'PENDING' | 'FAILED';
    };

function mapDenied(reason: 'map_not_found', mapId: string): OwnedMapContextResult {
  // Diagnostic-code-only logging — the REAL reason (invalid format, missing
  // doc, cross-tenant, malformed data) is still distinguishable server-side
  // for operational debugging, even though the caller-facing `reason` above
  // is deliberately collapsed. `mapId` is safe to log (an opaque identifier,
  // not a secret), matching how every other route already logs IDs.
  console.info(JSON.stringify({ event: 'tenant.map_context.denied', reason, mapId }));
  return { ok: false, reason };
}

export async function getOwnedMapContext(mapId: string): Promise<OwnedMapContextResult> {
  const identityResult = await getCurrentTenantIdentity();
  if (!identityResult.ok) {
    return identityResult.provisioningStatus
      ? { ok: false, reason: identityResult.reason, provisioningStatus: identityResult.provisioningStatus }
      : { ok: false, reason: identityResult.reason };
  }
  const { identity } = identityResult;

  // Format check FIRST, before ever touching Firestore — an obviously
  // malformed mapId (wrong prefix, wrong length, injected characters) is
  // rejected the same cheap way a well-formed-but-nonexistent one eventually
  // is, but without spending a Firestore read on it.
  if (!mapIdSchema.safeParse(mapId).success) {
    return mapDenied('map_not_found', mapId);
  }

  const firestore = getFirebaseAdminFirestore();
  const mapSnap = await firestore.doc(`maps/${mapId}`).get();
  if (!mapSnap.exists) {
    return mapDenied('map_not_found', mapId);
  }

  const mapParsed = mapSchema.safeParse(mapSnap.data());
  if (!mapParsed.success) {
    // Malformed stored data — fail closed rather than trusting a document we
    // can't validate the shape of (mirrors every `load-*.ts` helper's
    // treatment of a malformed doc, and `client-context.ts`'s original
    // `map_doc_invalid` handling).
    return mapDenied('map_not_found', mapId);
  }
  const map = mapParsed.data;

  // THE ownership check (§14). Everything above this line is validation and
  // lookup; this is the one line that actually decides "does this tenant
  // get to see this map."
  if (map.customerId !== identity.customer.customerId) {
    return mapDenied('map_not_found', mapId);
  }

  return { ok: true, context: { identity, map } };
}

/**
 * True when a denied `OwnedMapContextResult`'s `reason` originated from the
 * IDENTITY layer (`getCurrentTenantIdentity()` — no session, missing/invalid
 * claims, a malformed `users`/`customers` doc, incomplete provisioning: the
 * full `TenantIdentityDenialReason` set) rather than map ownership itself
 * (`'map_not_found'`).
 *
 * Route Handlers use this to return 401 for "not authenticated at all" and
 * reserve 404 for the map-ownership collapse §14 actually calls for
 * (malformed/nonexistent/cross-tenant `mapId`, all deliberately
 * indistinguishable from one another). Repair Round 1 (checkpoint 1B.6)
 * found every `getOwnedMapContext()` caller instead treating ANY `!result.ok`
 * as `'map/not-found'` 404 — silently dropping the 401-for-unauthenticated
 * convention `POST /api/maps` (which calls `getCurrentTenantIdentity()`
 * directly, not through this module) already establishes. Collapsing
 * "signed out" into the same bucket as "map not found" was never part of
 * §14's anti-enumeration rationale (that rationale is specifically about
 * not letting an AUTHENTICATED caller distinguish "exists but not yours"
 * from "doesn't exist" — see `MapOwnershipDenialReason`'s own doc comment
 * above) and was a genuine regression, not an intentional simplification.
 */
export function isIdentityDenialReason(reason: MapOwnershipDenialReason): boolean {
  return reason !== 'map_not_found';
}

/**
 * Safe, reviewed copy for a denied `OwnedMapContextResult` — every
 * map-scoped page shows identical, non-leaking messaging. Reuses the exact
 * same "provisioning_incomplete gets its own copy, everything else is one
 * generic message" shape `describeTenantIdentityDenial()` established,
 * plus one additional case for `'map_not_found'` (deliberately worded to
 * not confirm or deny whether a map with that ID exists at all).
 */
export function describeMapContextDenial(result: Extract<OwnedMapContextResult, { ok: false }>): {
  readonly heading: string;
  readonly message: string;
} {
  if (result.reason === 'map_not_found') {
    return {
      heading: 'Map not found',
      message: 'This map does not exist, or you do not have access to it.',
    };
  }

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

import { cookies } from 'next/headers';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getFirebaseAdminAuth } from '../firebase/admin';
import { SESSION_COOKIE_NAME } from './session-config';

/**
 * Server-only session verification — checkpoint 1A.4 §9, extended in
 * checkpoint 1A.7 §5/§16 to classify WHY a session was not verified.
 *
 * Answers exactly one question: WHO IS THIS USER? It does not load
 * `users/{uid}`, `customers/{customerId}`, or any tenant/role data — that is
 * authorization, and authorization is explicitly out of scope until 1A.5+
 * (see checkpoint §14). A Firebase-authenticated identity is not the same
 * thing as a fully provisioned Tourist Map Client Admin; callers must not
 * assume `uid` implies a `customerId`/`role` exists.
 */
export interface VerifiedSession {
  readonly uid: string;
  readonly email: string | null;
  /**
   * Raw `customerId`/`role` custom claims from the verified token —
   * checkpoint 1A.8 §2. `null` if the claim is absent, malformed, or not a
   * non-empty string; never inferred from anything else. Custom claims are
   * only ever set server-side by `registerClient` (checkpoint 1A.5), so
   * these values cannot be spoofed by the client — but they are still just
   * "what the verified token says", not yet cross-checked against stored
   * Firestore data. That consistency check (and rejecting a role outside
   * the client-assignable set) is `lib/tenant/client-context.ts`'s job, not
   * this module's — this module still only answers "who is this user",
   * consistent with its 1A.4/1A.7 scope; it just now also surfaces what the
   * token itself claims, so downstream code doesn't need to re-verify the
   * session cookie a second time to read it.
   */
  readonly customerId: string | null;
  readonly role: string | null;
}

function readStringClaim(decoded: DecodedIdToken, key: string): string | null {
  const value = (decoded as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Why `session` came back `null` — added in checkpoint 1A.7 so the
 * `(protected)` layout can pick the correct §16 redirect reason instead of
 * collapsing every denial into the same generic message. The underlying
 * verification call (`verifySessionCookie(cookie, true)`) is unchanged from
 * 1A.4 — this only classifies the failure it already reports.
 *
 * - `no_session` — no session cookie was present at all.
 * - `disabled` — the cookie was well-formed, but the Admin SDK's own
 *   `checkRevoked: true` path (which performs a `getUser()` lookup) found
 *   `disabled: true` on the underlying Firebase Auth user
 *   (`firebase-admin`'s `verifyDecodedJWTNotRevokedOrDisabled` throws
 *   `auth/user-disabled` in exactly this case — confirmed against the
 *   `firebase-admin-node` source, not assumed). This is the one denial
 *   reason §16 requires a distinct user-facing message for.
 * - `invalid_session` — malformed, expired, revoked, or any other
 *   Admin-SDK rejection that is not specifically "this user is disabled".
 */
export type SessionDenialReason = 'no_session' | 'disabled' | 'invalid_session';

export interface SessionVerificationResult {
  readonly session: VerifiedSession | null;
  readonly denialReason: SessionDenialReason | null;
}

export async function verifySession(): Promise<SessionVerificationResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return { session: null, denialReason: 'no_session' };
  }

  try {
    // `checkRevoked: true` additionally rejects a cookie whose refresh
    // tokens were revoked (our own logout path does this) and a cookie
    // belonging to a Firebase Auth user that has since been disabled — see
    // docs/stages/STAGE_1A_TECHNICAL_PLAN.md §6, point 7 and §16.
    const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
    const session: VerifiedSession = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      customerId: readStringClaim(decoded, 'customerId'),
      role: readStringClaim(decoded, 'role'),
    };
    return { session, denialReason: null };
  } catch (error) {
    // Missing/malformed/expired/revoked cookie, or a disabled user — every
    // failure mode still collapses to "not authenticated" for authorization
    // purposes (nothing here grants access). The `code` alone (never the
    // cookie value) is logged as a diagnostic — checkpoint 1A.4 E2E repair
    // round 3 — and is now also used to pick a specific denial reason so a
    // disabled account gets its own §16 message instead of the generic one.
    const code =
      typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'unknown';
    console.info(JSON.stringify({ event: 'auth.session_verify.failure', errorCode: code }));
    const denialReason: SessionDenialReason = code === 'auth/user-disabled' ? 'disabled' : 'invalid_session';
    return { session: null, denialReason };
  }
}

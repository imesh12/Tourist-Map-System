import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '../firebase/admin';
import { SESSION_COOKIE_NAME } from './session-config';

/**
 * Server-only session verification — checkpoint 1A.4 §9.
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
}

export async function verifySession(): Promise<VerifiedSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    // `checkRevoked: true` additionally rejects a cookie whose refresh
    // tokens were revoked (our own logout path does this) and a cookie
    // belonging to a Firebase Auth user that has since been disabled — see
    // docs/stages/STAGE_1A_TECHNICAL_PLAN.md §6, point 7.
    const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (error) {
    // Missing/malformed/expired/revoked cookie, or a disabled user — every
    // failure mode collapses to "not authenticated" for callers (Server
    // Components/layouts don't need or should branch on which one
    // happened); the (protected) layout maps any `null` to the same
    // "/login?reason=session_expired" redirect regardless. The `code` alone
    // (never the cookie value) is logged as a diagnostic — checkpoint 1A.4
    // E2E repair round 3 — to distinguish, if a valid-looking session cookie
    // still gets rejected here, "cookie never existed" from "cookie existed
    // but the Admin SDK rejected it and why".
    const code =
      typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'unknown';
    console.info(JSON.stringify({ event: 'auth.session_verify.failure', errorCode: code }));
    return null;
  }
}

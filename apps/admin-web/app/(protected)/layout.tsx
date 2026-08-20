import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { verifySession } from '@/lib/auth/verify-session';

/**
 * Authoritative protected-route gate — checkpoint 1A.4 §9/§10, extended in
 * checkpoint 1A.7 §5/§16.
 *
 * `proxy.ts` already redirected any request with NO session cookie before
 * this Server Component ever runs, so reaching this layout at all means a
 * cookie WAS present. This is the layer that actually verifies it
 * cryptographically (via `verifySession()` → Admin SDK `verifySessionCookie`)
 * — an invalid, expired, revoked, or disabled-user cookie is rejected here,
 * never rendered as if it were a valid session.
 *
 * The redirect reason is picked from `denialReason` so a disabled account
 * gets its own message (`/login?reason=account_disabled` — §16) instead of
 * being lumped in with an ordinary expired/invalid session. `no_session`
 * reaching this layout at all would be unexpected (proxy.ts should already
 * have redirected it), but is mapped to the same generic message as
 * `invalid_session` rather than crashing, in case proxy.ts and this layout
 * ever disagree about cookie presence (e.g. a cookie cleared between the two
 * checks) — a missing cookie is not a distinct user-facing scenario.
 *
 * Deliberately does not load `users/{uid}`, `customers/{customerId}`, or any
 * tenant/role data — authentication only answers "who is this user", not
 * "what can they access", and `customers/{customerId}.provisioning.status`
 * gating is explicitly deferred to checkpoint 1A.8 (see the 1A.7 completion
 * report — that is where `/admin` first reads real Firestore data at all).
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { session, denialReason } = await verifySession();

  if (!session) {
    const reason = denialReason === 'disabled' ? 'account_disabled' : 'session_expired';
    redirect(`/login?reason=${reason}`);
  }

  return <>{children}</>;
}

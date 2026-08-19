import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { verifySession } from '@/lib/auth/verify-session';

/**
 * Authoritative protected-route gate — checkpoint 1A.4 §9/§10.
 *
 * `proxy.ts` already redirected any request with NO session cookie before
 * this Server Component ever runs, so reaching this layout at all means a
 * cookie WAS present. This is the layer that actually verifies it
 * cryptographically (via `verifySession()` → Admin SDK `verifySessionCookie`)
 * — an invalid, expired, revoked, or disabled-user cookie is rejected here,
 * never rendered as if it were a valid session.
 *
 * Deliberately does not load `users/{uid}`, `customers/{customerId}`, or any
 * tenant/role data — authentication only answers "who is this user", not
 * "what can they access". See checkpoint §14; tenant authorization arrives
 * in 1A.5+.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await verifySession();

  if (!session) {
    redirect('/login?reason=session_expired');
  }

  return <>{children}</>;
}

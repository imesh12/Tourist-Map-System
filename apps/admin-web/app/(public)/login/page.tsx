import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSafeNextPath } from '@/lib/auth/safe-next-path';
import { verifySession } from '@/lib/auth/verify-session';
import { DisabledSessionCleanup } from './disabled-session-cleanup';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign In — Tourist Map System',
};

// Safe, reviewed copies only — never a raw Firebase/session error string.
// Keys match the `reason` query values used by proxy.ts (implicitly, via
// no-cookie → plain /login), the (protected) layout, and the logout flow.
const REASON_MESSAGES: Record<string, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  account_disabled: 'This account has been disabled. Contact support for help.',
};

interface LoginPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // checkpoint 1A.7 §7/§16: an already-authenticated visit to this public
  // route redirects to /admin rather than showing the form again. Per §16
  // this redirects to the fixed /admin destination, not to any `next`
  // value — `next` is only meaningful for the *unauthenticated* redirect
  // path (proxy.ts / the protected layout sending someone here). A session
  // rejected for being disabled correctly falls through to the form below
  // (verifySession() returns no session for a disabled account either), so
  // this cannot loop a disabled user back to /admin.
  const { session } = await verifySession();
  if (session) {
    redirect('/admin');
  }

  const params = await searchParams;

  const reasonParam = params.reason;
  const reason = typeof reasonParam === 'string' ? REASON_MESSAGES[reasonParam] : undefined;
  const isDisabledReason = reasonParam === 'account_disabled';

  // Guard against an open-redirect via a crafted `next` value — checkpoint
  // 1A.7 §8, see lib/auth/safe-next-path.ts for why this is a real parser
  // resolution check and not a plain string-prefix check.
  const nextParam = params.next;
  const next = isSafeNextPath(nextParam) ? nextParam : '/admin';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 360, margin: '0 auto' }}>
      {isDisabledReason ? <DisabledSessionCleanup /> : null}
      <h1>Sign in</h1>
      {reason ? (
        <p role="alert" style={{ color: '#7a1f1f' }}>
          {reason}
        </p>
      ) : null}
      <LoginForm next={next} />
      <p style={{ marginTop: '1.5rem' }}>
        Don&apos;t have an account? <Link href="/register">Register</Link>
      </p>
    </main>
  );
}

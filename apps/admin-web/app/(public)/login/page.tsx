import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign In — Tourist Map System',
};

// Safe, reviewed copies only — never a raw Firebase/session error string.
// Keys match the `reason` query values used by proxy.ts (implicitly, via
// no-cookie → plain /login) and the (protected) layout / logout flow.
const REASON_MESSAGES: Record<string, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  account_disabled: 'This account has been disabled. Contact support for help.',
};

interface LoginPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const reasonParam = params.reason;
  const reason = typeof reasonParam === 'string' ? REASON_MESSAGES[reasonParam] : undefined;

  // Guard against an open-redirect via a crafted `next` value — only an
  // in-app absolute path is honored; anything else falls back to /admin.
  const nextParam = params.next;
  const next = typeof nextParam === 'string' && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/admin';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 360, margin: '0 auto' }}>
      <h1>Sign in</h1>
      {reason ? (
        <p role="alert" style={{ color: '#7a1f1f' }}>
          {reason}
        </p>
      ) : null}
      <LoginForm next={next} />
    </main>
  );
}

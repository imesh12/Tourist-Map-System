'use client';

import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, type User } from 'firebase/auth';
import { loginInputSchema } from 'validation';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { completeFirebaseLogin } from '@/lib/auth/complete-login';
import { AuthAppError, mapFirebaseAuthError } from '@/lib/auth/errors';
import { getFirebaseAuth } from '@/lib/firebase/client';

/**
 * The `/login` form — checkpoint 1A.4 §3/§4/§4A.
 *
 * Both sign-in paths below stop as soon as they have a Firebase `User` and
 * hand off to the SAME `completeFirebaseLogin()` (§4B) — no provider-
 * specific session logic exists past that point. Google uses
 * `signInWithPopup` (not `signInWithRedirect`) per the checkpoint's
 * recommended initial flow; nothing here assumes popup specifically beyond
 * that one call, so swapping to a redirect flow later would only touch
 * `handleGoogleSignIn`.
 *
 * No extra Google OAuth scopes are requested — `GoogleAuthProvider` is used
 * with its default scope only (Google is authentication-only, never Gmail/
 * Drive/Calendar/Contacts access).
 */

interface LoginFormProps {
  readonly next: string;
}

type SubmitState = 'idle' | 'email-password' | 'google';

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  const isSubmitting = submitState !== 'idle';

  async function finishLogin(firebaseUser: User): Promise<void> {
    try {
      await completeFirebaseLogin(firebaseUser);
    } catch (error) {
      // Firebase authentication succeeded but server session establishment
      // did not — the app must not behave as logged in. Reset client auth
      // state so we don't leave a signed-in-to-Firebase-but-no-server-
      // session inconsistency (checkpoint §4A, "session creation failure").
      try {
        await getFirebaseAuth().signOut();
      } catch {
        // best-effort
      }
      throw error;
    }

    router.push(next);
    router.refresh();
  }

  async function handleEmailPasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setFormError(undefined);
    setFieldErrors({});

    const parsed = loginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const nextFieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'email' && !nextFieldErrors.email) {
          nextFieldErrors.email = issue.message;
        }
        if (key === 'password' && !nextFieldErrors.password) {
          nextFieldErrors.password = issue.message;
        }
      }
      setFieldErrors(nextFieldErrors);
      return;
    }

    setSubmitState('email-password');
    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), parsed.data.email, parsed.data.password);
      await finishLogin(credential.user);
    } catch (error) {
      setFormError(toSafeMessage(error));
      // Clear the rejected password (whether Firebase itself rejected the
      // credentials, or Firebase succeeded but server session creation
      // failed — either way this attempt did not complete). The email is
      // preserved so the user doesn't have to retype it on retry.
      setPassword('');
    } finally {
      setSubmitState('idle');
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    if (isSubmitting) {
      return;
    }
    setFormError(undefined);
    setSubmitState('google');
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(getFirebaseAuth(), provider);
      await finishLogin(credential.user);
    } catch (error) {
      setFormError(toSafeMessage(error));
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    // `method="post"` is a defense-in-depth fallback only — the actual
    // submission is always fully intercepted by `onSubmit`'s
    // `event.preventDefault()` below, so this attribute never actually
    // fires a request in normal operation. If it ever DID fire (e.g. a
    // future hydration failure), POST semantics keep the email/password out
    // of the URL/query string/browser history/server access logs, unlike
    // a bare `<form>`'s default GET behavior. There is deliberately no
    // `action` — this is not a server form action and must never bypass
    // the Firebase client SDK.
    <form onSubmit={handleEmailPasswordSubmit} method="post" noValidate>
      {formError ? (
        <p role="alert" style={{ color: '#7a1f1f' }}>
          {formError}
        </p>
      ) : null}

      <div>
        <label htmlFor="email">Email</label>
        <br />
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          disabled={isSubmitting}
        />
        {fieldErrors.email ? (
          <p id="email-error" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <br />
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          disabled={isSubmitting}
        />
        {fieldErrors.password ? (
          <p id="password-error" role="alert">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {submitState === 'email-password' ? 'Signing in…' : 'Sign In'}
      </button>

      <div role="separator" aria-label="or" style={{ margin: '1rem 0', textAlign: 'center' }}>
        or
      </div>

      <button type="button" onClick={handleGoogleSignIn} disabled={isSubmitting}>
        {submitState === 'google' ? 'Signing in…' : 'Continue with Google'}
      </button>
    </form>
  );
}

function toSafeMessage(error: unknown): string {
  const appError = error instanceof AuthAppError ? error : mapFirebaseAuthError(error);
  return appError.message;
}

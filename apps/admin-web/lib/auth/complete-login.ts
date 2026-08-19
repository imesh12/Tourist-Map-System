import type { User } from 'firebase/auth';
import { AUTH_ERROR_CODES, AuthAppError } from './errors';

/**
 * The one shared post-authentication completion path — checkpoint 1A.4 §4B.
 *
 * Both `signInWithEmailAndPassword` and `GoogleAuthProvider`/
 * `signInWithPopup` call this SAME function once they have a Firebase
 * `User`. Provider-specific logic stops the moment a Firebase `User` exists;
 * everything after that — obtaining a fresh ID token, POSTing it to the
 * trusted session endpoint, and confirming the server actually created a
 * session — is identical regardless of which provider authenticated the
 * user. This is what makes the two providers converge on one session
 * architecture instead of each growing its own.
 *
 * Deliberately does NOT navigate anywhere itself — the caller only
 * navigates to the protected area after this resolves without throwing,
 * per the explicit ordering requirement in the checkpoint spec ("only
 * after confirmed session creation, navigate to protected admin area").
 */
export async function completeFirebaseLogin(user: User): Promise<void> {
  let idToken: string;
  try {
    // Force-refresh: we want a token that is definitely fresh at the moment
    // of session creation, not a cached one that might be close to expiry.
    idToken = await user.getIdToken(true);
  } catch {
    throw new AuthAppError(AUTH_ERROR_CODES.SESSION_CREATION_FAILED, 'Could not complete sign-in. Please try again.');
  }

  let response: Response;
  try {
    response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    throw new AuthAppError(
      AUTH_ERROR_CODES.SESSION_CREATION_FAILED,
      'Could not reach the server to complete sign-in. Please check your connection and try again.',
    );
  }

  if (!response.ok) {
    // Diagnostic only: HTTP status + the server's own already-sanitized
    // `code` field from its JSON error body (see
    // app/api/auth/session/route.ts — that body never contains the ID
    // token, a cookie value, or a raw Firebase error). Added in checkpoint
    // 1A.4 E2E repair round 3 so a session-creation failure is no longer an
    // opaque, undiagnosable generic error end-to-end — the user-facing
    // message thrown below is unchanged.
    let diagnosticCode = 'unknown';
    try {
      const body = (await response.json()) as { code?: unknown };
      diagnosticCode = typeof body.code === 'string' ? body.code : 'unknown';
    } catch {
      // Body wasn't JSON, or was already consumed — no diagnostic code
      // available; fall through with 'unknown' rather than throwing here.
    }
    if (typeof console !== 'undefined') {
      console.error('[auth] session creation failed', { status: response.status, code: diagnosticCode });
    }
    throw new AuthAppError(AUTH_ERROR_CODES.SESSION_CREATION_FAILED, 'Could not complete sign-in. Please try again.');
  }

  // Success: a server session now exists. The caller is responsible for
  // navigating — this function's only job was to establish it.
}

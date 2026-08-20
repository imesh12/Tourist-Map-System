/**
 * Structured authentication error model — checkpoint 1A.4 §18, reusing the
 * `AppError` shape from docs/stages/STAGE_1A_TECHNICAL_PLAN.md §18:
 *
 *   type AppError = { code: string; message: string; details?: unknown }
 *
 * Firebase/provider errors are mapped to one of these safe, plain-language
 * application-level errors — raw Firebase error strings, stack traces, and
 * OAuth payloads are never surfaced to the UI. Diagnostic *codes* (not
 * tokens, not credentials, not passwords) may be logged internally.
 */

export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'auth/invalid-credentials',
  AUTH_DISABLED: 'auth/disabled',
  AUTH_CANCELLED: 'auth/cancelled',
  AUTH_POPUP_BLOCKED: 'auth/popup-blocked',
  AUTH_PROVIDER_ERROR: 'auth/provider-error',
  INVALID_SESSION: 'auth/invalid-session',
  SESSION_CREATION_FAILED: 'auth/session-creation-failed',
  UNAUTHORIZED: 'auth/unauthorized',
  REGISTRATION_INVALID_INPUT: 'registration/invalid-input',
  REGISTRATION_DUPLICATE_EMAIL: 'registration/duplicate-email',
  REGISTRATION_FAILED: 'registration/failed',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export interface AppError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export class AuthAppError extends Error implements AppError {
  readonly code: AuthErrorCode;
  readonly details?: unknown;

  constructor(code: AuthErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AuthAppError';
    this.code = code;
    this.details = details;
  }
}

function rawFirebaseErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

/**
 * Maps a raw error thrown by the Firebase client Auth SDK
 * (`signInWithEmailAndPassword`, `signInWithPopup`, `getIdToken`, ...) to a
 * safe `AuthAppError`. Never surfaces Firebase's own error message to the
 * caller — only the mapped, reviewed message strings below reach the UI.
 */
export function mapFirebaseAuthError(error: unknown): AuthAppError {
  const rawCode = rawFirebaseErrorCode(error);

  // Diagnostic code only — never the raw Firebase message, never any
  // credential/token. Safe to log client-side (browser console) per
  // docs/stages/STAGE_1A_TECHNICAL_PLAN.md §19.
  if (typeof console !== 'undefined') {
    console.warn('[auth] sign-in failed', { code: rawCode ?? 'unknown' });
  }

  switch (rawCode) {
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new AuthAppError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'Incorrect email or password.');

    case 'auth/user-disabled':
      return new AuthAppError(AUTH_ERROR_CODES.AUTH_DISABLED, 'This account has been disabled. Contact support for help.');

    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new AuthAppError(AUTH_ERROR_CODES.AUTH_CANCELLED, 'Sign-in was cancelled.');

    case 'auth/popup-blocked':
      return new AuthAppError(
        AUTH_ERROR_CODES.AUTH_POPUP_BLOCKED,
        'Your browser blocked the sign-in popup. Please allow popups for this site and try again.',
      );

    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
      return new AuthAppError(
        AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR,
        'This sign-in method is not available right now. Please contact support.',
      );

    case 'auth/account-exists-with-different-credential':
      return new AuthAppError(
        AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR,
        'An account already exists for this email using a different sign-in method.',
      );

    case 'auth/too-many-requests':
      return new AuthAppError(AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR, 'Too many attempts. Please wait a moment and try again.');

    default:
      return new AuthAppError(AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR, 'Sign-in failed. Please try again.');
  }
}

/**
 * Maps an error thrown by the `registerClient` Callable Function (invoked
 * via the client SDK's `httpsCallable`) to a safe `AuthAppError` — checkpoint
 * 1A.9. `registerClient` (firebase/functions/src/register-client.ts) always
 * throws a `functions.https.HttpsError` carrying a `details.code` from its
 * own reviewed set (`validation/invalid-input`, `provisioning/duplicate-email`,
 * `provisioning/failed`) — switching on that inner code, rather than the
 * outer `functions/*` transport-level code, is what stays in sync with the
 * server's actual error taxonomy instead of a generic HTTP-status mapping.
 * A network failure (no `details` at all — the call never reached the
 * function) falls through to the generic registration-failed message.
 */
export function mapRegistrationError(error: unknown): AuthAppError {
  const detailCode = registrationDetailCode(error);

  if (typeof console !== 'undefined') {
    console.warn('[registration] registerClient call failed', { code: detailCode ?? 'unknown' });
  }

  switch (detailCode) {
    case 'validation/invalid-input':
      return new AuthAppError(AUTH_ERROR_CODES.REGISTRATION_INVALID_INPUT, 'Please check the registration form and try again.');

    case 'provisioning/duplicate-email':
      return new AuthAppError(
        AUTH_ERROR_CODES.REGISTRATION_DUPLICATE_EMAIL,
        'An account with this email already exists. Please sign in instead.',
      );

    default:
      return new AuthAppError(AUTH_ERROR_CODES.REGISTRATION_FAILED, 'Registration could not be completed. Please try again.');
  }
}

function registrationDetailCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return undefined;
  }
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null || !('code' in details)) {
    return undefined;
  }
  const code = (details as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

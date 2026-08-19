/**
 * Centralized session-cookie configuration — checkpoint 1A.4.
 *
 * Every place that needs the cookie name, lifetime, or attributes (the
 * session route, the logout route, `verifySession()`) imports from here.
 * Nothing hardcodes a duration or a cookie name elsewhere — this is what
 * "centralized configuration, not hardcoded" (1A.2/1A.3 amendments, and
 * explicitly re-required by checkpoint 1A.4 §5) means in practice.
 */

// Default: 14 days. NOT a LOCK NOW architecture decision — see
// docs/stages/STAGE_1A_TECHNICAL_PLAN.md §6/§24 (Amendment 3) and
// apps/admin-web/.env.example. Overridable via SESSION_COOKIE_MAX_AGE_SECONDS.
const DEFAULT_MAX_AGE_SECONDS = 1209600;

// Firebase's own `createSessionCookie` accepts an `expiresIn` between 5
// minutes and 2 weeks (in milliseconds) — these bounds are enforced here so
// a misconfigured env var fails fast and loud at request time rather than
// failing deep inside a Firebase Admin SDK call with a less legible error.
const MIN_MAX_AGE_SECONDS = 5 * 60;
const MAX_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export const SESSION_COOKIE_NAME = 'tm_session';

export function getSessionCookieMaxAgeSeconds(): number {
  const raw = process.env.SESSION_COOKIE_MAX_AGE_SECONDS;
  const value = raw ? Number(raw) : DEFAULT_MAX_AGE_SECONDS;

  if (!Number.isFinite(value) || value < MIN_MAX_AGE_SECONDS || value > MAX_MAX_AGE_SECONDS) {
    // Configuration error category (docs/stages/STAGE_1A_TECHNICAL_PLAN.md
    // §18) — fail fast rather than silently clamping to something the
    // operator didn't ask for.
    throw new Error(
      `SESSION_COOKIE_MAX_AGE_SECONDS must be a number between ${MIN_MAX_AGE_SECONDS} and ${MAX_MAX_AGE_SECONDS} ` +
        `seconds (Firebase session-cookie limits). Got: ${raw ?? '(unset — this should not happen; check the default)'}`,
    );
  }

  return value;
}

/** Milliseconds, for `FirebaseAdminAuth#createSessionCookie`'s `expiresIn` option. */
export function getSessionCookieMaxAgeMs(): number {
  return getSessionCookieMaxAgeSeconds() * 1000;
}

export interface SessionCookieAttributes {
  readonly name: string;
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: '/';
  /** Seconds — matches the `cookies().set()` Web API `maxAge` unit. */
  readonly maxAge: number;
}

export function getSessionCookieAttributes(): SessionCookieAttributes {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    // Secure=true in production; relaxed locally so `next dev` over plain
    // http://localhost still works — see
    // docs/stages/STAGE_1A_TECHNICAL_PLAN.md §13.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionCookieMaxAgeSeconds(),
  };
}

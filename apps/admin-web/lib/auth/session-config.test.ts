import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  getSessionCookieAttributes,
  getSessionCookieMaxAgeMs,
  getSessionCookieMaxAgeSeconds,
} from './session-config';

// `process.env.NODE_ENV` is typed `readonly` (Next.js augments the global
// `NodeJS.ProcessEnv` type with `readonly NODE_ENV: ...`), so direct
// assignment/`delete` on `process.env` fails to typecheck (TS2540/TS2704) —
// and would be a real anti-pattern to cast around even if it didn't.
// `vi.stubEnv`/`vi.unstubAllEnvs` is Vitest's supported mechanism for this
// exact case: it never assigns to `process.env` directly, so it isn't
// subject to the readonly restriction, and `unstubAllEnvs()` restores every
// stubbed var to its pre-test value automatically.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session-config', () => {
  it('defaults to 14 days (1209600 seconds) when unset', () => {
    vi.stubEnv('SESSION_COOKIE_MAX_AGE_SECONDS', undefined);
    expect(getSessionCookieMaxAgeSeconds()).toBe(1209600);
    expect(getSessionCookieMaxAgeMs()).toBe(1209600000);
  });

  it('honors a valid override within Firebase session-cookie limits', () => {
    vi.stubEnv('SESSION_COOKIE_MAX_AGE_SECONDS', '3600');
    expect(getSessionCookieMaxAgeSeconds()).toBe(3600);
  });

  it('rejects a value below the 5-minute Firebase floor', () => {
    vi.stubEnv('SESSION_COOKIE_MAX_AGE_SECONDS', '60');
    expect(() => getSessionCookieMaxAgeSeconds()).toThrow(/between/);
  });

  it('rejects a value above the 14-day Firebase ceiling', () => {
    vi.stubEnv('SESSION_COOKIE_MAX_AGE_SECONDS', String(14 * 24 * 60 * 60 + 1));
    expect(() => getSessionCookieMaxAgeSeconds()).toThrow(/between/);
  });

  it('rejects a non-numeric override', () => {
    vi.stubEnv('SESSION_COOKIE_MAX_AGE_SECONDS', 'not-a-number');
    expect(() => getSessionCookieMaxAgeSeconds()).toThrow(/between/);
  });

  it('uses the centralized cookie name', () => {
    expect(getSessionCookieAttributes().name).toBe(SESSION_COOKIE_NAME);
  });

  it('is not Secure outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(getSessionCookieAttributes().secure).toBe(false);
  });

  it('is Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getSessionCookieAttributes().secure).toBe(true);
  });

  it('always sets httpOnly, SameSite=Lax, and Path=/', () => {
    const attrs = getSessionCookieAttributes();
    expect(attrs.httpOnly).toBe(true);
    expect(attrs.sameSite).toBe('lax');
    expect(attrs.path).toBe('/');
  });
});

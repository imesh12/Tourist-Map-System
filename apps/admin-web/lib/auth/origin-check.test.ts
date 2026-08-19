import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTrustedOrigin } from './origin-check';

// The request URL itself is intentionally irrelevant to `isTrustedOrigin`
// now — the check validates the Origin header against the configured
// `APP_ORIGIN` env var, not against `request.nextUrl`. A fixed dummy URL is
// used throughout so every test is unambiguously exercising that, not an
// accidental match against the request's own host.
const REQUEST_URL = 'https://request-host-is-irrelevant.example/api/auth/session';

function requestWithOrigin(origin: string | undefined): NextRequest {
  const headers = new Headers();
  if (origin !== undefined) {
    headers.set('origin', origin);
  }
  return new NextRequest(REQUEST_URL, { method: 'POST', headers });
}

describe('isTrustedOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a request whose Origin exactly matches the configured APP_ORIGIN', () => {
    vi.stubEnv('APP_ORIGIN', 'https://admin.example.com');
    const request = requestWithOrigin('https://admin.example.com');
    expect(isTrustedOrigin(request)).toBe(true);
  });

  it('accepts a matching origin including a non-default port (local dev / E2E)', () => {
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3100');
    const request = requestWithOrigin('http://127.0.0.1:3100');
    expect(isTrustedOrigin(request)).toBe(true);
  });

  it('rejects a request with no Origin header at all', () => {
    vi.stubEnv('APP_ORIGIN', 'https://admin.example.com');
    const request = requestWithOrigin(undefined);
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('rejects a request whose Origin is a different host (cross-site attempt)', () => {
    vi.stubEnv('APP_ORIGIN', 'https://admin.example.com');
    const request = requestWithOrigin('https://evil.example.net');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('rejects a request whose Origin differs only by port', () => {
    vi.stubEnv('APP_ORIGIN', 'https://admin.example.com');
    const request = requestWithOrigin('https://admin.example.com:8443');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('rejects a request whose Origin differs only by scheme', () => {
    vi.stubEnv('APP_ORIGIN', 'https://example.com');
    const request = requestWithOrigin('http://example.com');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('rejects localhost when APP_ORIGIN is 127.0.0.1 (and vice versa) — not treated as equivalent', () => {
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3100');
    const request = requestWithOrigin('http://localhost:3100');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('rejects an attacker subdomain of the trusted origin (no suffix/substring matching)', () => {
    vi.stubEnv('APP_ORIGIN', 'https://example.com');
    const request = requestWithOrigin('https://evil.example.com');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('rejects an attacker domain that merely contains the trusted origin as a substring', () => {
    vi.stubEnv('APP_ORIGIN', 'https://example.com');
    const request = requestWithOrigin('https://example.com.evil.net');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('rejects a malformed Origin header value', () => {
    vi.stubEnv('APP_ORIGIN', 'https://admin.example.com');
    const request = requestWithOrigin('not a url');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('fails safe and rejects every request when APP_ORIGIN is not configured', () => {
    vi.stubEnv('APP_ORIGIN', undefined);
    const request = requestWithOrigin('https://admin.example.com');
    expect(isTrustedOrigin(request)).toBe(false);
  });

  it('fails safe and rejects every request when APP_ORIGIN is malformed', () => {
    vi.stubEnv('APP_ORIGIN', 'not a url');
    const request = requestWithOrigin('https://admin.example.com');
    expect(isTrustedOrigin(request)).toBe(false);
  });
});

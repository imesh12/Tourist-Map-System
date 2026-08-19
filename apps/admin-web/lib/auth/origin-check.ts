import type { NextRequest } from 'next/server';

/**
 * Explicit, environment-configured CSRF mitigation for the two trusted
 * session endpoints (`POST /api/auth/session`, `POST /api/auth/logout`) —
 * checkpoint 1A.4 §13, revised in the "origin check final repair" round.
 *
 * PREVIOUS DESIGN WEAKNESS (why this changed): the check used to compare the
 * request's Origin *host* against `request.nextUrl.host` — Next.js's own
 * reconstruction of "what host is this request for", implicitly coupled to
 * Next's dev-server host handling. That coupling was never actually
 * observed to be correct locally (a diagnostic logging both values was
 * added and never printed the expected line, because the origin check was
 * failing before reaching code that could confirm which side was wrong) and
 * architecturally it's a weaker boundary than necessary: it trusts whatever
 * host the request claims to be for, rather than trusting only a short,
 * explicit, operator-configured list of one.
 *
 * CURRENT DESIGN: validates the `Origin` header against a single, explicit,
 * server-only `APP_ORIGIN` environment variable (e.g.
 * `http://127.0.0.1:3100` for local E2E, `https://admin.example.com` for a
 * real deployment) — deliberately not `NEXT_PUBLIC_APP_ORIGIN`, since this
 * is a server-side trust decision the browser has no legitimate need to
 * read. The FULL origin (scheme + hostname + effective port) is compared
 * via `URL#origin`, not just hostname, so `http://127.0.0.1:3100` and
 * `http://localhost:3100` are correctly treated as different, non-equal
 * origins, and so are `http://example.com` / `https://example.com`.
 *
 * FAILS SAFE: if `APP_ORIGIN` is unset or malformed, every request is
 * rejected. There is deliberately no fallback that infers a trusted origin
 * from request headers (`Host`, `X-Forwarded-Host`, or otherwise) — that
 * would reintroduce exactly the "trust what the request claims" weakness
 * this revision removes. Each deployment (local E2E, staging, production)
 * must configure its own explicit `APP_ORIGIN`.
 */
export interface OriginCheckResult {
  readonly allowed: boolean;
  /** The raw `Origin` header value, or `null` if the request didn't send one. */
  readonly requestOrigin: string | null;
  /** The configured trusted origin this request was checked against, or `null` if `APP_ORIGIN` is unset/malformed. */
  readonly expectedOrigin: string | null;
}

function readTrustedAppOrigin(): string | null {
  const raw = process.env.APP_ORIGIN;
  if (!raw) {
    return null;
  }
  try {
    // Re-parsing through URL normalizes incidental formatting (e.g. a
    // trailing slash) so `APP_ORIGIN=http://127.0.0.1:3100/` still compares
    // correctly against a browser's `Origin: http://127.0.0.1:3100`.
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function checkOrigin(request: NextRequest): OriginCheckResult {
  const expectedOrigin = readTrustedAppOrigin();
  const requestOrigin = request.headers.get('origin');

  if (!expectedOrigin || !requestOrigin) {
    return { allowed: false, requestOrigin, expectedOrigin };
  }

  try {
    return { allowed: new URL(requestOrigin).origin === expectedOrigin, requestOrigin, expectedOrigin };
  } catch {
    return { allowed: false, requestOrigin, expectedOrigin };
  }
}

export function isTrustedOrigin(request: NextRequest): boolean {
  return checkOrigin(request).allowed;
}

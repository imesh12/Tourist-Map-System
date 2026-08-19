import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-config';

/**
 * Next.js 16 renamed `middleware.ts`/`middleware()` to `proxy.ts`/`proxy()`
 * — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §4 correction note. `proxy`
 * always runs on the Node.js runtime (no `edge` option), so this is a
 * separation-of-concerns optimization rather than an Edge-vs-Node boundary.
 *
 * IMPORTANT — checkpoint 1A.4 §10: this ONLY checks whether the session
 * cookie is *present*. That is a cheap routing optimization to avoid
 * rendering the protected shell before an obvious redirect — it is NOT a
 * security decision. The authoritative check is `verifySession()` in
 * `app/(protected)/layout.tsx`, which cryptographically verifies the cookie
 * with the Admin SDK on every request. A forged, expired, or revoked cookie
 * value passes this presence check and is still correctly rejected by the
 * layout. Never treat "cookie exists" as equivalent to "session verified".
 */
export function proxy(request: NextRequest): NextResponse {
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};

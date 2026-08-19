import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { SESSION_COOKIE_NAME, getSessionCookieAttributes } from '@/lib/auth/session-config';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';

/**
 * POST /api/auth/logout — the one trusted session-deletion boundary,
 * checkpoint 1A.4 §8.
 *
 * Clears the HTTP-only session cookie server-side regardless of whether the
 * refresh-token revocation below succeeds — an admin-surface logout must
 * never appear to "fail" from the user's point of view just because a
 * secondary hardening step had trouble.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'auth/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionCookie) {
    // Harder logout: revoke refresh tokens for this session's uid so the
    // session cookie can't be replayed even if it were somehow captured
    // before this response clears it — docs/stages/STAGE_1A_TECHNICAL_PLAN.md
    // §6, step 5 ("recommended for Phase 1A given this is an admin surface").
    try {
      const adminAuth = getFirebaseAdminAuth();
      const decoded = await adminAuth.verifySessionCookie(sessionCookie);
      await adminAuth.revokeRefreshTokens(decoded.uid);
    } catch {
      // Already invalid/expired, or revocation failed — nothing more to do
      // here; fall through and clear the cookie regardless.
    }
  }

  const attrs = getSessionCookieAttributes();
  cookieStore.set(attrs.name, '', {
    httpOnly: attrs.httpOnly,
    secure: attrs.secure,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}

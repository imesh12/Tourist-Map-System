import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { checkOrigin } from '@/lib/auth/origin-check';
import { getSessionCookieAttributes, getSessionCookieMaxAgeMs } from '@/lib/auth/session-config';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';

/**
 * POST /api/auth/session — the one trusted session-creation boundary,
 * checkpoint 1A.4 §7.
 *
 * Provider-independent by construction: this handler only ever sees "a
 * Firebase ID token". It has no code path that branches on, reads, or
 * trusts a client-supplied `provider` field — email/password and Google
 * sign-in both reach this exact same handler via
 * `lib/auth/complete-login.ts`'s shared `completeFirebaseLogin()`. See
 * checkpoint §4B / "PROVIDER INDEPENDENCE".
 *
 * Does NOT trust: uid, email, role, customerId, mapId, or a provider name
 * supplied separately in the request body — the verified ID token is the
 * only authentication authority. Does NOT return the ID token, the session
 * cookie value, or any privileged user data.
 */

interface SessionRequestBody {
  readonly idToken?: unknown;
}

function logAuthEvent(event: string, fields: Record<string, unknown> = {}): void {
  // Structured, diagnostic-code-only logging — never a token, password, or
  // cookie value. docs/stages/STAGE_1A_TECHNICAL_PLAN.md §19.
  console.info(JSON.stringify({ event, ...fields }));
}

/**
 * Extracts only the Admin SDK's own error `code` (e.g. `auth/argument-error`,
 * `auth/internal-error`, `auth/project-not-found`) — never `.message` (which
 * can echo request-specific detail we haven't audited), never the token that
 * was being verified. Added in checkpoint 1A.4 E2E repair round 3 because
 * `verifyIdToken`/`createSessionCookie` failures were previously collapsed
 * into a single generic 401/500 with no way to tell, from local test output,
 * which of the two calls failed or why.
 */
function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === 'string' ? value : 'unknown';
  }
  return 'unknown';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Origin strings are not secrets (unlike a token, password, or cookie) —
  // logging them keeps a 403 here diagnosable from local test output. See
  // lib/auth/origin-check.ts for why this now validates against an
  // explicit, configured `APP_ORIGIN` rather than `request.nextUrl.host`.
  const origin = checkOrigin(request);
  logAuthEvent('auth.session.origin_check', {
    requestOrigin: origin.requestOrigin,
    expectedOrigin: origin.expectedOrigin,
    allowed: origin.allowed,
  });
  if (!origin.allowed) {
    logAuthEvent('auth.login.failure', { reason: 'untrusted_origin' });
    return NextResponse.json({ code: 'auth/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  let body: SessionRequestBody;
  try {
    body = (await request.json()) as SessionRequestBody;
  } catch {
    return NextResponse.json({ code: 'auth/invalid-session', message: 'Invalid request.' }, { status: 400 });
  }

  const idToken = typeof body.idToken === 'string' && body.idToken.length > 0 ? body.idToken : undefined;
  if (!idToken) {
    return NextResponse.json({ code: 'auth/invalid-session', message: 'Invalid request.' }, { status: 400 });
  }

  const adminAuth = getFirebaseAdminAuth();

  // Verify the ID token before minting anything from it. Rejects malformed,
  // expired, or otherwise invalid tokens outright.
  try {
    await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    logAuthEvent('auth.login.failure', { reason: 'invalid_id_token', errorCode: safeErrorCode(error) });
    return NextResponse.json(
      { code: 'auth/invalid-session', message: 'Could not verify your sign-in. Please try again.' },
      { status: 401 },
    );
  }

  let sessionCookie: string;
  try {
    sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: getSessionCookieMaxAgeMs() });
  } catch (error) {
    logAuthEvent('backend.unexpected_error', { context: 'create_session_cookie', errorCode: safeErrorCode(error) });
    return NextResponse.json(
      { code: 'auth/session-creation-failed', message: 'Could not complete sign-in. Please try again.' },
      { status: 500 },
    );
  }

  const attrs = getSessionCookieAttributes();
  const cookieStore = await cookies();
  cookieStore.set(attrs.name, sessionCookie, {
    httpOnly: attrs.httpOnly,
    secure: attrs.secure,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: attrs.maxAge,
  });

  return NextResponse.json({ ok: true });
}

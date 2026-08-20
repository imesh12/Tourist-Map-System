/**
 * Validates a client-supplied `next` redirect target — checkpoint 1A.7 §8.
 *
 * `next` arrives as an attacker-controllable query parameter (`/login?next=`)
 * and is used to navigate the browser after a successful sign-in. An
 * insufficiently-validated `next` is a classic open-redirect vector — this
 * function is the one place that decision is made, so `/login` (and any
 * future public route with the same pattern) can share it.
 *
 * A naive check like `value.startsWith('/') && !value.startsWith('//')`
 * looks sufficient but is NOT: browsers (and the WHATWG URL parser Node
 * itself uses) treat a leading backslash exactly like a forward slash for
 * "special" schemes such as http/https, so `"/\\evil.example.com"` passes
 * that naive check yet still resolves to the `evil.example.com` origin once
 * parsed — this is a well-known open-redirect bypass. Resolving the value
 * against a fixed, unrelated dummy origin and then comparing the *parsed*
 * origin (not the raw string) closes that gap, because the parser itself
 * performs the same normalization an attacker would rely on.
 */
export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  let resolved: URL;
  try {
    resolved = new URL(value, 'http://internal.invalid');
  } catch {
    return false;
  }

  // If parsing (and WHATWG normalization) landed anywhere other than the
  // fixed dummy origin, `value` pointed off-site — reject outright,
  // regardless of what the raw string looked like.
  if (resolved.origin !== 'http://internal.invalid') {
    return false;
  }

  // Path-segment-aware prefix check — deliberately not
  // `resolved.pathname.startsWith('/admin')`, which would also (wrongly)
  // accept `/adminx` or `/admin-something-else`. Only `/admin` itself, or
  // anything under `/admin/`, is a valid Phase 1A redirect target (§8:
  // "Allowed conceptually: /admin, /admin/account, /admin/...").
  return resolved.pathname === '/admin' || resolved.pathname.startsWith('/admin/');
}

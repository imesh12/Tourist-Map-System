import type { FirestoreTimestampLike } from 'shared-types';

/**
 * A deterministic, server/client-identical timestamp formatter —
 * checkpoint 1B.8 repair round, real bug: `map-settings-form.tsx`'s
 * "Last published {timestamp}" row previously called
 * `new Date(...).toLocaleString()` with no explicit locale/timeZone.
 * `toLocaleString()`'s output depends on the ICU data and default locale of
 * whatever environment is running it — Node (this app's Server Component
 * SSR pass) and Chromium (the browser hydrating that same HTML) can and do
 * disagree (observed: server produced `2026/8/25 15:13:56`, client produced
 * `8/25/2026, 3:13:56 PM` for the identical instant), which is a textbook
 * React hydration mismatch: the server-rendered HTML text does not match
 * what the client computes on its first render, so React has to discard and
 * re-render the mismatched subtree.
 *
 * The fix is to never let locale/timezone enter the computation at all.
 * Every function below reads only the UTC-based `Date` getters
 * (`getUTCFullYear()`, `getUTCMonth()`, ...) and manually assembles a fixed
 * `YYYY-MM-DD HH:mm UTC` string — no `Intl`, no implicit locale, no host
 * timezone. Per ECMA-262, these UTC getters are pure functions of the
 * instant in time; they return the identical result in Node and in every
 * browser engine, regardless of the OS's configured locale or timezone.
 * `suppressHydrationWarning` was deliberately NOT used — silencing the
 * warning would still leave the actual server/client text moving around on
 * this page, which real users would visibly notice on load.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * `{seconds, nanoseconds}` (the plain-object shape every stored Firestore
 * timestamp is read back as in this codebase — see `FirestoreTimestampLike`)
 * → a fixed `YYYY-MM-DD HH:mm UTC` string. Minute precision is enough for a
 * "Last published" label; this deliberately does not attempt to show the
 * viewer's own local time (which would reintroduce the same
 * server-vs-client divergence this function exists to eliminate).
 */
export function formatPublishedAt(timestamp: FirestoreTimestampLike): string {
  const date = new Date(timestamp.seconds * 1000);
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

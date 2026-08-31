import type { PublicMapSnapshotParsed } from 'validation';

/**
 * Checkpoint 1B.9 — the local, UI-facing result shape
 * `fetchPublicMapSnapshot()` (./public-map-client.ts) returns. Deliberately
 * NOT added to `shared-types`: this discriminated union describes how
 * *this app's* fetch layer models an outcome (a normal HTTP-client concern),
 * not a cross-app domain concept the way `PublicMapSnapshot` itself is —
 * `shared-types` stays "framework-agnostic domain types... no... UI state"
 * per its own package doc comment (packages/shared-types/src/index.ts).
 *
 * Three, and only three, outcomes — matching exactly what the public route
 * itself can ever mean (see apps/admin-web/app/api/public/maps/[mapId]/
 * route.ts's own doc comment):
 *
 * - `'ok'` — a real, schema-valid published snapshot.
 * - `'not-found'` — the map does not exist, or exists but was never
 *   published. These are DELIBERATELY indistinguishable here too, exactly
 *   like the endpoint's own anti-enumeration collapse — this app must not
 *   invent a way to tell them apart from the client side.
 * - `'error'` — anything else: a network failure, a non-2xx/non-404
 *   response, or a 200 response whose body fails schema validation. Never
 *   exposes the underlying technical reason to a caller — see
 *   `PublicMapFetchResult`'s own field-level comments.
 */
export type PublicMapFetchResult =
  | { readonly status: 'ok'; readonly snapshot: PublicMapSnapshotParsed }
  | { readonly status: 'not-found' }
  | { readonly status: 'error' };

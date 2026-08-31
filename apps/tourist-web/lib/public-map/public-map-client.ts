import { publicMapSnapshotSchema } from 'validation';
import type { PublicMapFetchResult } from './public-map-types';

/**
 * The ONE place `tourist-web` ever reads map data from — checkpoint 1B.9.
 *
 * This calls `GET {ADMIN_PUBLIC_API_BASE_URL}/api/public/maps/{mapId}`
 * (checkpoint 1B.8's public read endpoint,
 * apps/admin-web/app/api/public/maps/[mapId]/route.ts) over a plain HTTP
 * fetch — never the Firebase Admin SDK, never a direct Firestore read.
 * `tourist-web` has no Firebase Admin credentials configured anywhere in
 * this app at all (see the repo audit note in
 * docs/architecture/PUBLISHING_ARCHITECTURE.md's "Public Read Boundary"
 * section) — this file is the architectural proof of that boundary, not
 * merely a convention: there is no other code path in this app that could
 * reach draft Firestore data even if it wanted to.
 *
 * `ADMIN_PUBLIC_API_BASE_URL` — server-only (never `NEXT_PUBLIC_`, see
 * .env.example's own comment) because this is called exclusively from the
 * Server Component at app/maps/[mapId]/page.tsx, never from the browser
 * (checkpoint 1B.9 §10/§2: "Prefer server-side fetching from the
 * tourist-web server where possible"). Defaults to `http://localhost:3000`
 * (admin-web's own default `pnpm dev` port) so local development works
 * without first creating a `.env.local` — a practical default, not a
 * production one; a real deployment always sets this explicitly.
 *
 * `cache: 'no-store'` — this snapshot represents "the CURRENT published
 * version," and the draft/publish isolation boundary this checkpoint must
 * prove (§3) requires that a fresh Publish become visible on the very next
 * request, not after some Next.js Data Cache TTL expires. The admin
 * endpoint itself is already cheap (two Firestore document reads), so there
 * is no meaningful performance cost to always reading live.
 *
 * Never throws — every failure mode (network error, non-2xx/non-404 status,
 * malformed/invalid JSON body, a 200 body that fails schema validation) is
 * caught and folded into `{ status: 'error' }`, so a caller never needs a
 * second try/catch layer of its own. See `PublicMapFetchResult`'s own doc
 * comment for the full three-outcome contract this returns.
 */
export async function fetchPublicMapSnapshot(mapId: string): Promise<PublicMapFetchResult> {
  const baseUrl = process.env.ADMIN_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  const url = `${baseUrl.replace(/\/+$/, '')}/api/public/maps/${encodeURIComponent(mapId)}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    // Network failure (admin-web unreachable, DNS, timeout, ...) — never
    // exposes the underlying cause (§13: no technical details to the
    // visitor; §12: no internal Firebase/infra errors leaked).
    return { status: 'error' };
  }

  if (response.status === 404) {
    // Deliberately the SAME outcome as "does not exist" and "never
    // published" — this app never tries to tell them apart, mirroring the
    // endpoint's own anti-enumeration collapse (see its doc comment).
    return { status: 'not-found' };
  }

  if (!response.ok) {
    // Any other non-success status (5xx, an unexpected 4xx, ...) — a
    // generic server-failure state, never surfaced with detail.
    return { status: 'error' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'error' };
  }

  const parsed = publicMapSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    // A 200 response that doesn't actually match the published-snapshot
    // contract is treated as a server failure, never rendered partially or
    // trusted as-is — the same "trust the writer, still validate the shape
    // on every read" posture the schema's own doc comment describes.
    return { status: 'error' };
  }

  return { status: 'ok', snapshot: parsed.data };
}

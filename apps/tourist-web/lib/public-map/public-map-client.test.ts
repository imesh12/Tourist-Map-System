import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicMapSnapshot } from './public-map-client';

/**
 * `fetchPublicMapSnapshot()` unit tests — checkpoint 1B.9 §16 (A/B/C).
 * `global.fetch` is stubbed directly (no real network call, no admin-web
 * server needed) — this only proves the CLIENT's own parsing/branching
 * logic; the real end-to-end contract against a running admin-web is what
 * apps/admin-web/e2e/public-tourist-map.spec.ts proves instead.
 */

const validPublicSnapshot = {
  schemaVersion: 1,
  publicationId: 'pub_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  version: 1,
  publishedAt: { seconds: 1700000000, nanoseconds: 0 },
  map: {
    name: 'Kyoto Tours Map',
    mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
    area: { type: 'UNBOUNDED' },
    theme: {
      preset: 'STANDARD',
      visibility: {
        businessPois: true,
        transit: true,
        schools: true,
        hospitals: true,
        parks: true,
        roadLabels: true,
        transitLabels: true,
      },
      markerStyle: { style: 'PIN', size: 'MEDIUM' },
    },
  },
  menu: [],
  categories: [],
  pois: [],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchPublicMapSnapshot — checkpoint 1B.9', () => {
  const originalBaseUrl = process.env.ADMIN_PUBLIC_API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ADMIN_PUBLIC_API_BASE_URL = 'http://admin.internal.test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.ADMIN_PUBLIC_API_BASE_URL;
    } else {
      process.env.ADMIN_PUBLIC_API_BASE_URL = originalBaseUrl;
    }
  });

  it('(A) parses a valid published snapshot into status "ok"', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, validPublicSnapshot));
    const result = await fetchPublicMapSnapshot('map_aB3dEf6gH9jKlMn0pQ');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.snapshot.map.name).toBe('Kyoto Tours Map');
      expect(result.snapshot.version).toBe(1);
    }
  });

  it('fetches the exact expected URL, built from ADMIN_PUBLIC_API_BASE_URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validPublicSnapshot));
    global.fetch = fetchMock;
    await fetchPublicMapSnapshot('map_aB3dEf6gH9jKlMn0pQ');
    expect(fetchMock).toHaveBeenCalledWith('http://admin.internal.test/api/public/maps/map_aB3dEf6gH9jKlMn0pQ', { cache: 'no-store' });
  });

  it('(B) treats a 404 response as "not-found"', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(404, { code: 'public-map/not-found', message: 'This map is not available.' }));
    const result = await fetchPublicMapSnapshot('map_doesnotexist00000000000');
    expect(result).toEqual({ status: 'not-found' });
  });

  it('(C) treats a 500 response as "error"', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(500, { code: 'internal', message: 'boom' }));
    const result = await fetchPublicMapSnapshot('map_aB3dEf6gH9jKlMn0pQ');
    expect(result).toEqual({ status: 'error' });
  });

  it('(C) treats a rejected fetch (network failure) as "error"', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchPublicMapSnapshot('map_aB3dEf6gH9jKlMn0pQ');
    expect(result).toEqual({ status: 'error' });
  });

  it('treats a 200 response with a malformed JSON body as "error"', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
    const result = await fetchPublicMapSnapshot('map_aB3dEf6gH9jKlMn0pQ');
    expect(result).toEqual({ status: 'error' });
  });

  it('treats a 200 response that fails schema validation as "error" (never trusts the shape blindly)', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ...validPublicSnapshot, map: { name: 'Missing everything else' } }));
    const result = await fetchPublicMapSnapshot('map_aB3dEf6gH9jKlMn0pQ');
    expect(result).toEqual({ status: 'error' });
  });

  it('treats a 200 response that still carries customerId as "error" (public schema rejects it via .strict())', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ...validPublicSnapshot, customerId: 'cust_leaked00000000000000000' }));
    const result = await fetchPublicMapSnapshot('map_aB3dEf6gH9jKlMn0pQ');
    expect(result).toEqual({ status: 'error' });
  });
});

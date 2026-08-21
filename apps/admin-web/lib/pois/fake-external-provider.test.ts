import { describe, expect, it } from 'vitest';
import { FAKE_PROVIDER_ERROR_TRIGGER_RADIUS_METERS, FakeGooglePlacesProvider } from './fake-external-provider';

const CENTER = { latitude: 35.6812, longitude: 139.7671 };

describe('FakeGooglePlacesProvider', () => {
  it('returns deterministic, fixed candidates for discoverNearby', async () => {
    const provider = new FakeGooglePlacesProvider();
    const results = await provider.discoverNearby({ center: CENTER, radiusMeters: 1000, includedTypes: ['restaurant'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((candidate) => candidate.providerPlaceId)).toEqual(['places/fake-restaurant-1', 'places/fake-restaurant-2']);
    expect(results.every((candidate) => candidate.provider === 'GOOGLE')).toBe(true);
  });

  it('places every candidate near the requested center (no real network call, purely a local offset)', async () => {
    const provider = new FakeGooglePlacesProvider();
    const results = await provider.discoverNearby({ center: CENTER, radiusMeters: 1000, includedTypes: ['restaurant'] });
    for (const candidate of results) {
      expect(Math.abs(candidate.location.latitude - CENTER.latitude)).toBeLessThan(0.1);
      expect(Math.abs(candidate.location.longitude - CENTER.longitude)).toBeLessThan(0.1);
    }
  });

  it('returns the same results regardless of radius/includedTypes (deterministic, not provider-realistic)', async () => {
    const provider = new FakeGooglePlacesProvider();
    const a = await provider.discoverNearby({ center: CENTER, radiusMeters: 500, includedTypes: ['restaurant'] });
    const b = await provider.discoverNearby({ center: CENTER, radiusMeters: 2000, includedTypes: ['cafe'] });
    expect(a.map((c) => c.providerPlaceId)).toEqual(b.map((c) => c.providerPlaceId));
  });

  it('throws when radiusMeters is the reserved error-trigger sentinel', async () => {
    const provider = new FakeGooglePlacesProvider();
    await expect(
      provider.discoverNearby({ center: CENTER, radiusMeters: FAKE_PROVIDER_ERROR_TRIGGER_RADIUS_METERS, includedTypes: ['restaurant'] }),
    ).rejects.toThrow();
  });

  it('resolves place details for a known providerPlaceId', async () => {
    const provider = new FakeGooglePlacesProvider();
    const details = await provider.getPlaceDetails('places/fake-restaurant-1');
    expect(details?.name).toBe('Sakura Sushi Bar');
    expect(details?.provider).toBe('GOOGLE');
  });

  it('returns undefined for an unknown providerPlaceId', async () => {
    const provider = new FakeGooglePlacesProvider();
    expect(await provider.getPlaceDetails('places/does-not-exist')).toBeUndefined();
  });
});

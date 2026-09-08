import { describe, expect, it } from 'vitest';
import {
  FAKE_PROVIDER_ERROR_TRIGGER_RADIUS_METERS,
  FAKE_PROVIDER_PHOTO_PLACE_ID,
  FAKE_PROVIDER_PHOTO_RESOURCE_NAME,
  FAKE_PROVIDER_PHOTO_RESOURCE_NAMES,
  FakeGooglePlacesProvider,
} from './fake-external-provider';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // \x89 P N G

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

describe('FakeGooglePlacesProvider — photo methods (Photo Experience Prototype checkpoint)', () => {
  it('getPlaceDetails reports hasPhoto: true for the deterministic photo fixture, false for the other', async () => {
    const provider = new FakeGooglePlacesProvider();
    expect((await provider.getPlaceDetails(FAKE_PROVIDER_PHOTO_PLACE_ID))?.hasPhoto).toBe(true);
    expect((await provider.getPlaceDetails('places/fake-restaurant-2'))?.hasPhoto).toBe(false);
  });

  it('discoverNearby stamps hasPhoto onto each candidate via getPlaceDetails, split the same fixed way', async () => {
    const provider = new FakeGooglePlacesProvider();
    const [withPhoto, withoutPhoto] = await Promise.all([
      provider.getPlaceDetails(FAKE_PROVIDER_PHOTO_PLACE_ID),
      provider.getPlaceDetails('places/fake-restaurant-2'),
    ]);
    expect(withPhoto?.hasPhoto).toBe(true);
    expect(withoutPhoto?.hasPhoto).toBe(false);
  });

  it('getPlacePhotoRefs resolves a stable gallery (distinct name + per-index attribution) for the photo fixture only', async () => {
    const provider = new FakeGooglePlacesProvider();
    const refs = await provider.getPlacePhotoRefs(FAKE_PROVIDER_PHOTO_PLACE_ID);
    expect(refs.map((ref) => ref.name)).toEqual(FAKE_PROVIDER_PHOTO_RESOURCE_NAMES);
    expect(refs[0]?.name).toBe(FAKE_PROVIDER_PHOTO_RESOURCE_NAME);
    // each photo carries its OWN attribution so a gallery E2E can prove the credit changes on nav
    expect(new Set(refs.map((ref) => ref.attributions[0]?.displayName)).size).toBe(refs.length);
    expect(refs[0]?.attributions).toEqual([{ displayName: 'Fake Photographer 0', uri: 'https://example.com/fake-attribution-0' }]);
  });

  it('getPlacePhotoRefs resolves [] for the no-photo fixture and any unknown id', async () => {
    const provider = new FakeGooglePlacesProvider();
    expect(await provider.getPlacePhotoRefs('places/fake-restaurant-2')).toEqual([]);
    expect(await provider.getPlacePhotoRefs('places/does-not-exist')).toEqual([]);
  });

  it('getPlacePhotoMedia returns real, decodable PNG bytes for ANY of the fixture gallery resource names', async () => {
    const provider = new FakeGooglePlacesProvider();
    for (const name of FAKE_PROVIDER_PHOTO_RESOURCE_NAMES) {
      const media = await provider.getPlacePhotoMedia(name);
      expect(media?.contentType).toBe('image/png');
      expect(Array.from(media?.bytes.slice(0, 4) ?? [])).toEqual(PNG_MAGIC);
    }
  });

  it('getPlacePhotoMedia returns undefined for any other resource name', async () => {
    const provider = new FakeGooglePlacesProvider();
    expect(await provider.getPlacePhotoMedia('places/fake-restaurant-1/photos/not-the-one')).toBeUndefined();
  });
});

describe('FakeGooglePlacesProvider — getPlaceMetadata (rich-detail expansion)', () => {
  it('resolves a fixed rich metadata object for the photo fixture (every detail-panel row present)', async () => {
    const provider = new FakeGooglePlacesProvider();
    const metadata = await provider.getPlaceMetadata(FAKE_PROVIDER_PHOTO_PLACE_ID);
    expect(metadata).toMatchObject({
      rating: 4.5,
      userRatingCount: 128,
      priceLevel: 'MODERATE',
      primaryTypeDisplayName: 'Sushi restaurant',
      utcOffsetMinutes: 540,
      websiteUri: 'https://example.com/sakura-sushi',
      nationalPhoneNumber: '03-1234-5678',
      dineIn: true,
      takeout: true,
      delivery: false,
    });
    expect(metadata?.openingHours?.periods.length).toBe(5);
    expect(metadata?.openingHours?.weekdayDescriptions.length).toBe(7);
    // never leaks the provider identity
    expect(JSON.stringify(metadata)).not.toContain('fake-restaurant-1');
  });

  it('resolves undefined for the no-photo fixture and any unknown id (exercises the "no place metadata" path)', async () => {
    const provider = new FakeGooglePlacesProvider();
    expect(await provider.getPlaceMetadata('places/fake-restaurant-2')).toBeUndefined();
    expect(await provider.getPlaceMetadata('places/does-not-exist')).toBeUndefined();
  });
});

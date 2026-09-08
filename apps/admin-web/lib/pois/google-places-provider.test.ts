import { afterEach, describe, expect, it, vi } from 'vitest';
import { GooglePlacesProvider } from './google-places-provider';

/**
 * `GooglePlacesProvider` focused unit tests — Photo Experience Prototype
 * checkpoint. The discover/import happy paths are already covered end-to-end
 * by the hermetic E2E suite (`e2e/google-places-discovery.spec.ts`, via the
 * fake provider); these tests target only the NEW photo-resolution methods
 * and the `hasPhoto` derivation, with `fetch` stubbed so no real Google
 * request is ever made. They assert the exact field mask / URL contract the
 * adapter's own doc comment promises, since that is what keeps Places
 * billing bounded.
 */

const API_KEY = 'test-key';

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

function bytesResponse(bytes: Uint8Array, contentType: string | null, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GooglePlacesProvider.getPlaceDetails — hasPhoto derivation', () => {
  it('sets hasPhoto: true when the Details response carries a non-empty photos array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'places/ChIJ_x',
        displayName: { text: 'Sakura' },
        location: { latitude: 1, longitude: 2 },
        photos: [{ name: 'places/ChIJ_x/photos/a' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const details = await new GooglePlacesProvider(API_KEY).getPlaceDetails('places/ChIJ_x');
    expect(details?.hasPhoto).toBe(true);

    const [, options] = fetchMock.mock.calls[0]!;
    expect((options.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('photos');
  });

  it('sets hasPhoto: false when the Details response has no photos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ id: 'places/ChIJ_y', displayName: { text: 'Kaede' }, location: { latitude: 1, longitude: 2 } }),
      ),
    );
    const details = await new GooglePlacesProvider(API_KEY).getPlaceDetails('places/ChIJ_y');
    expect(details?.hasPhoto).toBe(false);
  });
});

describe('GooglePlacesProvider.getPlacePhotoRefs', () => {
  it('returns EVERY usable photo in order (name, dimensions, filtered attributions), capped, using the narrow photo field mask', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        photos: [
          {
            name: 'places/ChIJ_x/photos/AeUwx',
            widthPx: 4032,
            heightPx: 3024,
            authorAttributions: [
              { displayName: 'Jane Doe', uri: 'https://maps.example/jane' },
              { displayName: '' }, // dropped — no displayName
              { uri: 'https://maps.example/anon' }, // dropped — no displayName
            ],
          },
          { name: 'places/ChIJ_x/photos/second' },
          { widthPx: 100 }, // dropped — no name
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const refs = await new GooglePlacesProvider(API_KEY).getPlacePhotoRefs('ChIJ_x');
    expect(refs).toEqual([
      {
        name: 'places/ChIJ_x/photos/AeUwx',
        widthPx: 4032,
        heightPx: 3024,
        attributions: [{ displayName: 'Jane Doe', uri: 'https://maps.example/jane' }],
      },
      { name: 'places/ChIJ_x/photos/second', attributions: [] },
    ]);

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJ_x');
    expect((options.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'photos.name,photos.widthPx,photos.heightPx,photos.authorAttributions',
    );
  });

  it('caps the gallery at MAX_GALLERY_PHOTOS even when Google returns more', async () => {
    const manyPhotos = Array.from({ length: 25 }, (_unused, index) => ({ name: `places/ChIJ_x/photos/p${index}` }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ photos: manyPhotos })));
    const refs = await new GooglePlacesProvider(API_KEY).getPlacePhotoRefs('ChIJ_x');
    expect(refs.length).toBe(10);
    expect(refs[0]?.name).toBe('places/ChIJ_x/photos/p0');
  });

  it('returns [] when the place has no photos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    expect(await new GooglePlacesProvider(API_KEY).getPlacePhotoRefs('ChIJ_x')).toEqual([]);
  });

  it('returns [] on a 404 (place gone) — never throws for that case', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 404 })));
    expect(await new GooglePlacesProvider(API_KEY).getPlacePhotoRefs('ChIJ_x')).toEqual([]);
  });

  it('throws on any other non-ok status (the public route turns that into a generic 404 itself)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));
    await expect(new GooglePlacesProvider(API_KEY).getPlacePhotoRefs('ChIJ_x')).rejects.toThrow();
  });
});

describe('GooglePlacesProvider.getPlaceMetadata (rich-detail expansion)', () => {
  it('normalizes the Enterprise+Atmosphere Place Details response using an EXPLICIT field mask (never "*")', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'places/ChIJ_x',
        rating: 4.3,
        userRatingCount: 512,
        priceLevel: 'PRICE_LEVEL_EXPENSIVE',
        primaryTypeDisplayName: { text: 'Italian restaurant' },
        regularOpeningHours: {
          periods: [
            { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
            { open: { day: 2, hour: 9, minute: 0 } }, // 24h — no close
            { garbage: true }, // dropped — no usable open
          ],
          weekdayDescriptions: ['Monday: 9:00 AM – 5:30 PM', 42 as unknown as string],
        },
        utcOffsetMinutes: -300,
        websiteUri: 'https://example.com/trattoria',
        nationalPhoneNumber: '(212) 555-0100',
        dineIn: true,
        takeout: false,
        delivery: true,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const metadata = await new GooglePlacesProvider(API_KEY).getPlaceMetadata('ChIJ_x');
    expect(metadata).toEqual({
      rating: 4.3,
      userRatingCount: 512,
      priceLevel: 'EXPENSIVE',
      primaryTypeDisplayName: 'Italian restaurant',
      openingHours: {
        periods: [
          { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
          { open: { day: 2, hour: 9, minute: 0 } },
        ],
        weekdayDescriptions: ['Monday: 9:00 AM – 5:30 PM'],
      },
      utcOffsetMinutes: -300,
      websiteUri: 'https://example.com/trattoria',
      nationalPhoneNumber: '(212) 555-0100',
      dineIn: true,
      takeout: false,
      delivery: true,
    });

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJ_x');
    const mask = (options.headers as Record<string, string>)['X-Goog-FieldMask'] ?? '';
    expect(mask).not.toContain('*');
    expect(mask.split(',')).toEqual([
      'id',
      'rating',
      'userRatingCount',
      'priceLevel',
      'primaryTypeDisplayName',
      'regularOpeningHours',
      'utcOffsetMinutes',
      'websiteUri',
      'nationalPhoneNumber',
      'dineIn',
      'takeout',
      'delivery',
    ]);
  });

  it('omits absent fields and maps PRICE_LEVEL_UNSPECIFIED to no priceLevel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'places/ChIJ_x', rating: 4.0, priceLevel: 'PRICE_LEVEL_UNSPECIFIED' })));
    const metadata = await new GooglePlacesProvider(API_KEY).getPlaceMetadata('ChIJ_x');
    expect(metadata).toEqual({ rating: 4.0 });
  });

  it('returns undefined on a 404, throws on any other non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 404 })));
    expect(await new GooglePlacesProvider(API_KEY).getPlaceMetadata('ChIJ_x')).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));
    await expect(new GooglePlacesProvider(API_KEY).getPlaceMetadata('ChIJ_x')).rejects.toThrow();
  });
});

describe('GooglePlacesProvider.getPlacePhotoMedia', () => {
  it('requests the getMedia URL with the clamped dimensions and returns the resolved bytes + content type', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const fetchMock = vi.fn().mockResolvedValue(bytesResponse(png, 'image/png'));
    vi.stubGlobal('fetch', fetchMock);

    const media = await new GooglePlacesProvider(API_KEY).getPlacePhotoMedia('places/ChIJ_x/photos/AeUwx', {
      maxWidthPx: 800,
      maxHeightPx: 800,
    });
    expect(media?.contentType).toBe('image/png');
    expect(Array.from(media?.bytes ?? [])).toEqual(Array.from(png));

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://places.googleapis.com/v1/places/ChIJ_x/photos/AeUwx/media?maxWidthPx=800&maxHeightPx=800',
    );
  });

  it('returns undefined when the upstream omits a content-type header (never proxies bytes of unknown type to the browser)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bytesResponse(new Uint8Array([1, 2, 3]), null)));
    const media = await new GooglePlacesProvider(API_KEY).getPlacePhotoMedia('places/ChIJ_x/photos/AeUwx', {
      maxWidthPx: 800,
      maxHeightPx: 800,
    });
    expect(media).toBeUndefined();
  });

  it('returns undefined when the upstream content-type is not an image type (defense in depth against a spoofed/error payload)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bytesResponse(new Uint8Array([60, 33]), 'text/html; charset=utf-8')));
    const media = await new GooglePlacesProvider(API_KEY).getPlacePhotoMedia('places/ChIJ_x/photos/AeUwx', {
      maxWidthPx: 800,
      maxHeightPx: 800,
    });
    expect(media).toBeUndefined();
  });

  it('accepts an image content type with parameters (e.g. image/jpeg;charset=binary)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bytesResponse(new Uint8Array([0xff, 0xd8]), 'image/jpeg;charset=binary')));
    const media = await new GooglePlacesProvider(API_KEY).getPlacePhotoMedia('places/ChIJ_x/photos/AeUwx', {
      maxWidthPx: 800,
      maxHeightPx: 800,
    });
    expect(media?.contentType).toBe('image/jpeg;charset=binary');
  });

  it('returns undefined on any non-ok response (expired photo resource, upstream error) — never a thrown error or a leaked body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bytesResponse(new Uint8Array(), null, { status: 403 })));
    const media = await new GooglePlacesProvider(API_KEY).getPlacePhotoMedia('places/ChIJ_x/photos/AeUwx', {
      maxWidthPx: 800,
      maxHeightPx: 800,
    });
    expect(media).toBeUndefined();
  });
});

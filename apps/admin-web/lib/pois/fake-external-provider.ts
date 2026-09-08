import type {
  ExternalPoiCandidate,
  ExternalPoiDetails,
  ExternalPoiPhotoMedia,
  ExternalPoiPhotoRef,
  ExternalPoiPlaceMetadata,
  ExternalPoiProvider,
  ExternalPoiSearchParams,
} from './external-provider';

/**
 * `FakeGooglePlacesProvider` — checkpoint 1B.4's hermetic test double for
 * `ExternalPoiProvider`, mirroring this codebase's existing "no real/
 * billable Google network call in tests" discipline
 * (`e2e/constants.ts`'s `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: ''`, which forces
 * the Google Maps JS map preview into its documented no-API-key fallback
 * state instead of loading the real Maps JS API in E2E). This is the
 * server-side equivalent for the NEW Google Places REST calls this
 * checkpoint adds: `./provider-registry.ts` returns an instance of this
 * class instead of `GooglePlacesProvider` whenever
 * `E2E_FAKE_EXTERNAL_POI_PROVIDER=true` is set (see that file), which
 * `e2e/constants.ts`'s `E2E_APP_ENV` sets for the whole E2E `next dev`
 * process — so no test ever needs its own per-test wiring, and the real
 * `GooglePlacesProvider` class (and therefore any real Google endpoint) is
 * never imported into the request path at all while this flag is set.
 *
 * Deterministic by design: always returns the same two fixed candidates
 * near whatever center it's asked to search around (offsetting by a small
 * fixed delta), regardless of the real radius/includedTypes requested —
 * enough to prove discovery renders results, import persists the correct
 * data, and duplicate-import protection works, without needing a real
 * places catalog.
 *
 * One deliberate, documented test-only trigger: a search requesting EXACTLY
 * `radiusMeters: 999` throws, simulating a provider failure — this specific
 * value is never offered by the real Discover Places UI's radius `<select>`
 * (see `discover-places-drawer.tsx`'s fixed preset options), so it only
 * ever fires when an E2E test deliberately POSTs it directly to
 * `/api/map/pois/discover` (the same "bypass the UI, hit the API directly"
 * pattern `e2e/pois.spec.ts`'s tests O/P already use for other edge cases) —
 * see `e2e/google-places-discovery.spec.ts`'s "provider-error safe UI" test.
 *
 * PHOTO EXPERIENCE PROTOTYPE checkpoint — `places/fake-restaurant-1`
 * deterministically HAS a photo (`getPlaceDetails().hasPhoto === true`,
 * `getPlacePhotoRef()`/`getPlacePhotoMedia()` both resolve) and
 * `places/fake-restaurant-2` deterministically has NONE (`hasPhoto ===
 * false`, both photo methods resolve `undefined`) — a fixed, intentional
 * split so the hermetic E2E suite can prove BOTH the photo-marker/rich-
 * detail-cover path AND the "no photo, unchanged category marker, no
 * placeholder" fallback path through REAL HTTP requests to the real public
 * photo endpoints, with no mocking framework and no real Google credential,
 * exactly like every other hermetic E2E flow in this codebase. The fake
 * photo bytes are a tiny, real, valid 1x1 PNG (not an arbitrary string) so
 * a test can assert a genuine `Content-Type: image/png` response and decode
 * real (if trivial) image bytes.
 */

const LOCATION_OFFSET_DEGREES = 0.004; // ≈400m — close enough to always read as "nearby" regardless of the real search radius.

/** checkpoint 1B.4 hermetic E2E hook — see this file's own doc comment. Not a real, physically meaningful radius; reserved exclusively for tests that deliberately exercise the provider-error path. */
export const FAKE_PROVIDER_ERROR_TRIGGER_RADIUS_METERS = 999;

/** Photo Experience Prototype checkpoint hermetic E2E hook — see this file's own doc comment. The one fixed `providerPlaceId` whose photo/metadata methods resolve fake data. */
export const FAKE_PROVIDER_PHOTO_PLACE_ID = 'places/fake-restaurant-1';
/** How many fake photos `getPlacePhotoRefs('places/fake-restaurant-1')` resolves — enough for the gallery E2E to exercise prev/next + a dot/count indicator. */
export const FAKE_PROVIDER_PHOTO_COUNT = 3;
/** The fixed fake photo resource names (`photos/fake-photo-0..2`), as `getPlacePhotoRefs()` would return them — exposed for tests that call `getPlacePhotoMedia()` directly. `[0]` is the first / cover. */
export const FAKE_PROVIDER_PHOTO_RESOURCE_NAMES = Array.from(
  { length: FAKE_PROVIDER_PHOTO_COUNT },
  (_unused, index) => `${FAKE_PROVIDER_PHOTO_PLACE_ID}/photos/fake-photo-${index}`,
);
/** Back-compat alias for the cover photo's resource name (previously the only fake photo). */
export const FAKE_PROVIDER_PHOTO_RESOURCE_NAME = `${FAKE_PROVIDER_PHOTO_PLACE_ID}/photos/fake-photo-0`;

// A real, minimal, valid 1x1 transparent PNG — small enough to inline as a
// literal, large enough to be a genuine decodable image (not just an
// arbitrary byte string), so E2E can assert real `Content-Type: image/png`
// bytes came back through the real HTTP route.
const FAKE_PHOTO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const FIXED_CANDIDATES: readonly ExternalPoiCandidate[] = [
  {
    provider: 'GOOGLE',
    providerPlaceId: FAKE_PROVIDER_PHOTO_PLACE_ID,
    name: 'Sakura Sushi Bar',
    location: { latitude: 0, longitude: 0 }, // Overwritten relative to the search center at call time — see discoverNearby().
    address: '1-1 Fake Street, Test City',
    distanceMeters: 120,
  },
  {
    provider: 'GOOGLE',
    providerPlaceId: 'places/fake-restaurant-2',
    name: 'Tokyo Ramen House',
    location: { latitude: 0, longitude: 0 },
    address: '2-2 Fake Avenue, Test City',
    distanceMeters: 340,
  },
];

export class FakeGooglePlacesProvider implements ExternalPoiProvider {
  async discoverNearby(params: ExternalPoiSearchParams): Promise<readonly ExternalPoiCandidate[]> {
    if (params.radiusMeters === FAKE_PROVIDER_ERROR_TRIGGER_RADIUS_METERS) {
      throw new Error('FakeGooglePlacesProvider: simulated provider error (checkpoint 1B.4 hermetic E2E trigger)');
    }
    return FIXED_CANDIDATES.map((candidate, index) => ({
      ...candidate,
      location: {
        latitude: params.center.latitude + LOCATION_OFFSET_DEGREES * (index + 1),
        longitude: params.center.longitude + LOCATION_OFFSET_DEGREES * (index + 1),
      },
    }));
  }

  async getPlaceDetails(providerPlaceId: string): Promise<ExternalPoiDetails | undefined> {
    const candidate = FIXED_CANDIDATES.find((entry) => entry.providerPlaceId === providerPlaceId);
    if (!candidate) {
      return undefined;
    }
    return {
      provider: 'GOOGLE',
      providerPlaceId: candidate.providerPlaceId,
      name: candidate.name,
      // A fixed, real-looking location (not (0,0)) regardless of which
      // search produced this candidate — import resolves details by ID
      // alone, independent of any particular prior search center.
      location: { latitude: 35.6812 + LOCATION_OFFSET_DEGREES, longitude: 139.7671 + LOCATION_OFFSET_DEGREES },
      ...(candidate.address ? { address: candidate.address } : {}),
      hasPhoto: candidate.providerPlaceId === FAKE_PROVIDER_PHOTO_PLACE_ID,
    };
  }

  async getPlacePhotoRefs(providerPlaceId: string): Promise<readonly ExternalPoiPhotoRef[]> {
    if (providerPlaceId !== FAKE_PROVIDER_PHOTO_PLACE_ID) {
      return [];
    }
    // A distinct, per-index attribution so a gallery E2E can prove the
    // credit line changes as the visitor navigates photos.
    return FAKE_PROVIDER_PHOTO_RESOURCE_NAMES.map((name, index) => ({
      name,
      widthPx: 1,
      heightPx: 1,
      attributions: [{ displayName: `Fake Photographer ${index}`, uri: `https://example.com/fake-attribution-${index}` }],
    }));
  }

  // The `options` (max width/height) argument the `ExternalPoiProvider`
  // interface declares is deliberately omitted here — the fake always
  // returns the same fixed 1x1 PNG regardless of requested dimensions, and
  // TypeScript's structural typing lets an implementation take fewer
  // parameters than the interface method it satisfies.
  async getPlacePhotoMedia(photoName: string): Promise<ExternalPoiPhotoMedia | undefined> {
    if (!FAKE_PROVIDER_PHOTO_RESOURCE_NAMES.includes(photoName)) {
      return undefined;
    }
    return {
      contentType: 'image/png',
      bytes: new Uint8Array(Buffer.from(FAKE_PHOTO_PNG_BASE64, 'base64')),
    };
  }

  /**
   * Photo Experience Prototype checkpoint (rich-detail expansion) — a fixed,
   * rich metadata object for `places/fake-restaurant-1` (so the publish +
   * public-projection + detail-UI E2E has every row to assert), and
   * `undefined` for `places/fake-restaurant-2` (so the "no place metadata /
   * old-publication compatibility" path is exercised too).
   */
  async getPlaceMetadata(providerPlaceId: string): Promise<ExternalPoiPlaceMetadata | undefined> {
    if (providerPlaceId !== FAKE_PROVIDER_PHOTO_PLACE_ID) {
      return undefined;
    }
    return {
      rating: 4.5,
      userRatingCount: 128,
      priceLevel: 'MODERATE',
      primaryTypeDisplayName: 'Sushi restaurant',
      openingHours: {
        // Mon–Fri 11:00–22:00 (day 1..5), closed Sat/Sun.
        periods: [1, 2, 3, 4, 5].map((day) => ({
          open: { day, hour: 11, minute: 0 },
          close: { day, hour: 22, minute: 0 },
        })),
        weekdayDescriptions: [
          'Monday: 11:00 AM – 10:00 PM',
          'Tuesday: 11:00 AM – 10:00 PM',
          'Wednesday: 11:00 AM – 10:00 PM',
          'Thursday: 11:00 AM – 10:00 PM',
          'Friday: 11:00 AM – 10:00 PM',
          'Saturday: Closed',
          'Sunday: Closed',
        ],
      },
      utcOffsetMinutes: 540,
      websiteUri: 'https://example.com/sakura-sushi',
      nationalPhoneNumber: '03-1234-5678',
      dineIn: true,
      takeout: true,
      delivery: false,
    };
  }
}

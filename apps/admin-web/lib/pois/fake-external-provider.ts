import type {
  ExternalPoiCandidate,
  ExternalPoiDetails,
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
 */

const LOCATION_OFFSET_DEGREES = 0.004; // ≈400m — close enough to always read as "nearby" regardless of the real search radius.

/** checkpoint 1B.4 hermetic E2E hook — see this file's own doc comment. Not a real, physically meaningful radius; reserved exclusively for tests that deliberately exercise the provider-error path. */
export const FAKE_PROVIDER_ERROR_TRIGGER_RADIUS_METERS = 999;

const FIXED_CANDIDATES: readonly ExternalPoiCandidate[] = [
  {
    provider: 'GOOGLE',
    providerPlaceId: 'places/fake-restaurant-1',
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
    };
  }
}

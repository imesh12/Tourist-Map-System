import type {
  ExternalPoiCandidate,
  ExternalPoiDetails,
  ExternalPoiProvider,
  ExternalPoiSearchParams,
} from './external-provider';

/**
 * `GooglePlacesProvider` — checkpoint 1B.4's concrete `ExternalPoiProvider`
 * adapter for the Google Places API ("Places API (New)"). This is the ONLY
 * file in this codebase that ever calls a Google Places endpoint or reads a
 * raw Google Places response shape — everything it returns is already
 * normalized to `ExternalPoiCandidate`/`ExternalPoiDetails`
 * (./external-provider.ts) by the time it leaves this class.
 *
 * Credential handling: the constructor takes an already-resolved API key —
 * it never reads `process.env` itself (that's `./provider-registry.ts`'s
 * job, mirroring `lib/firebase/admin.ts`'s "credential resolution is a
 * separate, pure concern from the client that uses it" split). The key is
 * `GOOGLE_PLACES_API_KEY`, server-only, never `NEXT_PUBLIC_` — distinct from
 * the existing browser-side `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (which only
 * ever renders map tiles/markers in the browser and must remain restricted
 * to that use). This key is sent only in a server-to-server request header
 * (`X-Goog-Api-Key`), never logged, and never forwarded to the browser in
 * any response this adapter's callers produce.
 *
 * Uses the Places API (New) `places:searchNearby` and `places/{placeId}`
 * REST endpoints (JSON, API-key auth via header, field masks required on
 * every request to control both response size and billing — Google's own
 * documented requirement, not an optional optimization here). No SDK
 * dependency is added for this — a plain `fetch` call, matching this
 * codebase's existing "no server-side Google SDK, just an authenticated the
 * REST endpoint" precedent (there isn't one yet for Places specifically, but
 * this keeps the dependency surface minimal, matching the project's overall
 * "prefer standard fetch over a heavy client SDK for one narrow server-side
 * call" preference already visible in `lib/firebase/admin.ts`'s own minimal
 * dependency footprint).
 */

const SEARCH_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACE_DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places';

// Field masks — the exact, minimal set of fields this adapter reads. Never
// request more than what `ExternalPoiCandidate`/`ExternalPoiDetails` needs;
// Places API (New) bills per requested field group, so an oversized field
// mask is a real, avoidable cost, not just noise.
const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
].join(',');
const DETAILS_FIELD_MASK = ['id', 'displayName', 'location', 'formattedAddress'].join(',');

interface GooglePlaceLocation {
  readonly latitude?: number;
  readonly longitude?: number;
}

interface GooglePlaceResult {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly location?: GooglePlaceLocation;
  readonly formattedAddress?: string;
}

interface SearchNearbyResponse {
  readonly places?: readonly GooglePlaceResult[];
}

function normalizeCandidate(place: GooglePlaceResult): ExternalPoiCandidate | undefined {
  const providerPlaceId = place.id;
  const name = place.displayName?.text;
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!providerPlaceId || !name || latitude === undefined || longitude === undefined) {
    // A Google Places result missing any of these core fields is not usable
    // — skip it rather than surfacing a half-populated candidate (mirrors
    // this codebase's existing "skip an invalid stored document rather than
    // crash the whole list" convention, e.g. `load-pois.ts`).
    return undefined;
  }
  return {
    provider: 'GOOGLE',
    providerPlaceId,
    name,
    location: { latitude, longitude },
    ...(place.formattedAddress ? { address: place.formattedAddress } : {}),
  };
}

export class GooglePlacesProvider implements ExternalPoiProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async discoverNearby(params: ExternalPoiSearchParams): Promise<readonly ExternalPoiCandidate[]> {
    const response = await fetch(SEARCH_NEARBY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: params.includedTypes,
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: params.center.latitude, longitude: params.center.longitude },
            radius: params.radiusMeters,
          },
        },
      }),
    });

    if (!response.ok) {
      // Never leak the raw Google error body (may include account/billing
      // detail) past this adapter — the caller (the discover route) already
      // converts any thrown error into one safe, generic response.
      throw new Error(`Google Places searchNearby failed with status ${response.status}`);
    }

    const body = (await response.json()) as SearchNearbyResponse;
    return (body.places ?? []).map(normalizeCandidate).filter((candidate): candidate is ExternalPoiCandidate => candidate !== undefined);
  }

  async getPlaceDetails(providerPlaceId: string): Promise<ExternalPoiDetails | undefined> {
    const response = await fetch(`${PLACE_DETAILS_BASE_URL}/${encodeURIComponent(providerPlaceId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': DETAILS_FIELD_MASK,
      },
    });

    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Google Places place details failed with status ${response.status}`);
    }

    const place = (await response.json()) as GooglePlaceResult;
    const candidate = normalizeCandidate(place);
    return candidate ? { provider: 'GOOGLE', providerPlaceId: candidate.providerPlaceId, name: candidate.name, location: candidate.location, ...(candidate.address ? { address: candidate.address } : {}) } : undefined;
  }
}

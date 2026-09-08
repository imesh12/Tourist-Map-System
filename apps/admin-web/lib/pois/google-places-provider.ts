import {
  MAX_GALLERY_PHOTOS,
  type ExternalPoiCandidate,
  type ExternalPoiDetails,
  type ExternalPoiOpeningPeriod,
  type ExternalPoiPhotoAttribution,
  type ExternalPoiPhotoMedia,
  type ExternalPoiPhotoRef,
  type ExternalPoiPhotoRequestOptions,
  type ExternalPoiPlaceMetadata,
  type ExternalPoiProvider,
  type ExternalPoiSearchParams,
} from './external-provider';

/**
 * `GooglePlacesProvider` — checkpoint 1B.4's concrete `ExternalPoiProvider`
 * adapter for the Google Places API ("Places API (New)"). This is the ONLY
 * file in this codebase that ever calls a Google Places endpoint or reads a
 * raw Google Places response shape — everything it returns is already
 * normalized to `ExternalPoiCandidate`/`ExternalPoiDetails`/
 * `ExternalPoiPhotoRef`/`ExternalPoiPhotoMedia` (./external-provider.ts) by
 * the time it leaves this class.
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
 * Uses the Places API (New) `places:searchNearby`, `places/{placeId}` and
 * `places/{placeId}/photos/{photoResource}/media` REST endpoints (JSON,
 * API-key auth via header, field masks required on every request to
 * control both response size and billing — Google's own documented
 * requirement, not an optional optimization here). No SDK dependency is
 * added for this — a plain `fetch` call, matching this codebase's existing
 * "no server-side Google SDK, just an authenticated REST endpoint"
 * precedent already visible in `lib/firebase/admin.ts`'s own minimal
 * dependency footprint.
 *
 * PHOTO EXPERIENCE PROTOTYPE checkpoint — `getPlacePhotoRef()`/
 * `getPlacePhotoMedia()` deliberately use a SEPARATE, narrower field mask
 * (`PHOTO_REF_FIELD_MASK`) from `SEARCH_FIELD_MASK`/`DETAILS_FIELD_MASK`
 * rather than folding `photos` into those — those two masks back the
 * discover/import flow, which never needs full photo metadata
 * (`widthPx`/`heightPx`/`authorAttributions`/...), only a cheap presence
 * check (`SEARCH_FIELD_MASK`/`DETAILS_FIELD_MASK` below DO include the
 * bare `photos` group for exactly that presence check — see
 * `normalizeCandidate()`'s `hasPhoto` derivation). Keeping the richer photo
 * field mask separate means the discover/import flow's billing/response
 * size is unaffected by fields it never reads.
 */

const SEARCH_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACE_DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places';

// Field masks — the exact, minimal set of fields this adapter reads. Never
// request more than what `ExternalPoiCandidate`/`ExternalPoiDetails` needs;
// Places API (New) bills per requested field group, so an oversized field
// mask is a real, avoidable cost, not just noise. `photos` (bare, no
// sub-fields) is the cheapest possible way to learn "does this place have
// at least one photo" — Places API (New) field masks support requesting a
// repeated message field bare to get its default projection, which is
// enough for a presence/length check; no photo sub-field is read from
// these two responses (see `PHOTO_REF_FIELD_MASK` below for the actual
// per-photo metadata request, used only by the separate, on-demand photo
// resolution path).
const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.photos',
].join(',');
const DETAILS_FIELD_MASK = ['id', 'displayName', 'location', 'formattedAddress', 'photos'].join(',');

/** Photo Experience Prototype checkpoint — see this file's header comment for why this is a separate, narrower-scoped-to-photos field mask from `DETAILS_FIELD_MASK` above. */
const PHOTO_REF_FIELD_MASK = ['photos.name', 'photos.widthPx', 'photos.heightPx', 'photos.authorAttributions'].join(',');

/**
 * Photo Experience Prototype checkpoint (rich-detail expansion) — the EXACT,
 * EXPLICIT field mask for the Publish-time place-metadata snapshot. Never
 * `*`. Deliberately a THIRD mask, separate from both `DETAILS_FIELD_MASK`
 * (discover/import) and `PHOTO_REF_FIELD_MASK` (photos): those flows never
 * need atmosphere fields, and this one never needs `location`/photos.
 *
 * SKU note: `rating`, `userRatingCount`, `priceLevel`, `regularOpeningHours`,
 * `websiteUri`, `nationalPhoneNumber` and the `dineIn`/`takeout`/`delivery`
 * booleans fall in Google's Enterprise / Enterprise + Atmosphere Place
 * Details SKU tiers — so ONE such Place Details call is billed per
 * `GOOGLE_PLACES` POI per Publish. `id`/`primaryTypeDisplayName`/
 * `utcOffsetMinutes` are cheaper but a mask's price is set by its most
 * expensive field, so the whole call bills at Enterprise + Atmosphere.
 */
const PLACE_METADATA_FIELD_MASK = [
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
].join(',');

const PRICE_LEVEL_MAP: Readonly<Record<string, ExternalPoiPlaceMetadata['priceLevel']>> = {
  PRICE_LEVEL_FREE: 'FREE',
  PRICE_LEVEL_INEXPENSIVE: 'INEXPENSIVE',
  PRICE_LEVEL_MODERATE: 'MODERATE',
  PRICE_LEVEL_EXPENSIVE: 'EXPENSIVE',
  PRICE_LEVEL_VERY_EXPENSIVE: 'VERY_EXPENSIVE',
};

interface GooglePlaceLocation {
  readonly latitude?: number;
  readonly longitude?: number;
}

interface GooglePlaceOpeningHoursPoint {
  readonly day?: number;
  readonly hour?: number;
  readonly minute?: number;
}

interface GooglePlaceOpeningHoursPeriod {
  readonly open?: GooglePlaceOpeningHoursPoint;
  readonly close?: GooglePlaceOpeningHoursPoint;
}

interface GooglePlaceRegularOpeningHours {
  readonly periods?: readonly GooglePlaceOpeningHoursPeriod[];
  readonly weekdayDescriptions?: readonly string[];
}

interface GooglePlaceAuthorAttribution {
  readonly displayName?: string;
  readonly uri?: string;
}

interface GooglePlacePhoto {
  readonly name?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly authorAttributions?: readonly GooglePlaceAuthorAttribution[];
}

interface GooglePlaceResult {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly location?: GooglePlaceLocation;
  readonly formattedAddress?: string;
  readonly photos?: readonly GooglePlacePhoto[];
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly priceLevel?: string;
  readonly primaryTypeDisplayName?: { readonly text?: string };
  readonly regularOpeningHours?: GooglePlaceRegularOpeningHours;
  readonly utcOffsetMinutes?: number;
  readonly websiteUri?: string;
  readonly nationalPhoneNumber?: string;
  readonly dineIn?: boolean;
  readonly takeout?: boolean;
  readonly delivery?: boolean;
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

function normalizeAttributions(attributions: readonly GooglePlaceAuthorAttribution[] | undefined): readonly ExternalPoiPhotoAttribution[] {
  return (attributions ?? [])
    .filter((entry): entry is GooglePlaceAuthorAttribution & { displayName: string } => Boolean(entry.displayName))
    .map((entry) => ({ displayName: entry.displayName, ...(entry.uri ? { uri: entry.uri } : {}) }));
}

/** One `photos[]` entry → an `ExternalPoiPhotoRef`, or `undefined` when it has no resolvable `name`. */
function toPhotoRef(photo: GooglePlacePhoto | undefined): ExternalPoiPhotoRef | undefined {
  if (!photo?.name) {
    return undefined;
  }
  return {
    name: photo.name,
    ...(photo.widthPx !== undefined ? { widthPx: photo.widthPx } : {}),
    ...(photo.heightPx !== undefined ? { heightPx: photo.heightPx } : {}),
    attributions: normalizeAttributions(photo.authorAttributions),
  };
}

function normalizeOpeningPeriod(period: GooglePlaceOpeningHoursPeriod): ExternalPoiOpeningPeriod | undefined {
  const open = period.open;
  if (!open || open.day === undefined || open.hour === undefined || open.minute === undefined) {
    return undefined;
  }
  const close = period.close;
  return {
    open: { day: open.day, hour: open.hour, minute: open.minute },
    ...(close && close.day !== undefined && close.hour !== undefined && close.minute !== undefined
      ? { close: { day: close.day, hour: close.hour, minute: close.minute } }
      : {}),
  };
}

/** Google Place Details → the narrowed, public-safe `ExternalPoiPlaceMetadata`. Undefined/absent Google fields drop out; nothing is invented. */
function normalizePlaceMetadata(place: GooglePlaceResult): ExternalPoiPlaceMetadata {
  const priceLevel = place.priceLevel ? PRICE_LEVEL_MAP[place.priceLevel] : undefined;

  const rawPeriods = place.regularOpeningHours?.periods ?? [];
  const periods = rawPeriods
    .map(normalizeOpeningPeriod)
    .filter((period): period is ExternalPoiOpeningPeriod => period !== undefined);
  const weekdayDescriptions = (place.regularOpeningHours?.weekdayDescriptions ?? []).filter((text) => typeof text === 'string');
  const openingHours =
    periods.length > 0 || weekdayDescriptions.length > 0 ? { periods, weekdayDescriptions } : undefined;

  return {
    ...(typeof place.rating === 'number' ? { rating: place.rating } : {}),
    ...(typeof place.userRatingCount === 'number' ? { userRatingCount: place.userRatingCount } : {}),
    ...(priceLevel ? { priceLevel } : {}),
    ...(place.primaryTypeDisplayName?.text ? { primaryTypeDisplayName: place.primaryTypeDisplayName.text } : {}),
    ...(openingHours ? { openingHours } : {}),
    ...(typeof place.utcOffsetMinutes === 'number' ? { utcOffsetMinutes: place.utcOffsetMinutes } : {}),
    ...(place.websiteUri ? { websiteUri: place.websiteUri } : {}),
    ...(place.nationalPhoneNumber ? { nationalPhoneNumber: place.nationalPhoneNumber } : {}),
    ...(typeof place.dineIn === 'boolean' ? { dineIn: place.dineIn } : {}),
    ...(typeof place.takeout === 'boolean' ? { takeout: place.takeout } : {}),
    ...(typeof place.delivery === 'boolean' ? { delivery: place.delivery } : {}),
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
    if (!candidate) {
      return undefined;
    }
    return {
      provider: 'GOOGLE',
      providerPlaceId: candidate.providerPlaceId,
      name: candidate.name,
      location: candidate.location,
      ...(candidate.address ? { address: candidate.address } : {}),
      // Photo Experience Prototype checkpoint — a cheap presence check from
      // the SAME response, never a second request. See shared-types'
      // `Poi.hasPhoto` doc comment for why this is a hint, not an
      // authoritative/persistable photo reference.
      hasPhoto: (place.photos?.length ?? 0) > 0,
    };
  }

  /**
   * Photo Experience Prototype checkpoint — ALWAYS a fresh live request
   * (never reads a cached/stored photo reference), the conservative posture
   * described in `external-provider.ts`'s header. Returns EVERY usable photo
   * in Google's own order, capped to `MAX_GALLERY_PHOTOS`; this codebase
   * does not implement any photo-quality re-ranking. A 404 or a place with
   * no photos both yield `[]`.
   */
  async getPlacePhotoRefs(providerPlaceId: string): Promise<readonly ExternalPoiPhotoRef[]> {
    const response = await fetch(`${PLACE_DETAILS_BASE_URL}/${encodeURIComponent(providerPlaceId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': PHOTO_REF_FIELD_MASK,
      },
    });

    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw new Error(`Google Places photo lookup failed with status ${response.status}`);
    }

    const place = (await response.json()) as GooglePlaceResult;
    return (place.photos ?? [])
      .slice(0, MAX_GALLERY_PHOTOS)
      .map(toPhotoRef)
      .filter((ref): ref is ExternalPoiPhotoRef => ref !== undefined);
  }

  /**
   * Photo Experience Prototype checkpoint (rich-detail expansion) — a fresh
   * Place Details call with the EXPLICIT `PLACE_METADATA_FIELD_MASK` (never
   * `*`). Called ONLY at Publish time. `undefined` on 404 / any upstream
   * failure — the caller (the publish route) then simply omits `place`.
   */
  async getPlaceMetadata(providerPlaceId: string): Promise<ExternalPoiPlaceMetadata | undefined> {
    const response = await fetch(`${PLACE_DETAILS_BASE_URL}/${encodeURIComponent(providerPlaceId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': PLACE_METADATA_FIELD_MASK,
      },
    });

    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Google Places metadata lookup failed with status ${response.status}`);
    }

    return normalizePlaceMetadata((await response.json()) as GooglePlaceResult);
  }

  /**
   * Photo Experience Prototype checkpoint — Places Photos `getMedia`.
   * `skipHttpRedirect` is left at its default (`false`): Google responds
   * with an HTTP redirect straight to the actual image bytes, and `fetch`
   * follows it automatically (`redirect: 'follow'`, the `fetch` default) —
   * this server never sees, stores, or forwards the redirected image URL
   * itself, only the final bytes, which is exactly the "resolve server-side,
   * never persist a signed/generated media URL" contract this checkpoint
   * requires.
   *
   * Returns `undefined` (never partial data) unless the upstream response is
   * `ok` AND carries an `image/*` content type — the public photo route
   * proxies these bytes straight to an unauthenticated browser, so it must
   * never forward an unexpected payload type (an error page, HTML, ...) with
   * a spoofed or missing content type. A missing / non-image content type is
   * treated exactly like an upstream failure.
   */
  async getPlacePhotoMedia(photoName: string, options: ExternalPoiPhotoRequestOptions): Promise<ExternalPoiPhotoMedia | undefined> {
    const url = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
    url.searchParams.set('maxWidthPx', String(options.maxWidthPx));
    url.searchParams.set('maxHeightPx', String(options.maxHeightPx));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': this.apiKey },
      redirect: 'follow',
    });

    if (!response.ok) {
      // Covers a 404 (photo resource no longer resolvable between ref
      // resolution and this call — expected, since this code never stores
      // or reuses a photo resource name) and any other upstream failure
      // alike; the caller (the public photo route) turns any `undefined`
      // here into one safe, generic 404 — never a leaked Google error body.
      return undefined;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return undefined;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { contentType, bytes };
  }
}

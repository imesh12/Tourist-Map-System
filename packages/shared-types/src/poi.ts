import type { PoiSourceType, PoiStatus } from './enums.js';
import type { CategoryId, CustomerId, MapId, PoiId } from './ids.js';
import type { FirestoreTimestampLike } from './timestamp.js';

/**
 * `maps/{mapId}/pois/{poiId}` — checkpoint 1B.3, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md's POI section. Nested under its
 * owning map, exactly like `Category` (checkpoint 1B.2) — not a top-level
 * collection.
 *
 * A POI is CONTENT, not taxonomy: it always belongs to exactly one existing
 * `Category` (via `categoryId`) and never creates one. See
 * docs/architecture/CATEGORY_ARCHITECTURE.md §5's "categories vs. content
 * items" distinction — that section anticipated this exact model.
 *
 * `customerId`/`mapId` are stored explicitly (not merely implied by the
 * Firestore path), the same defense-in-depth pattern `Category` and
 * `TouristMap` already establish — both are written exclusively by trusted
 * backend code and are never derived from, or overwritable by, client
 * input.
 *
 * `location` is a plain nested `{latitude, longitude}` object, not a
 * Firestore `GeoPoint` — this checkpoint has no geospatial-query requirement
 * (no "POIs near X" search), so a `GeoPoint`'s only benefit (native geohash
 * query support) is not needed yet, and a plain object keeps the shape
 * identical between what the API validates (`validation`'s `poiLocationSchema`)
 * and what Firestore stores.
 *
 * `sourceType` is always `'CLIENT_CUSTOM'` today — the server stamps it on
 * every create; a request body can never assert it (mirrors how
 * `Category.sourceType` works — see `poiCreateInputSchema`/
 * `poiUpdateInputSchema` in packages/validation, neither of which has a
 * `sourceType` field at all). `'GOOGLE_PLACES'` (see `PoiSourceType`) is
 * reserved for a future sync; no such sync exists in this codebase.
 *
 * Deliberately does NOT carry `startAt`/`endAt`/any event-scheduling field —
 * an Event is a distinct future concept that may *reference* a POI/location
 * later, never the other way around. See
 * docs/architecture/CATEGORY_ARCHITECTURE.md's "Event ≠ POI" section.
 */
export interface Poi {
  readonly poiId: PoiId;
  readonly customerId: CustomerId;
  readonly mapId: MapId;
  readonly categoryId: CategoryId;
  readonly name: string;
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly address?: string;
  readonly description?: string;
  readonly sourceType: PoiSourceType;
  readonly status: PoiStatus;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

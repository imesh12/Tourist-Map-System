import type { PoiProvider, PoiSourceType, PoiStatus } from './enums.js';
import type { CategoryId, CustomerId, MapId, PoiId } from './ids.js';
import type { LocalizedText } from './language.js';
import type { FirestoreTimestampLike } from './timestamp.js';

/** checkpoint 1B.17A — a POI's translated fields. See `CategoryTranslations`'s own doc comment (./category.js) for the general pattern; a POI has two translatable human-facing fields (`name`, `description`) rather than one. */
export interface PoiTranslations {
  readonly name?: LocalizedText;
  readonly description?: LocalizedText;
}

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
 * `sourceType` is `'CLIENT_CUSTOM'` for every manually-entered POI (the
 * server stamps it on every `POST /api/map/pois` create; a request body can
 * never assert it — mirrors how `Category.sourceType` works) or
 * `'GOOGLE_PLACES'` for a POI imported via checkpoint 1B.4's
 * `POST /api/map/pois/import` (see docs/architecture/CATEGORY_ARCHITECTURE.md
 * §11) — server-stamped there too, never client-suppliable.
 *
 * `provider`/`providerPlaceId` — added for checkpoint 1B.4, BOTH optional
 * and BOTH backward compatible: every POI document written by checkpoint
 * 1B.3 predates these fields and remains valid without any migration
 * (`poiSchema` in packages/validation treats them as optional for exactly
 * this reason, the same pattern `Category.platformCategoryId` already
 * established). Only ever present together, and only ever on a
 * `sourceType: 'GOOGLE_PLACES'` document — a `CLIENT_CUSTOM` POI never has
 * either field set. Like `sourceType`, both are stamped exclusively by
 * trusted server code (the import route resolves them itself; see that
 * route's own doc comment) — `poiCreateInputSchema`/`poiUpdateInputSchema`
 * (the schemas guarding the manual create/edit endpoints) have no
 * `provider`/`providerPlaceId` fields at all, so neither is ever
 * client-forgeable through those endpoints either.
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
  /** Only present when `sourceType === 'GOOGLE_PLACES'` — see this interface's doc comment. */
  readonly provider?: PoiProvider;
  /** Only present when `sourceType === 'GOOGLE_PLACES'` — the external Google Places `id`/resource name this POI was imported from, used for duplicate-import detection (checkpoint 1B.4 §"duplicate-import protection"). */
  readonly providerPlaceId?: string;
  /** checkpoint 1B.17A — see `PoiTranslations`'s own doc comment above. */
  readonly translations?: PoiTranslations;
  readonly status: PoiStatus;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

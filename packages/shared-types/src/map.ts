import type { CustomerId, MapId } from './ids.js';
import type { Language, MapAreaType, MapProviderName, MapStatus, MapStyle } from './enums.js';
import type { FirestoreTimestampLike } from './timestamp.js';

export interface MapProviderConfig {
  readonly provider: MapProviderName;
  readonly style: MapStyle;
}

export interface MapAreaBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export interface MapAreaConfig {
  readonly type: MapAreaType;
  readonly center?: { readonly lat: number; readonly lng: number };
  readonly defaultZoom?: number;
  readonly bounds?: MapAreaBounds;
}

/**
 * Basic client-controlled branding — checkpoint 1B.1, see
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md §2. A small, explicit set of
 * theme fields (matching SYSTEM_BLUEPRINT.md §11's "controlled theme
 * options, not arbitrary CSS"), not the full future theme system.
 * `logoUrl` is a plain URL string for 1B.1 — real Storage upload UI is
 * deferred to a later checkpoint; a client may paste an already-hosted URL.
 */
export interface MapBranding {
  readonly logoUrl?: string;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
}

/**
 * `maps/{mapId}` — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8/§11.
 *
 * Named `TouristMap` rather than `Map` deliberately, to avoid shadowing the
 * built-in JavaScript `Map` collection type in any file that imports it.
 *
 * `customerId` is the ownership field. It is written exclusively by trusted
 * backend code at creation time and is never derived from, or overwritable
 * by, client input — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10.
 * `enabledLanguages` must always include `defaultLanguage` — see
 * packages/validation's `mapSchema`, which enforces this invariant at
 * runtime.
 */
export interface TouristMap {
  readonly mapId: MapId;
  readonly customerId: CustomerId;
  readonly name: string;
  readonly status: MapStatus;
  readonly defaultLanguage: Language;
  readonly enabledLanguages: readonly Language[];
  readonly mapProvider: MapProviderConfig;
  readonly area: MapAreaConfig;
  /** Optional — absent until a Client Admin first saves branding (checkpoint 1B.1). */
  readonly branding?: MapBranding;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}

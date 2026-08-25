import type { MapAreaBounds, MapProviderName, MapStyle, MapTheme } from 'shared-types';

/**
 * The map-preview provider abstraction — checkpoint 1B.1-D.
 *
 * `MapPreview` (./map-preview.tsx) is the ONLY thing `map-settings-form.tsx`
 * ever imports from this directory. Every provider-specific adapter
 * (currently only `google-maps-preview.tsx`) implements this exact prop
 * contract and is never imported directly by form/domain code — this is
 * what "map-provider-specific code must remain behind an abstraction"
 * (the canonical architecture rule) means concretely: swapping
 * `mapProvider.provider` swaps which adapter renders, nothing else changes.
 *
 * Deliberately mirrors, but does not reuse verbatim, `MapAreaConfig` from
 * shared-types — this is a UI-layer contract (callbacks, a plain
 * `{lat,lng}` pair) rather than the Firestore document shape.
 */

export interface MapPreviewCenter {
  readonly lat: number;
  readonly lng: number;
}

export interface MapPreviewProps {
  readonly provider: MapProviderName;
  readonly style: MapStyle;
  /** Undefined center/zoom render an unpositioned default viewport, matching UNBOUNDED's optional initial viewport. */
  readonly center?: MapPreviewCenter;
  readonly zoom?: number;
  /** Only ever passed when the caller's area type is BOUNDED — see requirement 8. */
  readonly bounds?: MapAreaBounds;
  /**
   * Fired on user map interaction (drag/pan) — requirement 7. Local UI state
   * only; never triggers a save. Only ever fires once a real, interactive
   * map SDK is loaded (i.e. never in the "no API key" or "unsupported
   * provider" fallback states, since there is no map to interact with).
   */
  readonly onCenterChange?: (center: MapPreviewCenter) => void;
  /** Fired on user zoom interaction — same "local state only" contract as `onCenterChange`. */
  readonly onZoomChange?: (zoom: number) => void;
  /**
   * Checkpoint 1B.7 — provider-neutral map theme (§8: "theme changes MUST
   * update the existing map preview immediately, with no Save required").
   * Undefined renders whatever the provider adapter's own baseline styling
   * is (i.e. no `theme` option passed at all) — this is the same
   * "undefined means untouched default" convention `center`/`zoom`/`bounds`
   * already use above, and is what keeps this prop backward-compatible with
   * every existing caller that predates checkpoint 1B.7.
   */
  readonly theme?: MapTheme;
}

/**
 * The POI location-picker provider abstraction — checkpoint 1B.3 §14. A
 * sibling to `MapPreviewProps`, not a reuse of it: `MapPreview` visualizes
 * an AREA (center/zoom/bounds, pan-to-adjust), while `LocationPicker`
 * places/moves a single marker (click-to-set, always a `value`). Sharing one
 * prop shape between the two would blur "what does dragging the map mean
 * here" between the two genuinely different interactions.
 */
export interface LocationPickerProps {
  readonly provider: MapProviderName;
  /** The marker's current position — always defined once a create/edit drawer has a sensible initial location (§14: map center, never hardcoded). */
  readonly value: MapPreviewCenter;
  /** Where the map itself is first centered/zoomed — independent of `value` so an edit can center on the POI while a create can center on the map's configured area. */
  readonly initialCenter: MapPreviewCenter;
  readonly initialZoom?: number;
  /** Drawn as a visual guide only (§16) — never itself the enforcement boundary; the server always re-checks. */
  readonly bounds?: MapAreaBounds;
  /** Fired on a map click AND when the marker itself is dragged. */
  readonly onLocationChange: (location: MapPreviewCenter) => void;
}

import type { MapMarkerSize, MapThemeMarkerStyle } from 'shared-types';

/**
 * A tiny, provider-neutral marker VISUAL boundary — checkpoint 1B.9 §9.
 *
 * This checkpoint does NOT render real POI markers (that's 1B.10 — "full
 * POI markers/content experience" is explicitly out of scope here). What
 * this file establishes is the translation `MapTheme.markerStyle`
 * (`{style: 'PIN'|'DOT', size: 'SMALL'|'MEDIUM'|'LARGE'}`, already part of
 * every publication snapshot's `map.theme` — see `PublishedMapSummary`,
 * shared-types/src/publication.ts) already needs once a real marker
 * renderer exists: a concrete SHAPE and PIXEL SIZE, resolved in exactly one
 * place, so `tourist-map.tsx` (or whatever 1B.10's POI layer becomes) never
 * has to re-derive "what does MEDIUM actually mean in pixels" itself.
 *
 * Deliberately NOT shared via `packages/map-theme-adapter` (unlike
 * `mapThemeToGoogleMapsStyles`): this has exactly one consumer today
 * (tourist-web — admin-web's own map preview never renders tenant POI
 * markers, per `MapThemeMarkerStyle`'s own doc comment,
 * packages/shared-types/src/map.ts), so sharing it now would be premature
 * — the same "avoid creating a giant new shared package for one helper"
 * instruction this checkpoint gives. If a second real consumer appears
 * later, moving this alongside `google-theme-adapter.ts` is a small,
 * mechanical follow-up, not a redesign.
 *
 * Pure and deterministic, same contract as `mapThemeToGoogleMapsStyles`: the
 * same `MapThemeMarkerStyle` value always produces the exact same
 * `MarkerVisualConfig`, no randomness/environment dependency.
 */

export type MarkerShape = 'pin' | 'dot';

export interface MarkerVisualConfig {
  readonly shape: MarkerShape;
  readonly pixelSize: number;
}

/**
 * Concrete pixel sizes for each `MapMarkerSize` — a deliberately small,
 * fixed table (mirrors `MAP_THEME_PRESET_DEFAULTS`'s "one settled source of
 * truth" shape, shared-types/src/map-theme-presets.ts). Values chosen to be
 * comfortably tappable on mobile (44px is the commonly-cited minimum
 * touch-target guideline; MEDIUM/LARGE meet it, SMALL is intentionally
 * below it for a deliberately unobtrusive marker style) without being
 * settled as a final design decision — 1B.10's real renderer is free to
 * scale these further, this is only the foundation boundary.
 */
const MARKER_SIZE_PIXELS: Readonly<Record<MapMarkerSize, number>> = {
  SMALL: 20,
  MEDIUM: 28,
  LARGE: 40,
};

export function resolveMarkerVisualConfig(markerStyle: MapThemeMarkerStyle): MarkerVisualConfig {
  return {
    shape: markerStyle.style === 'DOT' ? 'dot' : 'pin',
    pixelSize: MARKER_SIZE_PIXELS[markerStyle.size],
  };
}

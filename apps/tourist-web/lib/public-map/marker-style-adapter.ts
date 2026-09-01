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

/**
 * Checkpoint 1B.10 §4/§5 — extends this same "one settled marker-visual
 * boundary" file (per the checkpoint's own explicit instruction: "Extend it
 * if needed rather than creating a second marker style conversion system")
 * with the concrete, renderable icon a real POI marker layer
 * (`lib/public-map/poi-marker-layer.ts`) attaches to a `google.maps.Marker`.
 *
 * Deliberately a plain, self-contained inline SVG `data:` URI — no network
 * request, no external icon dependency, nothing that could "leak
 * source/provider internals" (§4). §5's "future POI marker image → category
 * icon → generic marker" fallback hierarchy is represented here as the
 * `imageUrl` parameter: always `undefined` today (this checkpoint does not
 * build Media Library, and no fake image URL is ever fabricated — §5's own
 * explicit instruction), but already the FIRST tier a future marker-image
 * checkpoint slots into without any caller of this function needing to
 * change — when absent, the icon falls back to the category's emoji glyph
 * (`categoryIconMeta`, ./category-icon-meta.ts) drawn inside a colored
 * pin/dot shape, itself already a safe, always-available "generic marker"
 * for any icon this table doesn't recognize (`categoryIconMeta`'s own
 * `?? OTHER` fallback).
 *
 * Returns plain numbers/strings, never a `google.maps.Size`/`Point` —
 * kept provider-neutral and framework-free so this stays unit-testable
 * without the ambient `google` namespace, exactly like every other export
 * in this file; `poi-marker-layer.ts` is the one place that wraps this
 * result into real `google.maps.Icon` shapes.
 */
export interface MarkerIconSpec {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** Where the marker's "pointer" is, relative to the top-left of the icon — the coordinate a real map location should align with. */
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface BuildMarkerIconOptions {
  readonly shape: MarkerShape;
  readonly pixelSize: number;
  readonly color: string;
  readonly glyph: string;
  /** A visually distinguishable selected state (§4: "recognizable selected state") — a thicker, high-contrast ring, not a size change (size is the caller's own concern, e.g. a slightly larger `pixelSize` passed in when selected). */
  readonly selected: boolean;
  /** Reserved for a future per-POI marker image — always `undefined` today. See this function's own doc comment. */
  readonly imageUrl?: string;
}

const SELECTED_RING_COLOR = '#111827';
const RING_WIDTH = 2;

export function buildMarkerIcon(options: BuildMarkerIconOptions): MarkerIconSpec {
  const { shape, pixelSize, color, glyph, selected } = options;
  const strokeColor = selected ? SELECTED_RING_COLOR : '#ffffff';
  const strokeWidth = selected ? RING_WIDTH + 1 : RING_WIDTH;

  if (shape === 'dot') {
    const size = pixelSize;
    const radius = size / 2 - strokeWidth;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/></svg>`;
    return { url: svgToDataUrl(svg), width: size, height: size, anchorX: size / 2, anchorY: size / 2 };
  }

  // A "pin" — a round head (holding the glyph) plus a downward-pointing
  // tail, so the anchor (the geographic point) is the tip, not the visual
  // center — the same convention every mainstream map pin icon uses.
  const width = pixelSize;
  const headRadius = width / 2 - strokeWidth;
  const height = Math.round(width * 1.35);
  const tailHalfWidth = width * 0.22;
  const tailY = width * 0.78;
  const glyphFontSize = Math.round(width * 0.5);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<path d="M ${width / 2 - tailHalfWidth} ${tailY} L ${width / 2} ${height} L ${width / 2 + tailHalfWidth} ${tailY} Z" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`,
    `<circle cx="${width / 2}" cy="${width / 2}" r="${headRadius}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`,
    `<text x="${width / 2}" y="${width / 2}" font-size="${glyphFontSize}" text-anchor="middle" dominant-baseline="central">${escapeXml(glyph)}</text>`,
    `</svg>`,
  ].join('');
  return { url: svgToDataUrl(svg), width, height, anchorX: width / 2, anchorY: height };
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

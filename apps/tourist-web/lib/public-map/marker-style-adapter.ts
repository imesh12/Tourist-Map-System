import type { MapMarkerSize, MapThemeMarkerStyle } from 'shared-types';

/**
 * The public tourist map's MARKER VISUAL boundary — checkpoint 1B.9 §9,
 * extended by 1B.10 (§4/§5) and 1B.16 (map-level marker patterns).
 *
 * `resolveMarkerVisualConfig()` translates the published, provider-neutral
 * `MapTheme.markerStyle` (`{ style, size }`) into a concrete, renderable
 * `{ pattern, pixelSize }`. `buildMarkerIcon()` turns that (plus a category
 * colour + glyph + selected flag) into a self-contained inline-SVG `data:`
 * URI a `google.maps.Marker` can use directly. Both are pure/deterministic
 * and free of the `google` global, so they unit-test without the SDK — the
 * same contract `mapThemeToGoogleMapsStyles` keeps.
 *
 * MAP-LEVEL MARKER PATTERNS (checkpoint 1B.16 product decision)
 * -----------------------------------------------------------------
 * A client picks ONE marker pattern for a map and the published Tourist Map
 * applies it to every POI. The renderable patterns are `MarkerPattern`
 * below. Today the shared `MapTheme.markerStyle.style` enum only carries the
 * two legacy values `'PIN'` / `'DOT'`, so `resolveMarkerVisualConfig()` can
 * only ever produce `'rounded-square'` or `'circle'`. Widening
 * `MAP_MARKER_STYLES` (a shared-types + Admin change, deliberately NOT done
 * in this UI pass — see the checkpoint report) is the ONLY change needed for
 * the rest of the set: this file already renders `'classic-pin'` and
 * `'icon-circle'`, and `resolveMarkerVisualConfig()` is the single place
 * that would map the new enum values across. `'photo-pin'` / `'photo-card'`
 * are reserved for the Media Library / Google Places photo checkpoints —
 * until `PublishedPoi` carries an image they are not in the union, and a map
 * that selects them falls back to `'rounded-square'` with the category icon
 * (`buildMarkerIcon`'s `imageUrl` param is the seam; always `undefined`
 * today — no fake image URL is ever fabricated).
 */

/** A renderable marker pattern — the map-level choice, applied to every POI. */
export type MarkerPattern = 'rounded-square' | 'circle' | 'classic-pin' | 'icon-circle';

export interface MarkerVisualConfig {
  readonly pattern: MarkerPattern;
  readonly pixelSize: number;
}

/**
 * Concrete pixel sizes for each `MapMarkerSize`. The badge patterns
 * (`rounded-square`/`classic-pin`) read as a compact destination marker at
 * these sizes; kept below ~52px so dense (Tokyo-style) views stay usable.
 * The selected marker scales up from here (`poi-marker-layer.ts`'s
 * `SELECTED_SCALE`). For the badge patterns this is the FACE width; overall
 * height (pointer + shadow padding) is derived in `buildMarkerIcon`.
 */
const MARKER_SIZE_PIXELS: Readonly<Record<MapMarkerSize, number>> = {
  SMALL: 30,
  MEDIUM: 40,
  LARGE: 50,
};

/**
 * The ONE place `MapTheme.markerStyle` becomes a renderable pattern. When
 * `MAP_MARKER_STYLES` is widened (future), this gains the extra cases:
 *   ROUNDED_SQUARE → 'rounded-square'   CLASSIC_PIN → 'classic-pin'
 *   CIRCLE         → 'circle'           ICON_CIRCLE → 'icon-circle'
 *   PHOTO_PIN/PHOTO_CARD → 'rounded-square' (icon fallback until POI media)
 */
export function resolveMarkerVisualConfig(markerStyle: MapThemeMarkerStyle): MarkerVisualConfig {
  return {
    pattern: markerStyle.style === 'DOT' ? 'circle' : 'rounded-square',
    pixelSize: MARKER_SIZE_PIXELS[markerStyle.size],
  };
}

export interface MarkerIconSpec {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** Where the marker's "pointer" is, relative to the top-left of the icon — the coordinate a real map location should align with. */
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface BuildMarkerIconOptions {
  readonly pattern: MarkerPattern;
  readonly pixelSize: number;
  readonly color: string;
  /**
   * Legacy text/emoji glyph, drawn inside a `<text>` element. Kept for
   * backward compatibility; prefer `glyphPath`. When `glyphPath` is also
   * supplied it wins and this is ignored.
   */
  readonly glyph: string;
  /**
   * A vector glyph authored in a `0 0 24 24` box
   * (`CategoryIconMeta.markerGlyphPath`) — platform-independent. Our own
   * trusted constant, never user input.
   */
  readonly glyphPath?: string;
  /** A visually distinguishable, stronger selected state. */
  readonly selected: boolean;
  /** Reserved for a future per-POI image (Media Library / Google Places photos). Always `undefined` today — no fake URL is ever fabricated. */
  readonly imageUrl?: string;
}

const SELECTED_RING_COLOR = '#111827';
const GLYPH_ON_COLOR = '#ffffff';

/**
 * The centered glyph markup for a marker — a vector `<path>` (preferred) or
 * the legacy `<text>` emoji. `cx`/`cy` is the centre; `box` the diameter it
 * may occupy; `glyphColor` the fill for a vector path (the emoji ignores it).
 */
function glyphMarkup(options: BuildMarkerIconOptions, cx: number, cy: number, box: number, glyphColor: string): string {
  if (options.glyphPath) {
    const scale = box / 24;
    const translateX = cx - (24 * scale) / 2;
    const translateY = cy - (24 * scale) / 2;
    return `<g transform="translate(${round(translateX)} ${round(translateY)}) scale(${round(scale)})" fill="${glyphColor}"><path d="${options.glyphPath}"/></g>`;
  }
  const fontSize = Math.round(box * 0.9);
  return `<text x="${cx}" y="${cy}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${escapeXml(options.glyph)}</text>`;
}

/** A soft drop-shadow filter for the badge/pin patterns — stronger when selected. */
function shadowDefs(selected: boolean): string {
  const dev = selected ? 2 : 1.4;
  const opacity = selected ? 0.4 : 0.3;
  return `<defs><filter id="mk" x="-45%" y="-45%" width="190%" height="190%"><feDropShadow dx="0" dy="1" stdDeviation="${dev}" flood-color="#0b1220" flood-opacity="${opacity}"/></filter></defs>`;
}

export function buildMarkerIcon(options: BuildMarkerIconOptions): MarkerIconSpec {
  switch (options.pattern) {
    case 'circle':
      return circleIcon(options, 'solid');
    case 'icon-circle':
      return circleIcon(options, 'outline');
    case 'classic-pin':
      return classicPinIcon(options);
    case 'rounded-square':
    default:
      return roundedSquareIcon(options);
  }
}

/**
 * `circle` — a minimal filled disc (the "DOT" theme's unobtrusive style,
 * also the "your location" indicator). `icon-circle` — the same footprint
 * but a light face with a category-colour ring + glyph, so it reads as a
 * curated marker while staying compact. No pointer: centre-anchored.
 */
function circleIcon(options: BuildMarkerIconOptions, variant: 'solid' | 'outline'): MarkerIconSpec {
  const { pixelSize: size, color, selected } = options;
  const stroke = selected ? SELECTED_RING_COLOR : variant === 'outline' ? color : '#ffffff';
  const strokeWidth = variant === 'outline' && !selected ? 3 : selected ? 3 : 2;
  const face = selected ? color : variant === 'outline' ? '#ffffff' : color;
  const glyphColor = selected ? GLYPH_ON_COLOR : variant === 'outline' ? color : GLYPH_ON_COLOR;
  const radius = size / 2 - strokeWidth;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${face}" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
    glyphMarkup(options, size / 2, size / 2, radius * 1.15, glyphColor) +
    `</svg>`;
  return { url: svgToDataUrl(svg), width: size, height: size, anchorX: size / 2, anchorY: size / 2 };
}

/**
 * `rounded-square` — the tourism BADGE: a light card carrying the category
 * glyph, a category-colour border, a short downward pointer whose tip is the
 * geographic anchor, and a soft drop shadow so it lifts off the basemap and
 * clearly outranks Google's own flat POI icons. Selected: category-colour
 * face, white glyph, dark ring, deeper shadow (and the caller scales the
 * size up, so it is both stronger and larger).
 */
function roundedSquareIcon(options: BuildMarkerIconOptions): MarkerIconSpec {
  const { pixelSize: bw, color, selected } = options;
  const pad = Math.max(2, Math.round(bw * 0.12));
  const pointerH = Math.max(4, Math.round(bw * 0.26));
  const width = bw + pad * 2;
  const height = pad + bw + pointerH;
  const radius = Math.round(bw * 0.28);
  const cx = width / 2;
  const face = selected ? color : '#ffffff';
  const border = selected ? SELECTED_RING_COLOR : color;
  const borderWidth = selected ? 2.5 : 2;
  const glyphColor = selected ? GLYPH_ON_COLOR : color;
  const pointerHalf = Math.max(3, Math.round(bw * 0.15));
  const faceBottom = pad + bw;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    shadowDefs(selected),
    `<g filter="url(#mk)">`,
    // white halo behind the pointer + face, so both separate from imagery
    `<path d="M ${cx - pointerHalf - 2} ${faceBottom - 2} L ${cx} ${height} L ${cx + pointerHalf + 2} ${faceBottom - 2} Z" fill="#ffffff"/>`,
    `<rect x="${pad - 1}" y="${pad - 1}" width="${bw + 2}" height="${bw + 2}" rx="${radius + 1}" fill="#ffffff"/>`,
    `<path d="M ${cx - pointerHalf} ${faceBottom - 1} L ${cx} ${height - 1} L ${cx + pointerHalf} ${faceBottom - 1} Z" fill="${face}" stroke="${border}" stroke-width="${borderWidth}" stroke-linejoin="round"/>`,
    `<rect x="${pad}" y="${pad}" width="${bw}" height="${bw}" rx="${radius}" fill="${face}" stroke="${border}" stroke-width="${borderWidth}"/>`,
    glyphMarkup(options, cx, pad + bw / 2, bw * 0.6, glyphColor),
    `</g>`,
    `</svg>`,
  ].join('');
  return { url: svgToDataUrl(svg), width, height, anchorX: cx, anchorY: height };
}

/**
 * `classic-pin` — a traditional teardrop for clients who want it: a
 * category-colour head + tail, white halo, white glyph, soft shadow.
 * Anchor is the tail tip.
 */
function classicPinIcon(options: BuildMarkerIconOptions): MarkerIconSpec {
  const { pixelSize: w, color, selected } = options;
  const pad = Math.max(2, Math.round(w * 0.12));
  const width = w + pad * 2;
  const headR = w / 2;
  const cx = width / 2;
  const cy = pad + headR;
  const height = Math.round(pad + w * 1.4) + 1;
  const stroke = selected ? SELECTED_RING_COLOR : '#ffffff';
  const strokeWidth = selected ? 3 : 2;
  const tailHalf = headR * 0.42;
  const tailTopY = cy + headR * 0.55;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    shadowDefs(selected),
    `<g filter="url(#mk)">`,
    `<path d="M ${cx - tailHalf} ${tailTopY} L ${cx} ${height - 1} L ${cx + tailHalf} ${tailTopY} Z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${headR - strokeWidth}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    glyphMarkup(options, cx, cy, (headR - strokeWidth) * 1.15, GLYPH_ON_COLOR),
    `</g>`,
    `</svg>`,
  ].join('');
  return { url: svgToDataUrl(svg), width, height, anchorX: cx, anchorY: height };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

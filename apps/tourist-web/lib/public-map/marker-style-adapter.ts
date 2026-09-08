import type { MapMarkerSize, MapThemeMarkerStyle, PhotoMarkerStyle } from 'shared-types';

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
 * that would map the new enum values across.
 *
 * `'photo-pin'` (Photo Experience Prototype checkpoint) is a PER-POI
 * render-time override, not a map-level `MarkerPattern` a client picks —
 * `poi-marker-layer.ts`'s `sync()` chooses it for any individual POI whose
 * published data carries `photo.available === true`, regardless of the
 * map's own configured pattern, and every OTHER POI keeps rendering the
 * map-level pattern exactly as before. It is deliberately NOT added to the
 * persisted `MAP_MARKER_STYLES` enum (shared-types/src/enums.ts) — a client
 * cannot "select" it in Map Settings, it is an automatic per-POI visual
 * upgrade. `'photo-card'` remains reserved/unimplemented for a future
 * checkpoint. `buildMarkerIcon`'s `imageUrl` seam (previously always
 * `undefined`, "no fake URL is ever fabricated") is now populated by
 * `tourist-map.tsx` with a `data:` URI it has already fetched from the live
 * photo endpoint and base64-encoded — NOT a plain `https://` URL: an SVG
 * that is itself rendered as an image (a Google Maps marker icon) runs in
 * the browser's "secure static" mode, where an `<image href="https://…">`
 * external reference does not load at all. Still never fabricated: a
 * `data:` URI is only ever supplied when the published snapshot itself says
 * a photo is available for that POI and the fetch succeeded.
 *
 * ===========================================================================
 * `'photo-pin'` STATUS: PROTOTYPE ONLY — NOT PRODUCTION-READY FOR
 * GOOGLE-SOURCED PHOTOS.
 * ===========================================================================
 * When the embedded `data:` URI is a Google Places photo, the marker
 * displays that photo on the map with NO author attribution at the point of
 * display. Google Places photos carry `authorAttributions` that are meant
 * to be shown wherever the photo is displayed, and a map pin has no room
 * for that text. Opening the POI detail panel afterwards shows the same
 * photo WITH attribution (`poi-detail-card.tsx` + `.../photo-meta`), but
 * that is a separate later view and does NOT make the marker's own display
 * compliant.
 *
 * `'photo-pin'` is retained deliberately for MANAGER VISUAL REVIEW of the
 * prototype only. It stays OUT of the persisted `MAP_MARKER_STYLES` enum
 * (shared-types/src/enums.ts) — no client can select it in Map Settings.
 *
 * The production decision (see the checkpoint report) is one of:
 *   A. Google photo shown ONLY in the detail panel; the map uses the
 *      ordinary category marker.
 *   B. Retain a Google `'photo-pin'` ONLY after designing a compliant
 *      persistent attribution surface for it.
 *
 * SELECTABLE PHOTO_PIN TEMPLATES (manager visual-review sub-pass)
 * -----------------------------------------------------------------
 * Three additional `'photo-pin'` outer-silhouette templates were added for
 * side-by-side manager review, each modelled on a draw.io reference export
 * under `docs/UI-sample/map-marker-sample/` (`mapmarker1.svg` /
 * `mapmarker2.svg` / `mapmarker3.svg` — REFERENCE ONLY, never imported or
 * shipped as an asset; every one of their central placeholder circles is
 * replaced here by the real, circle-clipped POI photo, never the sample's
 * `#ffe6cc` placeholder fill):
 *
 *   `'photo-pin-1'` — mapmarker1: a flat-topped rounded-square badge with a
 *     short tail, and a DOUBLE ring around the photo (an extra white halo
 *     plus the category/selected accent ring), matching the reference's two
 *     concentric circles.
 *   `'photo-pin-2'` — mapmarker2: a rounder "shield" badge whose tail curves
 *     smoothly into its point (rather than the sharp straight-edged tail
 *     used elsewhere in this file), with a single accent ring.
 *   `'photo-pin-3'` — mapmarker3: a diamond silhouette whose own bottom
 *     vertex is the geographic anchor (no separate tail, matching the
 *     reference), with a single accent ring.
 *
 * `'legacy'` is the ORIGINAL `'photo-pin'` rendering (`photoPinIcon` below,
 * predating the three references) and remains the DEFAULT — see
 * `DEFAULT_PHOTO_PIN_TEMPLATE`. Every existing caller of `buildMarkerIcon`
 * (`poi-marker-layer.ts`, `tourist-map.tsx`) passes `pattern: 'photo-pin'`
 * without a `photoPinTemplate`, so this change is visually inert until a
 * caller deliberately opts in — no currently-published marker changes
 * appearance. `photoPinTemplate` is the explicit internal selection seam:
 * the ADMIN PHOTO MARKER STYLE checkpoint threads a persisted, map-level
 * choice through to this option via `resolvePhotoPinTemplate()` /
 * `resolvePublicPhotoPinTemplate()` below — the ONE place the persisted,
 * production `PhotoMarkerStyle` (shared-types) is ever translated into this
 * internal template value.
 */

/** A renderable marker pattern — the map-level choice, applied to every POI, except `'photo-pin'` which is always a PER-POI override (see this file's header comment). */
export type MarkerPattern = 'rounded-square' | 'circle' | 'classic-pin' | 'icon-circle' | 'photo-pin';

/**
 * Which outer-silhouette rendering `pattern: 'photo-pin'` uses — see the
 * "SELECTABLE PHOTO_PIN TEMPLATES" section of this file's header comment.
 * Internal only: never added to the persisted `MAP_MARKER_STYLES` enum, and
 * not yet surfaced in any Admin UI. Defaults to `'legacy'` when omitted —
 * see `DEFAULT_PHOTO_PIN_TEMPLATE`.
 */
export type PhotoPinTemplate = 'legacy' | 'photo-pin-1' | 'photo-pin-2' | 'photo-pin-3';

/**
 * The current default `PhotoPinTemplate` for every caller that does not
 * explicitly choose one — i.e. every caller today. Keeping this as a named
 * constant (rather than inlining `'legacy'`) is the explicit seam a future
 * map-level Admin selection would override by passing `photoPinTemplate`
 * through to `buildMarkerIcon` instead of relying on this default.
 */
export const DEFAULT_PHOTO_PIN_TEMPLATE: PhotoPinTemplate = 'legacy';

/**
 * Maps a persisted, production `PhotoMarkerStyle` (shared-types) to the
 * internal `PhotoPinTemplate` this file's renderer actually understands.
 * This is the ONE place that translation happens — callers must never
 * compare against `'ROUNDED_PIN'`/`'SHIELD_PIN'`/`'DIAMOND_PIN'` (or the
 * internal `'photo-pin-1'`/`2`/`3` names) themselves. An `undefined` or any
 * value this function doesn't recognize falls back to `'photo-pin-1'`
 * (`ROUNDED_PIN`) — the ADMIN PHOTO MARKER STYLE checkpoint's own default
 * (see `DEFAULT_PHOTO_MARKER_STYLE`, shared-types), matching every
 * pre-checkpoint publication snapshot that has no `photoMarkerStyle` field
 * at all. Deliberately independent of `DEFAULT_PHOTO_PIN_TEMPLATE` above
 * (`'legacy'`), which remains the fallback only for a caller that never
 * passes `photoPinTemplate` to `buildMarkerIcon`/`renderPhotoPin` at all —
 * the real public Tourist Map route always resolves an explicit template
 * via this function instead.
 */
export function resolvePhotoPinTemplate(style: PhotoMarkerStyle | undefined): PhotoPinTemplate {
  switch (style) {
    case 'ROUNDED_PIN':
      return 'photo-pin-1';
    case 'SHIELD_PIN':
      return 'photo-pin-2';
    case 'DIAMOND_PIN':
      return 'photo-pin-3';
    default:
      return 'photo-pin-1';
  }
}

/** Internal lookup table backing the `?photoMarker=1|2|3` dev-only query override — see `resolvePublicPhotoPinTemplate` below. */
const DEV_PHOTO_MARKER_QUERY_TEMPLATES: Readonly<Record<string, PhotoPinTemplate>> = {
  '1': 'photo-pin-1',
  '2': 'photo-pin-2',
  '3': 'photo-pin-3',
};

/**
 * Resolves which `PhotoPinTemplate` the public Tourist Map should render,
 * given the map's currently published `photoMarkerStyle` and the raw
 * `?photoMarker=` query string value (if any). This is the ONE place the
 * dev-override-vs-published-style precedence rule is decided — callers
 * (e.g. `app/maps/[mapId]/page.tsx`) must never re-implement this logic
 * themselves.
 *
 * Precedence:
 * 1. In non-production (`isProduction: false`) with a valid
 *    `devQueryOverride` (`'1'`, `'2'`, or `'3'`): the query override wins,
 *    for continued manual template testing — this is the ONLY case where
 *    it wins.
 * 2. Otherwise — an absent/invalid query value, OR `isProduction: true`
 *    regardless of the query value — the published `publishedStyle` is
 *    used, via `resolvePhotoPinTemplate`. In production the query override
 *    is completely ignored, even when it is a syntactically valid value.
 */
export function resolvePublicPhotoPinTemplate(options: {
  readonly publishedStyle: PhotoMarkerStyle | undefined;
  readonly devQueryOverride: string | undefined;
  readonly isProduction: boolean;
}): PhotoPinTemplate {
  if (!options.isProduction) {
    const devTemplate = DEV_PHOTO_MARKER_QUERY_TEMPLATES[options.devQueryOverride ?? ''];
    if (devTemplate) {
      return devTemplate;
    }
  }
  return resolvePhotoPinTemplate(options.publishedStyle);
}

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
 * `'photo-pin'` is never returned here — it is a per-POI override applied
 * downstream by `poi-marker-layer.ts`, never a map-level theme choice.
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
  /**
   * A ready-to-embed image source for `pattern: 'photo-pin'` — Photo
   * Experience Prototype checkpoint. In practice a `data:` URI the caller
   * has already fetched and encoded (an external `https://` reference does
   * NOT load inside an SVG that is rendered as a marker icon — see this
   * file's header comment). Only ever supplied when the published POI's own
   * `photo.available === true` and the fetch succeeded (never fabricated).
   * Ignored by every other pattern. When `pattern === 'photo-pin'` but this
   * is absent, `buildMarkerIcon` falls back to `roundedSquareIcon` rather
   * than rendering a broken image (§ "never show a broken-image marker, do
   * not fake a photo").
   */
  readonly imageUrl?: string;
  /**
   * Which outer-silhouette rendering `pattern: 'photo-pin'` uses — see
   * `PhotoPinTemplate`. Ignored by every other pattern. Defaults to
   * `DEFAULT_PHOTO_PIN_TEMPLATE` (`'legacy'`) when omitted, so every
   * existing caller is unaffected by this option's mere existence.
   */
  readonly photoPinTemplate?: PhotoPinTemplate;
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
    case 'photo-pin':
      return options.imageUrl ? renderPhotoPin(options, options.imageUrl) : roundedSquareIcon(options);
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

/**
 * Dispatches `pattern: 'photo-pin'` (once an `imageUrl` is known to exist)
 * to the selected `PhotoPinTemplate` renderer. `options.photoPinTemplate`
 * defaults to `DEFAULT_PHOTO_PIN_TEMPLATE` — see the "SELECTABLE PHOTO_PIN
 * TEMPLATES" section of this file's header comment for what each one is.
 */
function renderPhotoPin(options: BuildMarkerIconOptions, imageUrl: string): MarkerIconSpec {
  const template = options.photoPinTemplate ?? DEFAULT_PHOTO_PIN_TEMPLATE;
  switch (template) {
    case 'photo-pin-1':
      return photoPinTemplate1Icon(options, imageUrl);
    case 'photo-pin-2':
      return photoPinTemplate2Icon(options, imageUrl);
    case 'photo-pin-3':
      return photoPinTemplate3Icon(options, imageUrl);
    case 'legacy':
    default:
      return photoPinIcon(options, imageUrl);
  }
}

/**
 * `photo-pin` (`'legacy'` template — the DEFAULT, see
 * `DEFAULT_PHOTO_PIN_TEMPLATE`) — Photo Experience Prototype checkpoint.
 * Redesigned toward `docs/UI-sample/tourist-map-ui-target.png` (reference
 * only — never an app asset): a near-circular photo body that stays
 * prominent, wrapped in a thick clean WHITE outer ring, then a thin
 * CATEGORY-COLOUR accent outline, with a short integrated pointed tail
 * (category colour) whose tip is the geographic anchor, and a soft drop
 * shadow. Selected renders a slightly stronger, dark accent ring (the
 * caller also scales `pixelSize` up, so it is both larger and stronger).
 * SMALL/MEDIUM/LARGE scaling flows entirely from `pixelSize`.
 *
 * Layer order (bottom → top), inside the shadow group:
 *   tail → category-colour accent disc → white ring → opaque category
 *   fallback face → the photo (`<image>`, circle-clipped).
 * The opaque fallback face means a `data:` payload that fails to decode
 * shows a plain colour disc, never a broken-image glyph.
 *
 * `imageUrl` MUST be a `data:` URI, not an `https://` URL: this SVG is
 * handed to Google Maps as a marker-icon image, and a browser rendering an
 * SVG *as an image* runs it in "secure static" mode, in which external
 * `<image href>` references are not fetched. `tourist-map.tsx` →
 * `poi-photo-source.ts` `bytesToDataUri` has already fetched + base64-encoded
 * the photo, so this stays synchronous. When `imageUrl` is absent,
 * `buildMarkerIcon` falls back to `roundedSquareIcon` (no broken image).
 *
 * FUTURE BADGE SEAM: a small circular count badge (see the reference) would
 * sit at `(badgeCx, badgeCy)` below — DELIBERATELY NOT RENDERED in this
 * pass (would cost one `/photo-meta` request per marker). The coordinates
 * are computed so a later change is markup-only.
 *
 * PROTOTYPE-ONLY / attribution: see this file's header — a Google photo is
 * shown on the marker with no attribution at the point of display; that is
 * why `'photo-pin'` stays out of persisted `MAP_MARKER_STYLES` and is
 * retained for manager review only.
 */
function photoPinIcon(options: BuildMarkerIconOptions, imageUrl: string): MarkerIconSpec {
  const { pixelSize: w, color, selected } = options;
  const pad = Math.max(2, Math.round(w * 0.14));
  const width = Math.round(w + pad * 2);
  const headR = w / 2;
  const cx = width / 2; // exact centre — also the reported anchorX
  const cy = pad + headR;
  const height = Math.round(cy + headR + w * 0.42) + 1;

  const accentW = selected ? Math.max(2.5, w * 0.09) : Math.max(1.5, w * 0.06);
  const ringW = selected ? Math.max(3.5, w * 0.18) : Math.max(2.5, w * 0.14);
  const accentColor = selected ? SELECTED_RING_COLOR : color;
  const photoR = Math.max(1, headR - accentW - ringW);

  const tailHalf = headR * 0.34;
  const tailTopY = cy + headR * 0.5;

  // Future badge anchor (top-right of the ring) — DELIBERATELY NOT RENDERED
  // in this pass. Kept so a later count badge is a markup-only change.
  void [round(cx + headR * 0.62), round(cy - headR * 0.62)];

  const clipId = 'photo-clip';
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    shadowDefs(selected),
    `<defs><clipPath id="${clipId}"><circle cx="${round(cx)}" cy="${round(cy)}" r="${round(photoR)}"/></clipPath></defs>`,
    `<g filter="url(#mk)">`,
    // integrated pointed tail (category colour, thin white edge so it reads on any basemap)
    `<path d="M ${round(cx - tailHalf)} ${round(tailTopY)} L ${round(cx)} ${height - 1} L ${round(cx + tailHalf)} ${round(tailTopY)} Z" fill="${accentColor}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>`,
    // thin category-colour accent disc (reads as an outline around the white ring)
    `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(headR)}" fill="${accentColor}"/>`,
    // thick clean white ring
    `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(headR - accentW)}" fill="#ffffff"/>`,
    // opaque category-colour fallback face BEHIND the photo (never a broken-image icon)
    `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(photoR)}" fill="${color}"/>`,
    `<image href="${escapeXmlAttribute(imageUrl)}" x="${round(cx - photoR)}" y="${round(cy - photoR)}" width="${round(photoR * 2)}" height="${round(photoR * 2)}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`,
    `</g>`,
    `</svg>`,
  ].join('');
  return { url: svgToDataUrl(svg), width, height, anchorX: cx, anchorY: height };
}

/**
 * Turns a category hex colour into a lighter tint by mixing it toward white
 * — used for the `photo-pin-N` templates' OUTER BODY BORDER (deliberately
 * light/soft, never the strong saturated category colour itself — see the
 * "SELECTABLE PHOTO_PIN TEMPLATES" section above, updated for the mapmarker2
 * proportion pass). `amount` is how far toward white to mix (0 = unchanged,
 * 1 = pure white). Never hardcodes a colour of its own — always derived
 * from whatever category colour the caller passes in. Falls back to the
 * original colour unchanged if it isn't a plain `#rrggbb` hex (every
 * category colour in this app is, but this keeps the renderer from ever
 * throwing on unexpected input).
 */
function lightenColor(hex: string, amount: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return hex;
  }
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return `#${[mix(rgb[0]), mix(rgb[1]), mix(rgb[2])].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function parseHexColor(hex: string): readonly [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  const captured = match?.[1];
  if (!captured) {
    return null;
  }
  const value = parseInt(captured, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

interface PhotoRingMetrics {
  readonly photoR: number;
  readonly accentWidth: number;
  readonly whiteGapWidth: number;
  readonly outerBorderWidth: number;
}

/**
 * The mapmarker2.svg reference (canvas 74×82, photo circle `cx=35.5 cy=38
 * rx=33 ry=33`) fixes the target proportion: the photo circle's diameter
 * (66) is ≈89% of the marker's own width (74) — "the photo should consume
 * most of the marker face," not a decorative accent. This turns a
 * template's own total icon `width` into that same ratio: `photoR` is
 * `width / 2` minus the three thin outer layers (outer body border, white
 * separation, inner accent line), so the photo is exactly as large as the
 * outer body allows. Not a literal fixed pixel count at every size — the
 * reference is a RATIO, applied proportionally, and the 1px/2px floors on
 * the three outer layers mean SMALL necessarily lands a little short of the
 * full ~89% (there has to be SOME visible border), approaching it more
 * closely as `width` grows — and never affected by the selected state
 * (callers pass the same `width` either way; only the caller's own overall
 * `pixelSize` scale-up changes, exactly like every other pattern here).
 */
function derivePhotoRingMetrics(width: number): PhotoRingMetrics {
  const accentWidth = Math.max(1, Math.round(width * 0.012));
  const whiteGapWidth = Math.max(1, Math.round(width * 0.016));
  const outerBorderWidth = Math.max(2, Math.round(width * 0.028));
  const photoR = Math.max(1, width / 2 - accentWidth - whiteGapWidth - outerBorderWidth);
  return { photoR, accentWidth, whiteGapWidth, outerBorderWidth };
}

/**
 * Shared "white separation + thin accent line + opaque fallback + real
 * photo" composition used by the three `photo-pin-N` templates below — only
 * the OUTER SILHOUETTE and its own light body border differ between them
 * (drawn by each template's own body shape, BEFORE this is layered on top);
 * this inner composition is identical, so every template preserves the same
 * white separation / accent-colour ring / no-broken-image guarantees and
 * the same large photo-to-marker ratio (`derivePhotoRingMetrics`).
 */
function photoCircleMarkup(
  clipId: string,
  cx: number,
  cy: number,
  photoR: number,
  accentWidth: number,
  whiteGapWidth: number,
  accentColor: string,
  faceColor: string,
  imageUrl: string,
): string {
  const parts: string[] = [`<defs><clipPath id="${clipId}"><circle cx="${round(cx)}" cy="${round(cy)}" r="${round(photoR)}"/></clipPath></defs>`];
  // narrow white separation between the outer body border and the inner accent line
  parts.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(photoR + accentWidth + whiteGapWidth)}" fill="#ffffff"/>`);
  // ~1px inner accent line — the stronger category/selected colour
  parts.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(photoR + accentWidth)}" fill="${accentColor}"/>`);
  // opaque fallback face BEHIND the photo (never a broken-image icon)
  parts.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(photoR)}" fill="${faceColor}"/>`);
  parts.push(
    `<image href="${escapeXmlAttribute(imageUrl)}" x="${round(cx - photoR)}" y="${round(cy - photoR)}" width="${round(photoR * 2)}" height="${round(photoR * 2)}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`,
  );
  return parts.join('');
}

/**
 * `photo-pin-1` — modelled on `docs/UI-sample/map-marker-sample/mapmarker1.svg`:
 * a flat-topped rounded-square badge with a short tail. The badge's own
 * border is the OUTER BODY layer — thick, and a LIGHT tint of the category
 * colour (`lightenColor`), never the strong saturated colour itself — and
 * `photoCircleMarkup` layers the white separation + thin accent line + very
 * large photo on top, per `derivePhotoRingMetrics`. Anchor is the tail tip.
 */
function photoPinTemplate1Icon(options: BuildMarkerIconOptions, imageUrl: string): MarkerIconSpec {
  const { pixelSize: w, color, selected } = options;
  const pad = Math.max(2, Math.round(w * 0.08));
  const bodySize = w;
  const cornerR = Math.round(bodySize * 0.22);
  const width = Math.round(bodySize + pad * 2);
  const bodyTop = pad;
  const bodyBottom = bodyTop + bodySize;
  const bodyCenterY = bodyTop + bodySize / 2;
  const cx = width / 2;
  const tailHalf = bodySize * 0.2;
  const tailH = Math.round(bodySize * 0.46);
  const height = Math.round(bodyBottom + tailH) + 1;
  const accentColor = selected ? SELECTED_RING_COLOR : color;
  const lightBorderColor = lightenColor(color, selected ? 0.42 : 0.6);
  const { photoR, accentWidth, whiteGapWidth, outerBorderWidth } = derivePhotoRingMetrics(width);
  const clipId = 'photo-clip-1';
  const tailStartY = bodyBottom - tailH * 0.15;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    shadowDefs(selected),
    `<g filter="url(#mk)">`,
    `<path d="M ${round(cx - tailHalf)} ${round(tailStartY)} L ${round(cx)} ${height - 1} L ${round(cx + tailHalf)} ${round(tailStartY)} Z" fill="${accentColor}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>`,
    `<rect x="${round(pad)}" y="${round(bodyTop)}" width="${round(bodySize)}" height="${round(bodySize)}" rx="${cornerR}" fill="#ffffff" stroke="${lightBorderColor}" stroke-width="${outerBorderWidth}"/>`,
    photoCircleMarkup(clipId, cx, bodyCenterY, photoR, accentWidth, whiteGapWidth, accentColor, color, imageUrl),
    `</g>`,
    `</svg>`,
  ].join('');
  return { url: svgToDataUrl(svg), width, height, anchorX: cx, anchorY: height };
}

/**
 * `photo-pin-2` — modelled on `docs/UI-sample/map-marker-sample/mapmarker2.svg`:
 * a rounder "shield" badge (larger corner radius than `photo-pin-1`) whose
 * tail curves smoothly into its point via quadratic Bézier segments, rather
 * than the sharp straight-edged tail used elsewhere in this file. Same
 * light outer body border + large-photo composition as `photo-pin-1`.
 */
function photoPinTemplate2Icon(options: BuildMarkerIconOptions, imageUrl: string): MarkerIconSpec {
  const { pixelSize: w, color, selected } = options;
  const pad = Math.max(2, Math.round(w * 0.08));
  const bodySize = w;
  const cornerR = bodySize * 0.42;
  const width = Math.round(bodySize + pad * 2);
  const bodyTop = pad;
  const bodyBottom = bodyTop + bodySize;
  const bodyCenterY = bodyTop + bodySize / 2;
  const cx = width / 2;
  const tailHalf = bodySize * 0.24;
  const tailH = Math.round(bodySize * 0.55);
  const height = Math.round(bodyBottom + tailH) + 1;
  const accentColor = selected ? SELECTED_RING_COLOR : color;
  const lightBorderColor = lightenColor(color, selected ? 0.42 : 0.6);
  const { photoR, accentWidth, whiteGapWidth, outerBorderWidth } = derivePhotoRingMetrics(width);
  const clipId = 'photo-clip-2';
  const curveY = bodyBottom + tailH * 0.3;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    shadowDefs(selected),
    `<g filter="url(#mk)">`,
    `<path d="M ${round(cx - tailHalf)} ${round(bodyBottom - 1)} Q ${round(cx)} ${round(curveY)} ${round(cx)} ${height - 1} Q ${round(cx)} ${round(curveY)} ${round(cx + tailHalf)} ${round(bodyBottom - 1)} Z" fill="${accentColor}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>`,
    `<rect x="${round(pad)}" y="${round(bodyTop)}" width="${round(bodySize)}" height="${round(bodySize)}" rx="${round(cornerR)}" fill="#ffffff" stroke="${lightBorderColor}" stroke-width="${outerBorderWidth}"/>`,
    photoCircleMarkup(clipId, cx, bodyCenterY, photoR, accentWidth, whiteGapWidth, accentColor, color, imageUrl),
    `</g>`,
    `</svg>`,
  ].join('');
  return { url: svgToDataUrl(svg), width, height, anchorX: cx, anchorY: height };
}

/**
 * `photo-pin-3` — modelled on `docs/UI-sample/map-marker-sample/mapmarker3.svg`:
 * a diamond silhouette whose own bottom vertex IS the geographic anchor —
 * matching the reference, there is no separate tail. Same light outer body
 * border + large-photo composition as the other two templates.
 */
function photoPinTemplate3Icon(options: BuildMarkerIconOptions, imageUrl: string): MarkerIconSpec {
  const { pixelSize: w, color, selected } = options;
  const half = (w / 2) * 1.05;
  const bodyH = w * 1.15;
  const hPad = Math.max(2, Math.round(w * 0.06));
  const vPad = Math.max(2, Math.round(w * 0.06));
  const width = Math.round(half * 2 + hPad * 2);
  const topY = vPad;
  const bottomY = topY + bodyH;
  const midY = topY + bodyH / 2;
  const cx = width / 2;
  const height = Math.round(bottomY) + 1;
  const accentColor = selected ? SELECTED_RING_COLOR : color;
  const lightBorderColor = lightenColor(color, selected ? 0.42 : 0.6);
  const { photoR, accentWidth, whiteGapWidth, outerBorderWidth } = derivePhotoRingMetrics(width);
  const clipId = 'photo-clip-3';
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    shadowDefs(selected),
    `<g filter="url(#mk)">`,
    `<path d="M ${round(cx)} ${round(topY)} L ${round(cx + half)} ${round(midY)} L ${round(cx)} ${round(bottomY)} L ${round(cx - half)} ${round(midY)} Z" fill="#ffffff" stroke="${lightBorderColor}" stroke-width="${outerBorderWidth}" stroke-linejoin="round"/>`,
    photoCircleMarkup(clipId, cx, midY, photoR, accentWidth, whiteGapWidth, accentColor, color, imageUrl),
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

/** Same as `escapeXml`, plus quote-escaping — this one is interpolated inside a double-quoted SVG attribute (`href="..."`), never as element text content. */
function escapeXmlAttribute(value: string): string {
  return escapeXml(value).replace(/"/g, '&quot;');
}

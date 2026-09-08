import { describe, expect, it } from 'vitest';
import type { MapThemeMarkerStyle, PhotoMarkerStyle } from 'shared-types';
import {
  buildMarkerIcon,
  resolveMarkerVisualConfig,
  resolvePhotoPinTemplate,
  resolvePublicPhotoPinTemplate,
  type PhotoPinTemplate,
} from './marker-style-adapter';

describe('resolveMarkerVisualConfig — checkpoint 1B.9 / 1B.16', () => {
  it('maps the legacy PIN style to the rounded-square badge pattern', () => {
    const style: MapThemeMarkerStyle = { style: 'PIN', size: 'MEDIUM' };
    expect(resolveMarkerVisualConfig(style).pattern).toBe('rounded-square');
  });

  it('maps the legacy DOT style to the circle pattern', () => {
    const style: MapThemeMarkerStyle = { style: 'DOT', size: 'SMALL' };
    expect(resolveMarkerVisualConfig(style).pattern).toBe('circle');
  });

  it('resolves SMALL/MEDIUM/LARGE to three distinct, increasing pixel sizes', () => {
    const small = resolveMarkerVisualConfig({ style: 'PIN', size: 'SMALL' }).pixelSize;
    const medium = resolveMarkerVisualConfig({ style: 'PIN', size: 'MEDIUM' }).pixelSize;
    const large = resolveMarkerVisualConfig({ style: 'PIN', size: 'LARGE' }).pixelSize;
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it('is pure: the same input always produces a deep-equal result', () => {
    const style: MapThemeMarkerStyle = { style: 'DOT', size: 'LARGE' };
    expect(resolveMarkerVisualConfig(style)).toEqual(resolveMarkerVisualConfig(style));
  });
});

describe('buildMarkerIcon — checkpoint 1B.10 §4/§5, 1B.16 marker patterns', () => {
  const base = { pixelSize: 28, color: '#2f6fed', glyph: '📍', selected: false } as const;

  it('produces a self-contained data: URI — no network request possible', () => {
    const icon = buildMarkerIcon({ pattern: 'circle', ...base });
    expect(icon.url.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('a circle marker is square and anchored at its own center', () => {
    const icon = buildMarkerIcon({ pattern: 'circle', ...base });
    expect(icon.width).toBe(28);
    expect(icon.height).toBe(28);
    expect(icon.anchorX).toBe(14);
    expect(icon.anchorY).toBe(14);
  });

  it('a rounded-square badge is taller than it is wide and anchored at its bottom tip', () => {
    const icon = buildMarkerIcon({ pattern: 'rounded-square', ...base });
    expect(icon.height).toBeGreaterThan(icon.width);
    expect(icon.anchorY).toBe(icon.height);
    expect(icon.anchorX).toBe(icon.width / 2);
  });

  it('a classic-pin is taller than it is wide and anchored at its tail tip', () => {
    const icon = buildMarkerIcon({ pattern: 'classic-pin', ...base });
    expect(icon.height).toBeGreaterThan(icon.width);
    expect(icon.anchorY).toBe(icon.height);
    expect(icon.anchorX).toBe(icon.width / 2);
  });

  it('the selected state is visually distinguishable from the default state (every pattern)', () => {
    for (const pattern of ['rounded-square', 'circle', 'classic-pin', 'icon-circle'] as const) {
      const normal = buildMarkerIcon({ pattern, ...base, selected: false });
      const selected = buildMarkerIcon({ pattern, ...base, selected: true });
      expect(selected.url).not.toBe(normal.url);
    }
  });

  it('is pure: the same input always produces a deep-equal result', () => {
    const options = { pattern: 'rounded-square', ...base } as const;
    expect(buildMarkerIcon(options)).toEqual(buildMarkerIcon(options));
  });

  it('escapes glyph content so it cannot break out of the generated SVG markup', () => {
    const icon = buildMarkerIcon({ pattern: 'circle', ...base, glyph: '<script>' });
    expect(icon.url).not.toContain('<script>');
  });

  it('renders a vector <path> glyph when glyphPath is supplied — no <text> element', () => {
    const icon = buildMarkerIcon({ pattern: 'rounded-square', ...base, glyphPath: 'M2 2h20v20H2z' });
    const decoded = decodeURIComponent(icon.url);
    expect(decoded).toContain('<path d="M2 2h20v20H2z"');
    expect(decoded).not.toContain('<text');
  });

  it('glyphPath takes precedence over the legacy emoji glyph', () => {
    const withPath = buildMarkerIcon({ pattern: 'circle', ...base, glyph: '📍', glyphPath: 'M0 0h24v24H0z' });
    const decoded = decodeURIComponent(withPath.url);
    expect(decoded).not.toContain('📍');
    expect(decoded).toContain('<path');
  });

  it('a glyphPath icon still distinguishes its selected state', () => {
    const opts = { pattern: 'rounded-square', ...base, glyphPath: 'M0 0h24v24H0z' } as const;
    expect(buildMarkerIcon({ ...opts, selected: true }).url).not.toBe(buildMarkerIcon({ ...opts, selected: false }).url);
  });

  it('is pure with a glyphPath: the same input always produces a deep-equal result', () => {
    const opts = { pattern: 'circle', ...base, glyphPath: 'M0 0h24v24H0z' } as const;
    expect(buildMarkerIcon(opts)).toEqual(buildMarkerIcon(opts));
  });

  it('a rounded-square badge is a rounded rect + pointer with a soft shadow — not a circle', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'rounded-square', ...base, glyphPath: 'M0 0h24v24H0z' }).url);
    expect(decoded).toContain('<rect');
    expect(decoded).toContain('rx=');
    expect(decoded).toContain('feDropShadow');
    expect(decoded).not.toContain('<circle');
  });

  it('a default badge uses the category colour for its border/glyph on a white face; selected inverts to a colour face', () => {
    const normal = decodeURIComponent(buildMarkerIcon({ pattern: 'rounded-square', ...base, glyphPath: 'M0 0h24v24H0z', selected: false }).url);
    expect(normal).toContain('fill="#ffffff"');
    expect(normal).toContain('stroke="#2f6fed"');

    const selected = decodeURIComponent(buildMarkerIcon({ pattern: 'rounded-square', ...base, glyphPath: 'M0 0h24v24H0z', selected: true }).url);
    expect(selected).toContain('fill="#2f6fed"');
    expect(selected).toContain('stroke="#111827"');
  });

  it('circle is a solid category-colour disc; icon-circle is a white face with a category-colour ring', () => {
    const circle = decodeURIComponent(buildMarkerIcon({ pattern: 'circle', ...base, glyphPath: 'M0 0h24v24H0z' }).url);
    expect(circle).toContain('<circle');
    expect(circle).not.toContain('<rect');
    expect(circle).toContain('fill="#2f6fed"');

    const iconCircle = decodeURIComponent(buildMarkerIcon({ pattern: 'icon-circle', ...base, glyphPath: 'M0 0h24v24H0z', selected: false }).url);
    expect(iconCircle).toContain('<circle');
    expect(iconCircle).toContain('fill="#ffffff"');
    expect(iconCircle).toContain('stroke="#2f6fed"');
  });
});

describe('buildMarkerIcon — photo-pin (Photo Experience Prototype checkpoint)', () => {
  const base = { pixelSize: 28, color: '#2f6fed', glyph: '📍', selected: false } as const;
  // `buildMarkerIcon` is agnostic to what `imageUrl` is; in production it is
  // always a `data:` URI (an SVG marker icon cannot load an external href).
  // A no-query string is used for the verbatim-embed assertion; the `&`/`"`
  // escaping of a real URL is covered by its own test below, and a genuine
  // `data:` URI by the test after that.
  const PHOTO_URL = 'https://admin.example/api/public/maps/map_x/pois/poi_x/photo';
  const PHOTO_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  it('renders the photo as an SVG <image> element when imageUrl is supplied', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL }).url);
    expect(decoded).toContain('<image');
    expect(decoded).toContain(`href="${PHOTO_URL}"`);
    expect(decoded).toContain('clip-path=');
  });

  it('embeds a data: URI verbatim (the real production shape — no external ref)', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_DATA_URI }).url);
    expect(decoded).toContain(`href="${PHOTO_DATA_URI}"`);
    expect(decoded).not.toContain('href="http');
  });

  it('is a downward pin: taller than wide, anchored at its bottom tip', () => {
    const icon = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL });
    expect(icon.height).toBeGreaterThan(icon.width);
    expect(icon.anchorY).toBe(icon.height);
    expect(icon.anchorX).toBe(icon.width / 2);
  });

  it('keeps an opaque category-colour disc behind the photo so a failed image never shows a broken-image glyph', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL }).url);
    // A filled <circle> in the category colour is drawn before the <image>.
    expect(decoded.indexOf('<circle')).toBeLessThan(decoded.indexOf('<image'));
    expect(decoded).toContain('fill="#2f6fed"');
  });

  it('is layered as tail → category-colour accent → thick white ring → photo (the reference marker shape)', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL }).url);
    // an integrated pointed tail
    expect(decoded).toContain('<path d="M ');
    // a thick clean WHITE ring between the category accent and the photo
    expect(decoded).toContain('fill="#ffffff"');
    // and the geographic anchor is still the tail tip
    const icon = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL });
    expect(icon.anchorY).toBe(icon.height);
  });

  it('selected renders a stronger DARK accent ring; the default renders the category colour', () => {
    const normal = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, selected: false }).url);
    const selected = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, selected: true }).url);
    expect(selected).toContain('#111827');
    expect(normal).not.toContain('#111827');
  });

  it('renders no numeric count badge in this pass (deferred — must not cost a per-marker /photo-meta request)', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL }).url);
    expect(decoded).not.toContain('<text');
  });

  it('escapes an imageUrl so " and & cannot break out of the href attribute', () => {
    const nasty = 'https://x/photo?a=1&b=2"/><script>alert(1)</script>';
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: nasty }).url);
    expect(decoded).not.toContain('<script>');
    expect(decoded).toContain('&amp;');
    expect(decoded).toContain('&quot;');
  });

  it('falls back to the rounded-square badge (never a broken image) when pattern is photo-pin but no imageUrl is supplied', () => {
    const photoPin = buildMarkerIcon({ pattern: 'photo-pin', ...base });
    const roundedSquare = buildMarkerIcon({ pattern: 'rounded-square', ...base });
    expect(photoPin.url).toBe(roundedSquare.url);
    expect(decodeURIComponent(photoPin.url)).not.toContain('<image');
  });

  it('distinguishes its selected state', () => {
    const normal = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, selected: false });
    const selected = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, selected: true });
    expect(selected.url).not.toBe(normal.url);
  });

  it('is pure: the same input always produces a deep-equal result', () => {
    const opts = { pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL } as const;
    expect(buildMarkerIcon(opts)).toEqual(buildMarkerIcon(opts));
  });
});

describe('buildMarkerIcon — photo-pin selectable templates (mapmarker1/2/3 reference SVGs)', () => {
  const base = { pixelSize: 40, color: '#2f6fed', glyph: '📍', selected: false } as const;
  const PHOTO_URL = 'https://admin.example/api/public/maps/map_x/pois/poi_x/photo';
  const TEMPLATES: readonly PhotoPinTemplate[] = ['photo-pin-1', 'photo-pin-2', 'photo-pin-3'];

  // mapmarker2.svg proportion pass — reference: canvas 74×82, photo circle
  // cx=35.5 cy=38 rx=33 ry=33, i.e. photo diameter ≈ 66/74 ≈ 89% of the
  // marker's own width. "the photo should consume most of the marker face."

  /** Mirrors marker-style-adapter.ts's internal (unexported) `lightenColor` — recomputed here, not imported, so this proves the PUBLIC markup reflects that exact formula rather than merely trusting the implementation. */
  function expectedLightenColor(hex: string, amount: number): string {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
    const captured = match?.[1];
    if (!captured) throw new Error(`not a hex colour: ${hex}`);
    const value = parseInt(captured, 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * amount));
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  /** The real, circle-clipped POI photo's rendered diameter — read straight off the generated `<image width="...">` attribute, never assumed. */
  function extractImageWidth(decoded: string): number {
    const match = /<image[^>]*\swidth="([\d.]+)"/.exec(decoded);
    const captured = match?.[1];
    if (!captured) throw new Error('no <image> width found in generated markup');
    return Number(captured);
  }

  /** The outer body shape's own stroke colour — identified as the stroke on the element with a white fill (the badge/diamond body; the tail is the opposite: an accent-colour fill with a white stroke, so this pattern is unambiguous). */
  function extractBodyStrokeColor(decoded: string): string {
    const match = /fill="#ffffff"[^>]*stroke="(#[0-9a-fA-F]{6})"/.exec(decoded);
    const captured = match?.[1];
    if (!captured) throw new Error('no white-filled body stroke found in generated markup');
    return captured;
  }

  it('the default template (no photoPinTemplate given) is byte-identical to the explicit legacy template — every existing caller is unaffected', () => {
    const implicit = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL });
    const explicitLegacy = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: 'legacy' });
    expect(implicit).toEqual(explicitLegacy);
  });

  it.each(TEMPLATES)('%s renders a self-contained data: URI containing a circle-clipped <image>', (template) => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template }).url);
    expect(decoded).toContain('<image');
    expect(decoded).toContain('clip-path=');
  });

  it.each(TEMPLATES)('%s injects the real POI imageUrl into the central photo region, never a placeholder colour', (template) => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template }).url);
    expect(decoded).toContain(`href="${PHOTO_URL}"`);
    // the draw.io reference's placeholder photo fill must never appear as the rendered content
    expect(decoded).not.toContain('#ffe6cc');
  });

  it.each(TEMPLATES)('%s embeds a data: URI verbatim — no external HTTP image dependency is introduced', (template) => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: dataUri, photoPinTemplate: template }).url);
    expect(decoded).toContain(`href="${dataUri}"`);
  });

  it.each(TEMPLATES)('%s still falls back to the rounded-square badge (never a broken image) when no imageUrl is supplied', (template) => {
    const photoPin = buildMarkerIcon({ pattern: 'photo-pin', ...base, photoPinTemplate: template });
    const roundedSquare = buildMarkerIcon({ pattern: 'rounded-square', ...base });
    expect(photoPin.url).toBe(roundedSquare.url);
    expect(decodeURIComponent(photoPin.url)).not.toContain('<image');
  });

  it.each(TEMPLATES)('%s keeps the geographic anchor at its own bottom tip', (template) => {
    const icon = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template });
    expect(icon.anchorY).toBe(icon.height);
    expect(icon.anchorX).toBeCloseTo(icon.width / 2, 5);
    expect(icon.height).toBeGreaterThan(icon.width * 0.9);
  });

  it.each(TEMPLATES)('%s supports a visually distinguishable selected state without changing its footprint', (template) => {
    const normal = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template, selected: false });
    const selected = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template, selected: true });
    expect(selected.url).not.toBe(normal.url);
    // selected strengthens colour/ring only — same template geometry, so the
    // reported anchor stays proportionally the same shape (caller scales
    // pixelSize up separately for the "slightly larger" selected effect).
    expect(selected.anchorX / selected.width).toBeCloseTo(normal.anchorX / normal.width, 5);
  });

  it.each(TEMPLATES)('%s renders no numeric count badge in this pass', (template) => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template }).url);
    expect(decoded).not.toContain('<text');
  });

  it.each(TEMPLATES)('%s scales validly across SMALL/MEDIUM/LARGE (strictly increasing footprint, still anchored at the bottom)', (template) => {
    const small = buildMarkerIcon({ pattern: 'photo-pin', ...base, pixelSize: 30, imageUrl: PHOTO_URL, photoPinTemplate: template });
    const medium = buildMarkerIcon({ pattern: 'photo-pin', ...base, pixelSize: 40, imageUrl: PHOTO_URL, photoPinTemplate: template });
    const large = buildMarkerIcon({ pattern: 'photo-pin', ...base, pixelSize: 50, imageUrl: PHOTO_URL, photoPinTemplate: template });
    expect(small.width).toBeLessThan(medium.width);
    expect(medium.width).toBeLessThan(large.width);
    for (const icon of [small, medium, large]) {
      expect(icon.anchorY).toBe(icon.height);
    }
  });

  it.each(TEMPLATES)('%s is pure: the same input always produces a deep-equal result', (template) => {
    const opts = { pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template } as const;
    expect(buildMarkerIcon(opts)).toEqual(buildMarkerIcon(opts));
  });

  it.each(TEMPLATES)('%s escapes an imageUrl so " and & cannot break out of the href attribute', (template) => {
    const nasty = 'https://x/photo?a=1&b=2"/><script>alert(1)</script>';
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: nasty, photoPinTemplate: template }).url);
    expect(decoded).not.toContain('<script>');
    expect(decoded).toContain('&amp;');
    expect(decoded).toContain('&quot;');
  });

  it('photo-pin-1 keeps its rounded-square badge silhouette (unchanged by the mapmarker2 proportion pass)', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: 'photo-pin-1' }).url);
    expect(decoded).toContain('<rect');
    expect(decoded).toContain('rx=');
  });

  it.each(TEMPLATES)('%s makes the real photo VERY LARGE relative to the marker body — diameter is more than 65%% of the marker width (mapmarker2 reference: ≈89%%)', (template) => {
    const icon = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template });
    const decoded = decodeURIComponent(icon.url);
    const photoDiameter = extractImageWidth(decoded);
    expect(photoDiameter / icon.width).toBeGreaterThan(0.65);
  });

  it.each(TEMPLATES)('%s uses a LIGHT, derived-from-category-colour outer body border — never the raw saturated category colour, never hardcoded orange, never black', (template) => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template }).url);
    const bodyStroke = extractBodyStrokeColor(decoded);
    expect(bodyStroke).toBe(expectedLightenColor(base.color, 0.6));
    expect(bodyStroke).not.toBe(base.color);
    expect(bodyStroke).not.toBe('#000000');
    expect(bodyStroke.toLowerCase()).not.toBe('#d79b00');
    expect(bodyStroke.toLowerCase()).not.toBe('#ffe6cc');
  });

  it.each(TEMPLATES)('%s keeps the thin (≈1px-equivalent) inner accent line at the raw/selected-dark category colour — distinct from the lightened outer border', (template) => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template }).url);
    expect(decoded).toContain(`fill="${base.color}"`);
    expect(extractBodyStrokeColor(decoded)).not.toBe(base.color);
  });

  it.each(TEMPLATES)('%s selected state strengthens (slightly less light) the outer border and darkens the inner accent line, without changing the photo-to-marker ratio or the anchor', (template) => {
    const normalIcon = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template, selected: false });
    const selectedIcon = buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: template, selected: true });
    const normalDecoded = decodeURIComponent(normalIcon.url);
    const selectedDecoded = decodeURIComponent(selectedIcon.url);
    expect(extractBodyStrokeColor(normalDecoded)).toBe(expectedLightenColor(base.color, 0.6));
    expect(extractBodyStrokeColor(selectedDecoded)).toBe(expectedLightenColor(base.color, 0.42));
    expect(selectedDecoded).toContain('#111827');
    const normalRatio = extractImageWidth(normalDecoded) / normalIcon.width;
    const selectedRatio = extractImageWidth(selectedDecoded) / selectedIcon.width;
    expect(selectedRatio).toBeCloseTo(normalRatio, 1);
    expect(selectedIcon.anchorY).toBe(selectedIcon.height);
    expect(normalIcon.anchorY).toBe(normalIcon.height);
  });

  it.each(TEMPLATES)('%s scales the photo diameter up strictly across SMALL/MEDIUM/LARGE, approaching the ~89%% target ratio as the marker grows', (template) => {
    const small = buildMarkerIcon({ pattern: 'photo-pin', ...base, pixelSize: 30, imageUrl: PHOTO_URL, photoPinTemplate: template });
    const medium = buildMarkerIcon({ pattern: 'photo-pin', ...base, pixelSize: 40, imageUrl: PHOTO_URL, photoPinTemplate: template });
    const large = buildMarkerIcon({ pattern: 'photo-pin', ...base, pixelSize: 50, imageUrl: PHOTO_URL, photoPinTemplate: template });
    const smallDiameter = extractImageWidth(decodeURIComponent(small.url));
    const mediumDiameter = extractImageWidth(decodeURIComponent(medium.url));
    const largeDiameter = extractImageWidth(decodeURIComponent(large.url));
    expect(smallDiameter).toBeLessThan(mediumDiameter);
    expect(mediumDiameter).toBeLessThan(largeDiameter);
    // the RATIO (diameter/width) should not shrink as the marker grows — it
    // should hold steady or move closer to the ~89% target.
    expect(largeDiameter / large.width).toBeGreaterThan(smallDiameter / small.width - 0.001);
  });

  it('photo-pin-2 has a distinct smoothly-curved tail (quadratic Bézier), not the sharp straight-edged tail used elsewhere', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: 'photo-pin-2' }).url);
    const tailPath = decoded.match(/<path d="M [^"]*"/)?.[0] ?? '';
    expect(tailPath).toContain(' Q ');
  });

  it('photo-pin-3 renders a diamond outer silhouette (no separate tail — the bottom vertex is the anchor)', () => {
    const decoded = decodeURIComponent(buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate: 'photo-pin-3' }).url);
    expect(decoded).not.toContain('<rect');
    // exactly one 4-point straight-line path forms the diamond body (no curved tail segment)
    const diamondPath = decoded.match(/<path d="M [^"]*" fill="#ffffff"[^>]*\/>/);
    expect(diamondPath).not.toBeNull();
    expect(diamondPath?.[0]).not.toContain(' Q ');
  });

  it('the three templates and the legacy template each produce visually distinct markup for the same inputs', () => {
    const urls = new Set(
      (['legacy', 'photo-pin-1', 'photo-pin-2', 'photo-pin-3'] as const).map(
        (photoPinTemplate) => buildMarkerIcon({ pattern: 'photo-pin', ...base, imageUrl: PHOTO_URL, photoPinTemplate }).url,
      ),
    );
    expect(urls.size).toBe(4);
  });

  it('ordinary non-photo marker patterns are unaffected by the photoPinTemplate option (it is ignored)', () => {
    const withTemplate = buildMarkerIcon({ pattern: 'rounded-square', ...base, photoPinTemplate: 'photo-pin-3' });
    const without = buildMarkerIcon({ pattern: 'rounded-square', ...base });
    expect(withTemplate).toEqual(without);
  });
});

describe('resolvePhotoPinTemplate — checkpoint ADMIN PHOTO MARKER STYLE', () => {
  it('maps ROUNDED_PIN to photo-pin-1', () => {
    expect(resolvePhotoPinTemplate('ROUNDED_PIN')).toBe('photo-pin-1');
  });

  it('maps SHIELD_PIN to photo-pin-2', () => {
    expect(resolvePhotoPinTemplate('SHIELD_PIN')).toBe('photo-pin-2');
  });

  it('maps DIAMOND_PIN to photo-pin-3', () => {
    expect(resolvePhotoPinTemplate('DIAMOND_PIN')).toBe('photo-pin-3');
  });

  it('falls back to photo-pin-1 when the style is undefined (backward compatibility)', () => {
    expect(resolvePhotoPinTemplate(undefined)).toBe('photo-pin-1');
  });

  it('falls back to photo-pin-1 for any unrecognized value', () => {
    expect(resolvePhotoPinTemplate('NOT_A_REAL_STYLE' as unknown as PhotoMarkerStyle)).toBe('photo-pin-1');
  });
});

describe('resolvePublicPhotoPinTemplate — checkpoint ADMIN PHOTO MARKER STYLE', () => {
  it('in development, a valid ?photoMarker= query override wins over the published style', () => {
    const result = resolvePublicPhotoPinTemplate({
      publishedStyle: 'ROUNDED_PIN',
      devQueryOverride: '3',
      isProduction: false,
    });
    expect(result).toBe('photo-pin-3');
  });

  it('in development, an invalid query override falls through to the published style', () => {
    const result = resolvePublicPhotoPinTemplate({
      publishedStyle: 'SHIELD_PIN',
      devQueryOverride: 'not-a-number',
      isProduction: false,
    });
    expect(result).toBe('photo-pin-2');
  });

  it('in development, an absent query override falls through to the published style', () => {
    const result = resolvePublicPhotoPinTemplate({
      publishedStyle: 'DIAMOND_PIN',
      devQueryOverride: undefined,
      isProduction: false,
    });
    expect(result).toBe('photo-pin-3');
  });

  it('in production, the query override is completely ignored even when it is a valid value', () => {
    const result = resolvePublicPhotoPinTemplate({
      publishedStyle: 'SHIELD_PIN',
      devQueryOverride: '3',
      isProduction: true,
    });
    expect(result).toBe('photo-pin-2');
  });

  it('falls back to photo-pin-1 when the published style is missing (old publication snapshot) and there is no dev override', () => {
    const result = resolvePublicPhotoPinTemplate({
      publishedStyle: undefined,
      devQueryOverride: undefined,
      isProduction: false,
    });
    expect(result).toBe('photo-pin-1');
  });

  it('falls back to photo-pin-1 when the published style is missing, in production', () => {
    const result = resolvePublicPhotoPinTemplate({
      publishedStyle: undefined,
      devQueryOverride: undefined,
      isProduction: true,
    });
    expect(result).toBe('photo-pin-1');
  });
});

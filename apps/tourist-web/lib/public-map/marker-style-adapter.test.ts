import { describe, expect, it } from 'vitest';
import type { MapThemeMarkerStyle } from 'shared-types';
import { buildMarkerIcon, resolveMarkerVisualConfig } from './marker-style-adapter';

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

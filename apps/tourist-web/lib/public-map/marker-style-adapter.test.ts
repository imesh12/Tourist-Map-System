import { describe, expect, it } from 'vitest';
import type { MapThemeMarkerStyle } from 'shared-types';
import { buildMarkerIcon, resolveMarkerVisualConfig } from './marker-style-adapter';

describe('resolveMarkerVisualConfig — checkpoint 1B.9', () => {
  it('maps PIN to the pin shape', () => {
    const style: MapThemeMarkerStyle = { style: 'PIN', size: 'MEDIUM' };
    expect(resolveMarkerVisualConfig(style).shape).toBe('pin');
  });

  it('maps DOT to the dot shape', () => {
    const style: MapThemeMarkerStyle = { style: 'DOT', size: 'SMALL' };
    expect(resolveMarkerVisualConfig(style).shape).toBe('dot');
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

describe('buildMarkerIcon — checkpoint 1B.10 §4/§5', () => {
  const base = { pixelSize: 28, color: '#2f6fed', glyph: '📍', selected: false } as const;

  it('produces a self-contained data: URI — no network request possible', () => {
    const icon = buildMarkerIcon({ shape: 'dot', ...base });
    expect(icon.url.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('a dot icon is square and anchored at its own center', () => {
    const icon = buildMarkerIcon({ shape: 'dot', ...base });
    expect(icon.width).toBe(28);
    expect(icon.height).toBe(28);
    expect(icon.anchorX).toBe(14);
    expect(icon.anchorY).toBe(14);
  });

  it('a pin icon is taller than it is wide and anchored at its bottom tip', () => {
    const icon = buildMarkerIcon({ shape: 'pin', ...base });
    expect(icon.height).toBeGreaterThan(icon.width);
    expect(icon.anchorY).toBe(icon.height);
    expect(icon.anchorX).toBe(icon.width / 2);
  });

  it('the selected state is visually distinguishable from the default state', () => {
    const normal = buildMarkerIcon({ shape: 'pin', ...base, selected: false });
    const selected = buildMarkerIcon({ shape: 'pin', ...base, selected: true });
    expect(selected.url).not.toBe(normal.url);
  });

  it('is pure: the same input always produces a deep-equal result', () => {
    const options = { shape: 'pin', ...base } as const;
    expect(buildMarkerIcon(options)).toEqual(buildMarkerIcon(options));
  });

  it('escapes glyph content so it cannot break out of the generated SVG markup', () => {
    const icon = buildMarkerIcon({ shape: 'dot', ...base, glyph: '<script>' });
    expect(icon.url).not.toContain('<script>');
  });
});

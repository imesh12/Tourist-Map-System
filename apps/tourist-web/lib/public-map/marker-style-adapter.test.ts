import { describe, expect, it } from 'vitest';
import type { MapThemeMarkerStyle } from 'shared-types';
import { resolveMarkerVisualConfig } from './marker-style-adapter';

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

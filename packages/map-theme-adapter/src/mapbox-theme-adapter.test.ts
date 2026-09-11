import { describe, expect, it } from 'vitest';
import type { MapTheme } from 'shared-types';
import { mapThemeToMapboxConfig } from './mapbox-theme-adapter.js';

const theme: MapTheme = {
  preset: 'STANDARD',
  visibility: { businessPois: true, transit: true, schools: true, hospitals: true, parks: true, roadLabels: true, transitLabels: true },
  markerStyle: { style: 'PIN', size: 'MEDIUM' },
};

describe('mapThemeToMapboxConfig', () => {
  it.each([
    ['ROAD', 'mapbox://styles/mapbox/standard'],
    ['SATELLITE', 'mapbox://styles/mapbox/satellite-v9'],
    ['HYBRID', 'mapbox://styles/mapbox/satellite-streets-v12'],
    ['TERRAIN', 'mapbox://styles/mapbox/outdoors-v12'],
    ['CUSTOM', 'mapbox://styles/mapbox/standard'],
  ] as const)('%s maps to the documented Mapbox style', (style, styleUrl) => {
    expect(mapThemeToMapboxConfig(style, theme).styleUrl).toBe(styleUrl);
  });

  it('marks CUSTOM as a deterministic fallback because no custom URL is persisted', () => {
    expect(mapThemeToMapboxConfig('CUSTOM', theme).customStyleFallback).toBe(true);
  });

  it.each([
    ['STANDARD', 'default'],
    ['TOURISM', 'default'],
    ['TOURIST_CLEAN', 'faded'],
    ['LIGHT', 'default'],
    ['MINIMAL', 'monochrome'],
  ] as const)('maps the %s preset', (preset, expectedTheme) => {
    expect(mapThemeToMapboxConfig('ROAD', { ...theme, preset }).standardConfig.theme).toBe(expectedTheme);
  });

  it('maps provider label visibility without mutating the generic theme', () => {
    const input = { ...theme, visibility: { ...theme.visibility, businessPois: false, roadLabels: false } };
    const before = structuredClone(input);
    const config = mapThemeToMapboxConfig('ROAD', input);
    expect(config.standardConfig.showPointOfInterestLabels).toBe(false);
    expect(config.standardConfig.showRoadLabels).toBe(false);
    expect(input).toEqual(before);
  });
});

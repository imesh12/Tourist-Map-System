import { describe, expect, it } from 'vitest';
import type { MapTheme } from 'shared-types';
import { mapThemeToGoogleMapsStyles } from './google-theme-adapter';

/**
 * `mapThemeToGoogleMapsStyles` unit tests — checkpoint 1B.7 §6 ("Unit test
 * this conversion"). No `google` global or Maps JS SDK is loaded/mocked
 * anywhere here — the whole point of this adapter returning plain objects
 * (see its own doc comment) is that it needs neither.
 */

const standardTheme: MapTheme = {
  preset: 'STANDARD',
  visibility: {
    businessPois: true,
    transit: true,
    schools: true,
    hospitals: true,
    parks: true,
    roadLabels: true,
    transitLabels: true,
  },
  markerStyle: { style: 'PIN', size: 'MEDIUM' },
};

const touristCleanTheme: MapTheme = {
  preset: 'TOURIST_CLEAN',
  visibility: {
    businessPois: false,
    transit: true,
    schools: false,
    hospitals: false,
    parks: true,
    roadLabels: true,
    transitLabels: true,
  },
  colors: { background: '#F7F8F5', road: '#FFFFFF', water: '#DDEBF4', label: '#4B5563' },
  markerStyle: { style: 'PIN', size: 'MEDIUM' },
};

const lightTheme: MapTheme = {
  preset: 'LIGHT',
  visibility: {
    businessPois: false,
    transit: true,
    schools: false,
    hospitals: false,
    parks: true,
    roadLabels: true,
    transitLabels: false,
  },
  colors: { background: '#FAFAF9', road: '#FFFFFF', water: '#E3F2FD', label: '#6B7280' },
  markerStyle: { style: 'PIN', size: 'MEDIUM' },
};

const minimalTheme: MapTheme = {
  preset: 'MINIMAL',
  visibility: {
    businessPois: false,
    transit: false,
    schools: false,
    hospitals: false,
    parks: false,
    roadLabels: false,
    transitLabels: false,
  },
  colors: { background: '#F5F5F4', road: '#FFFFFF', water: '#DCE8F0', label: '#9CA3AF' },
  markerStyle: { style: 'DOT', size: 'SMALL' },
};

function hasStyle(styles: readonly { readonly featureType?: string; readonly elementType?: string }[], featureType?: string, elementType?: string): boolean {
  return styles.some((style) => style.featureType === featureType && style.elementType === elementType);
}

describe('mapThemeToGoogleMapsStyles — checkpoint 1B.7', () => {
  it('STANDARD (every visibility flag on, no colors) produces no suppression or color styles at all', () => {
    const styles = mapThemeToGoogleMapsStyles(standardTheme);
    expect(styles).toHaveLength(0);
  });

  it('TOURIST_CLEAN hides default business/attraction/government/place-of-worship POIs', () => {
    const styles = mapThemeToGoogleMapsStyles(touristCleanTheme);
    expect(hasStyle(styles, 'poi.business')).toBe(true);
    expect(hasStyle(styles, 'poi.attraction')).toBe(true);
    expect(hasStyle(styles, 'poi.government')).toBe(true);
    expect(hasStyle(styles, 'poi.place_of_worship')).toBe(true);
  });

  it('TOURIST_CLEAN hides schools and hospitals', () => {
    const styles = mapThemeToGoogleMapsStyles(touristCleanTheme);
    expect(hasStyle(styles, 'poi.school')).toBe(true);
    expect(hasStyle(styles, 'poi.medical')).toBe(true);
  });

  it('TOURIST_CLEAN keeps parks, transit, and road/transit labels visible', () => {
    const styles = mapThemeToGoogleMapsStyles(touristCleanTheme);
    expect(hasStyle(styles, 'poi.park')).toBe(false);
    expect(hasStyle(styles, 'transit')).toBe(false);
    expect(hasStyle(styles, 'transit', 'labels')).toBe(false);
    expect(hasStyle(styles, 'road', 'labels')).toBe(false);
  });

  it('TOURIST_CLEAN applies its 4 color overrides', () => {
    const styles = mapThemeToGoogleMapsStyles(touristCleanTheme);
    const colorStylers = styles.filter((style) => style.stylers.some((styler) => 'color' in styler));
    expect(colorStylers.length).toBe(4);
  });

  it('LIGHT hides transit labels specifically while keeping transit lines/stations visible', () => {
    const styles = mapThemeToGoogleMapsStyles(lightTheme);
    expect(hasStyle(styles, 'transit')).toBe(false);
    expect(hasStyle(styles, 'transit', 'labels')).toBe(true);
  });

  it('MINIMAL hides everything: all POI categories, transit wholesale, and both label types', () => {
    const styles = mapThemeToGoogleMapsStyles(minimalTheme);
    expect(hasStyle(styles, 'poi.business')).toBe(true);
    expect(hasStyle(styles, 'poi.school')).toBe(true);
    expect(hasStyle(styles, 'poi.medical')).toBe(true);
    expect(hasStyle(styles, 'poi.park')).toBe(true);
    // transit is fully off, so the labels-only suppression must NOT also be emitted (redundant/contradictory).
    expect(hasStyle(styles, 'transit')).toBe(true);
    expect(hasStyle(styles, 'transit', 'labels')).toBe(false);
    expect(hasStyle(styles, 'road', 'labels')).toBe(true);
  });

  it('visibility override: turning parks off (independent of businessPois) suppresses only poi.park', () => {
    const theme: MapTheme = { ...standardTheme, visibility: { ...standardTheme.visibility, parks: false } };
    const styles = mapThemeToGoogleMapsStyles(theme);
    expect(hasStyle(styles, 'poi.park')).toBe(true);
    expect(hasStyle(styles, 'poi.business')).toBe(false);
  });

  it('is pure: calling it twice with the same input produces deep-equal, independently-allocated results', () => {
    const first = mapThemeToGoogleMapsStyles(touristCleanTheme);
    const second = mapThemeToGoogleMapsStyles(touristCleanTheme);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it('does not mutate its input theme', () => {
    const theme: MapTheme = JSON.parse(JSON.stringify(touristCleanTheme));
    const snapshot = JSON.stringify(theme);
    mapThemeToGoogleMapsStyles(theme);
    expect(JSON.stringify(theme)).toBe(snapshot);
  });

  it('omits a color styler entirely when that color field is absent', () => {
    const theme: MapTheme = { ...touristCleanTheme, colors: { background: '#111111' } };
    const styles = mapThemeToGoogleMapsStyles(theme);
    const colorStylers = styles.filter((style) => style.stylers.some((styler) => 'color' in styler));
    expect(colorStylers.length).toBe(1);
  });
});

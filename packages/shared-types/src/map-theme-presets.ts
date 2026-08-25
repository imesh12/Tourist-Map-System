import type { MapThemePreset } from './enums.js';
import type { MapTheme } from './map.js';

/**
 * Server-defined sensible defaults for each `MapThemePreset` — checkpoint
 * 1B.7, see docs/architecture/MAP_THEME_ARCHITECTURE.md. A pure, zero-
 * dependency const registry (mirrors `PUBLIC_FEATURE_REGISTRY`'s /
 * `PLATFORM_CATEGORY_REGISTRY`'s identical "one source of truth, no
 * Firestore/network consumer" shape) — both the Map Settings form (to seed
 * `visibility`/`colors`/`markerStyle` the instant a Client Admin picks a
 * different preset, before any Save) and the read-side fallback for a map
 * document with no `theme` field at all (`DEFAULT_MAP_THEME` below) resolve
 * from this exact table, so "what STANDARD/TOURIST_CLEAN/LIGHT/MINIMAL mean"
 * is defined in exactly one place.
 *
 * Selecting a preset only ever POPULATES these values into the editable
 * `MapTheme` fields — see `MapThemePreset`'s own doc comment (./enums.js)
 * for why there is no `CUSTOM` value and no "this theme is now dirty"
 * tracking: a Client Admin may still hand-edit any individual field
 * afterward while the preset name stays exactly as selected.
 */
export const MAP_THEME_PRESET_DEFAULTS: Readonly<Record<MapThemePreset, MapTheme>> = {
  STANDARD: {
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
  },
  TOURIST_CLEAN: {
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
    colors: {
      background: '#F7F8F5',
      road: '#FFFFFF',
      water: '#DDEBF4',
      label: '#4B5563',
    },
    markerStyle: { style: 'PIN', size: 'MEDIUM' },
  },
  LIGHT: {
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
    colors: {
      background: '#FAFAF9',
      road: '#FFFFFF',
      water: '#E3F2FD',
      label: '#6B7280',
    },
    markerStyle: { style: 'PIN', size: 'MEDIUM' },
  },
  MINIMAL: {
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
    colors: {
      background: '#F5F5F4',
      road: '#FFFFFF',
      water: '#DCE8F0',
      label: '#9CA3AF',
    },
    markerStyle: { style: 'DOT', size: 'SMALL' },
  },
};

/** The preset a brand-new map effectively has when no `theme` has ever been saved — the closest thing to "provider defaults." */
export const DEFAULT_MAP_THEME_PRESET: MapThemePreset = 'STANDARD';

/**
 * The theme substituted at the point of use for any map document with no
 * `theme` field at all (every map created before checkpoint 1B.7) — see
 * `MapTheme`'s own doc comment (./map.js) for why this is a read-side
 * fallback rather than a Firestore migration.
 */
export const DEFAULT_MAP_THEME: MapTheme = MAP_THEME_PRESET_DEFAULTS[DEFAULT_MAP_THEME_PRESET];

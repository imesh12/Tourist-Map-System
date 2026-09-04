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
 * from this exact table, so "what each preset means" is defined in exactly
 * one place.
 *
 * Selecting a preset only ever POPULATES these values into the editable
 * `MapTheme` fields — see `MapThemePreset`'s own doc comment (./enums.js)
 * for why there is no `CUSTOM` value and no "this theme is now dirty"
 * tracking: a Client Admin may still hand-edit any individual field
 * afterward while the preset name stays exactly as selected.
 *
 * checkpoint 1B.16 — every preset now carries the four optional visibility
 * fields (`roads`/`buildings`/`placeLabels`/`landmarkPois`) EXPLICITLY, so
 * this table is a complete spec of each preset. For the pre-existing
 * presets the values are chosen to reproduce their historical effective
 * behaviour (old selection == new selection): `landmarkPois: false` on the
 * presets that already had `businessPois: false` (which used to also hide
 * landmarks via the old grouping), and roads/buildings/placeLabels left ON
 * where they historically were. `TOURISM` is the new clean default.
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
      roads: true,
      buildings: true,
      placeLabels: true,
      landmarkPois: true,
    },
    markerStyle: { style: 'PIN', size: 'MEDIUM' },
  },
  TOURISM: {
    preset: 'TOURISM',
    visibility: {
      // Kept: the clean geographic canvas.
      roads: true,
      transit: true,
      parks: true,
      // Off by default: everything that competes with our published content.
      roadLabels: false,
      transitLabels: false,
      buildings: false,
      placeLabels: false,
      businessPois: false,
      landmarkPois: false,
      schools: false,
      hospitals: false,
    },
    colors: {
      background: '#F4F2EC',
      road: '#FFFFFF',
      water: '#CFE1EC',
      label: '#5B6472',
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
      roads: true,
      buildings: true,
      placeLabels: true,
      landmarkPois: false,
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
      roads: true,
      buildings: true,
      placeLabels: true,
      landmarkPois: false,
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
      roads: true,
      buildings: true,
      placeLabels: true,
      landmarkPois: false,
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

/**
 * The preset a brand-new map is created with (persisted explicitly at
 * creation — `apps/admin-web/app/api/maps/route.ts` /
 * `firebase/functions/src/provisioning/provision-client.ts`) and the
 * read-side fallback for any older map document with no `theme` field.
 * checkpoint 1B.16 — moved from `STANDARD` to `TOURISM`: a new Tourist Map
 * should look like a clean destination canvas out of the box, not raw
 * provider Google Maps.
 */
export const DEFAULT_MAP_THEME_PRESET: MapThemePreset = 'TOURISM';

/**
 * The theme substituted at the point of use for any map document with no
 * `theme` field at all (every map created before checkpoint 1B.7, and — for
 * a brief window — before 1B.16 persisted it at creation). See `MapTheme`'s
 * own doc comment (./map.js) for why this is a read-side fallback rather
 * than a Firestore migration. Existing immutable publications are NOT
 * affected: each froze its own fully-resolved `MapTheme` by value at
 * publish time, so changing this constant never changes a stored snapshot.
 */
export const DEFAULT_MAP_THEME: MapTheme = MAP_THEME_PRESET_DEFAULTS[DEFAULT_MAP_THEME_PRESET];

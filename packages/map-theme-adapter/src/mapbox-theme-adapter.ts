import type { MapStyle, MapTheme } from 'shared-types';

export interface MapboxThemeConfig {
  readonly styleUrl: string;
  readonly standardConfig: Readonly<Record<string, boolean | string>>;
  /** True when the generic CUSTOM style has no provider-specific payload. */
  readonly customStyleFallback: boolean;
}

const STYLE_URLS: Readonly<Record<MapStyle, string>> = {
  ROAD: 'mapbox://styles/mapbox/standard',
  SATELLITE: 'mapbox://styles/mapbox/satellite-v9',
  HYBRID: 'mapbox://styles/mapbox/satellite-streets-v12',
  TERRAIN: 'mapbox://styles/mapbox/outdoors-v12',
  // MapStyle has no custom style URL field; retain a deterministic standard
  // fallback rather than inventing provider-specific persisted settings.
  CUSTOM: 'mapbox://styles/mapbox/standard',
};

export function mapThemeToMapboxConfig(style: MapStyle, theme: MapTheme): MapboxThemeConfig {
  const { visibility } = theme;
  const minimal = theme.preset === 'MINIMAL';
  const clean = theme.preset === 'TOURIST_CLEAN';
  const light = theme.preset === 'LIGHT';
  return {
    styleUrl: STYLE_URLS[style],
    customStyleFallback: style === 'CUSTOM',
    standardConfig: {
      theme: minimal ? 'monochrome' : clean ? 'faded' : 'default',
      lightPreset: light ? 'day' : 'day',
      showPlaceLabels: visibility.placeLabels ?? !minimal,
      showPointOfInterestLabels: visibility.businessPois && !minimal,
      showRoadLabels: visibility.roadLabels && !minimal,
      showTransitLabels: visibility.transitLabels && visibility.transit && !minimal,
    },
  };
}

'use client';

import { GoogleMapsLocationPicker } from './google-maps-location-picker';
import { MapPreviewSummary } from './map-preview-summary';
import type { LocationPickerProps } from './types';

/**
 * The location-picker provider abstraction entry point — checkpoint 1B.3
 * §14, mirrors `map-preview.tsx`. This is the ONLY export from
 * `lib/map-preview/` the POI drawer is meant to import for the map picker.
 * Which concrete adapter renders is decided here, from the tenant's own
 * `mapProvider.provider` — exactly like `MapPreview`, so adding a real
 * MAPBOX adapter later only ever means adding one more case here.
 */
export function LocationPicker(props: LocationPickerProps) {
  if (props.provider === 'GOOGLE_MAPS') {
    return <GoogleMapsLocationPicker {...props} />;
  }

  return <MapPreviewSummary notice={`Location picker for ${props.provider} is not yet implemented — enter coordinates manually below.`} />;
}

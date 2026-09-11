'use client';

import { GoogleMapsPreview } from './google-maps-preview';
import { MapPreviewSummary } from './map-preview-summary';
import { MapboxPreview } from './mapbox-preview';
import type { MapPreviewProps } from './types';

/**
 * The map-provider abstraction entry point — checkpoint 1B.1-D.
 *
 * This is the ONLY export from `lib/map-preview/` that `map-settings-form.tsx`
 * (or any future caller) is meant to import. Which concrete adapter renders
 * is decided here, in exactly one place, from `mapProvider.provider` — the
 * same enum `MAP_PROVIDER_NAMES` (shared-types) the settings form already
 * lets a Client Admin choose between. Adding a real MAPBOX adapter later
 * only ever means adding one more case here; it never touches
 * `map-settings-form.tsx`.
 *
 * Each provider adapter owns its SDK lifecycle and translates the same
 * provider-neutral preview props. MAPBOX also uses the shared theme mapper,
 * while an absent token remains a safe summary fallback.
 */
export function MapPreview(props: MapPreviewProps) {
  if (props.provider === 'GOOGLE_MAPS') {
    return <GoogleMapsPreview {...props} />;
  }

  if (props.provider === 'MAPBOX') return <MapboxPreview {...props} />;
  return <MapPreviewSummary notice={`Live preview for ${props.provider} is not yet implemented — showing current values only.`} />;
}

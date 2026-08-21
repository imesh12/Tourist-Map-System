'use client';

import { GoogleMapsPreview } from './google-maps-preview';
import { MapPreviewSummary } from './map-preview-summary';
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
 * MAPBOX is deliberately not implemented in this checkpoint — a live
 * Mapbox GL adapter is a real, separate SDK integration (a second
 * dependency, a second env-var-sourced credential, its own load/sync/
 * bounds-overlay logic), and 1B.1-D's default/demo path is GOOGLE_MAPS
 * (the same default `registerClient` provisioning already assigns new
 * tenants — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md §11). Selecting
 * MAPBOX in the form still works end-to-end (it's a real, saveable value),
 * it just falls back to the same non-interactive summary the "no API key"
 * case uses, rather than pretending to be interactive.
 */
export function MapPreview(props: MapPreviewProps) {
  if (props.provider === 'GOOGLE_MAPS') {
    return <GoogleMapsPreview {...props} />;
  }

  return <MapPreviewSummary notice={`Live preview for ${props.provider} is not yet implemented — showing current values only.`} />;
}

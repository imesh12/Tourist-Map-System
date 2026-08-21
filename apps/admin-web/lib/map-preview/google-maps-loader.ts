import { setOptions } from '@googlemaps/js-api-loader';

/**
 * The one place `setOptions()` (the Google Maps JS API loader's
 * configuration call) is ever invoked — checkpoint 1B.1-D established the
 * "call this at most once, module-wide" rule for `google-maps-preview.tsx`;
 * checkpoint 1B.3 adds a second consumer (`google-maps-location-picker.tsx`,
 * the POI location picker), so the flag/function move here to stay a single
 * source of truth. Two independently-tracked `apiKeyConfigured` flags in two
 * different modules would risk calling `setOptions()` twice, which the
 * underlying loader does not support (configuration is only accepted before
 * the first library import) — see `google-maps-preview.tsx`'s original doc
 * comment for why this matters. Reusing this loader, not re-implementing it,
 * is exactly what checkpoint 1B.3 §14 means by "do NOT introduce a second
 * Google Maps loading architecture."
 */
let apiKeyConfigured = false;

export function ensureGoogleMapsApiConfigured(apiKey: string): void {
  if (!apiKeyConfigured) {
    setOptions({ key: apiKey, v: 'weekly' });
    apiKeyConfigured = true;
  }
}

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
 *
 * Dependency note (checkpoint 1B.9 repair history): this file's
 * `setOptions`/`importLibrary` free-function approach is correct for this
 * project's real dependency baseline, `@googlemaps/js-api-loader@^2.1.1`
 * (whose top-level exports are exactly these two functions). 1B.9
 * momentarily pinned `^1.16.8` instead — a package.json regression, not a
 * problem with this file — which resolves to a version whose only public API
 * is the (unrelated, class-based) `Loader`. That pin has been corrected back
 * to `^2.1.1`; this file was never the thing that needed to change.
 */
let apiKeyConfigured = false;

export function ensureGoogleMapsApiConfigured(apiKey: string): void {
  if (!apiKeyConfigured) {
    setOptions({ key: apiKey, v: 'weekly' });
    apiKeyConfigured = true;
  }
}

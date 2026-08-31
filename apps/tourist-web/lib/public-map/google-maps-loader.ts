import { setOptions } from '@googlemaps/js-api-loader';

/**
 * The one place `setOptions()` (the Google Maps JS API loader's
 * configuration call) is ever invoked in `tourist-web` — checkpoint 1B.9,
 * mirrors `apps/admin-web/lib/map-preview/google-maps-loader.ts`'s
 * identical single-source-of-truth rule ("call this at most once,
 * module-wide"). Deliberately its OWN small module per app, not a shared
 * import of admin-web's copy: this `apiKeyConfigured` flag is per-JS-module
 * instance state, and `admin-web`/`tourist-web` are separate Next.js
 * applications with entirely separate browser bundles/page loads — there is
 * no shared runtime for a shared flag to coordinate, and the loader library
 * itself is already a real, independent dependency each app declares (not a
 * hand-rolled implementation being duplicated). What IS shared between the
 * two apps is the provider-neutral theme translation this loader has
 * nothing to do with — see `map-theme-adapter` (packages/map-theme-adapter).
 *
 * Dependency note (checkpoint 1B.9 repair history): this file's
 * `setOptions`/`importLibrary` free-function approach is correct for this
 * project's real dependency baseline, `@googlemaps/js-api-loader@^2.1.1`
 * (whose top-level exports are exactly these two functions). This
 * dependency was momentarily pinned to `^1.16.8` instead during 1B.9 — a
 * package.json regression, not a problem with this file — which resolves to
 * a version whose only public API is the (unrelated, class-based) `Loader`.
 * That pin has been corrected back to `^2.1.1`; this file was never the
 * thing that needed to change.
 */
let apiKeyConfigured = false;

export function ensureGoogleMapsApiConfigured(apiKey: string): void {
  if (!apiKeyConfigured) {
    setOptions({ key: apiKey, v: 'weekly' });
    apiKeyConfigured = true;
  }
}

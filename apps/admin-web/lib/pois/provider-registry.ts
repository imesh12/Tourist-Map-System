import { FakeGooglePlacesProvider } from './fake-external-provider';
import { GooglePlacesProvider } from './google-places-provider';
import type { ExternalPoiProvider } from './external-provider';

/**
 * Resolves which `ExternalPoiProvider` implementation the discover/import
 * routes actually call — checkpoint 1B.4, the single place that decision is
 * made, so neither route handler ever imports `GooglePlacesProvider` or
 * `FakeGooglePlacesProvider` directly (mirrors `google-maps-loader.ts`'s
 * "one place decides, everything else consumes the abstraction" role for
 * the browser-side map loader).
 *
 * Resolution order:
 * 1. `GOOGLE_PLACES_API_KEY` set → the real `GooglePlacesProvider`. This is
 *    checked FIRST and unconditionally — a real key always wins, so a
 *    misconfigured environment can never accidentally serve fake data in
 *    production.
 * 2. Otherwise, `E2E_FAKE_EXTERNAL_POI_PROVIDER=true` → the deterministic
 *    `FakeGooglePlacesProvider` (`e2e/constants.ts`'s `E2E_APP_ENV` sets
 *    this for the whole E2E `next dev` process — see that file). This flag
 *    is never set outside the E2E harness.
 * 3. Otherwise → `undefined` — Google Places discovery/import is simply
 *    unavailable (the routes return a clear, safe "not configured" error;
 *    see their own doc comments). This is the correct default for any real
 *    deployment that hasn't configured a Google Places API key yet — there
 *    is no fallback that silently serves fake data outside of the E2E flag
 *    above.
 */
export function getExternalPoiProvider(): ExternalPoiProvider | undefined {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (apiKey) {
    return new GooglePlacesProvider(apiKey);
  }
  if (process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER === 'true') {
    return new FakeGooglePlacesProvider();
  }
  return undefined;
}

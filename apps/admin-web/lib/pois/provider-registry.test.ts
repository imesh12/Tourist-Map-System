import { afterEach, describe, expect, it } from 'vitest';
import { FakeGooglePlacesProvider } from './fake-external-provider';
import { GooglePlacesProvider } from './google-places-provider';
import { getExternalPoiProvider } from './provider-registry';

const ORIGINAL_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ORIGINAL_E2E_FLAG = process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER;

function resetEnv(): void {
  if (ORIGINAL_API_KEY === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_E2E_FLAG === undefined) delete process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER;
  else process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER = ORIGINAL_E2E_FLAG;
}

describe('getExternalPoiProvider', () => {
  afterEach(resetEnv);

  it('returns undefined when neither a real key nor the E2E fake flag is configured (safe default)', () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER;
    expect(getExternalPoiProvider()).toBeUndefined();
  });

  it('returns the real GooglePlacesProvider when GOOGLE_PLACES_API_KEY is set', () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    delete process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER;
    expect(getExternalPoiProvider()).toBeInstanceOf(GooglePlacesProvider);
  });

  it('returns the FakeGooglePlacesProvider when the E2E flag is set and no real key is configured', () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER = 'true';
    expect(getExternalPoiProvider()).toBeInstanceOf(FakeGooglePlacesProvider);
  });

  it('a real key always wins over the E2E fake flag, even if both are somehow set', () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER = 'true';
    expect(getExternalPoiProvider()).toBeInstanceOf(GooglePlacesProvider);
  });

  it('an E2E flag value other than the literal string "true" does not enable the fake provider', () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    process.env.E2E_FAKE_EXTERNAL_POI_PROVIDER = 'yes';
    expect(getExternalPoiProvider()).toBeUndefined();
  });
});

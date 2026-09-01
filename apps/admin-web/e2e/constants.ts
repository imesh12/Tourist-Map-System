// Shared between playwright.config.ts and the spec/helper files, so the
// port/base URL/Firebase project identity can't drift between them.
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

// Matches the "default" project alias in firebase/.firebaserc (checkpoint
// 1A.3) — an obviously local-only identity, never a real Firebase project.
export const E2E_FIREBASE_PROJECT_ID = 'touristmap-local';

export const E2E_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// checkpoint 1A.8: /admin and /admin/account now load real tenant data from
// Firestore, so the E2E harness needs the Firestore Emulator running
// alongside Auth — matches firebase/firebase.json's configured port. The
// root `pnpm test:e2e` script was updated to `--only auth,firestore` for
// exactly this reason (see package.json).
export const E2E_FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

// checkpoint 1A.9: the /register form calls the real `registerClient`
// Callable Function over the Functions Emulator transport (not the
// `provisionTestTenant()` Admin SDK fixture used by the rest of this
// suite), so this is the first checkpoint where the Functions Emulator
// actually needs to be running — the root `pnpm test:e2e` script now
// includes it (`--only auth,firestore,functions`, see package.json).
export const E2E_FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5001';

/**
 * The application's own trusted origin for local E2E — matches
 * `E2E_BASE_URL` exactly (same value, same source of truth) and is what
 * `lib/auth/origin-check.ts`'s server-only `APP_ORIGIN` env var is set to
 * for this suite. Kept as its own named constant (rather than inlining
 * `E2E_BASE_URL` below) so it reads clearly as "the trusted origin", not
 * just "the base URL Playwright happens to navigate to".
 */
export const E2E_APP_ORIGIN = E2E_BASE_URL;

/**
 * Deterministic, emulator-only application configuration injected into the
 * `next dev` process Playwright starts (`playwright.config.ts`'s
 * `webServer.env`) — checkpoint 1A.4 repair. Named `E2E_APP_ENV` (not
 * `E2E_FIREBASE_ENV`) because it now carries both the Firebase emulator
 * config and the server-only `APP_ORIGIN` CSRF trust boundary — it is no
 * longer Firebase-specific.
 *
 * The E2E suite must be runnable without a developer having created
 * `apps/admin-web/.env.local` first: `.env.example` is documentation only
 * and Next.js never loads it automatically. `.env.local` is different —
 * `next dev` DOES load it automatically, but only for variables not
 * already present in `process.env`; every var this object sets is already
 * present by the time `next dev` starts (Playwright passes this as
 * `webServer.env`), so a developer's own `.env.local` values are correctly
 * ignored for all of them (checkpoint 1A.10 confirmed this explicitly for
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` below, after a real local `.env.local`
 * with a real key was found to otherwise leak into this "deterministic"
 * env and silently break the no-API-key-fallback assertions in
 * e2e/map-preview.spec.ts). None of the Firebase values here are secrets — the Firebase
 * Web SDK config is not secret by design (access control is enforced by
 * security rules, not by hiding these values — see
 * apps/admin-web/.env.example), and the Auth Emulator does not validate
 * `apiKey`/`authDomain` at all; any well-formed string is accepted.
 * `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must match `E2E_FIREBASE_PROJECT_ID`
 * exactly, since that's also the project ID `e2e/helpers/emulator-auth.ts`
 * uses to create/clear emulator users — a mismatch here would make the
 * browser SDK and the REST-seeded test users talk to two different
 * emulator "projects" and sign-in would fail with user-not-found even
 * though the emulator is running correctly. `APP_ORIGIN` must match
 * `E2E_BASE_URL` exactly, since a mismatch there would make
 * `POST /api/auth/session`/`POST /api/auth/logout` reject every request as
 * an untrusted origin even though the browser is the legitimate app.
 */
export const E2E_APP_ENV: Record<string, string> = {
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: E2E_AUTH_EMULATOR_HOST,
  NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST: E2E_FUNCTIONS_EMULATOR_HOST,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: E2E_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'e2e-emulator-fake-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${E2E_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${E2E_FIREBASE_PROJECT_ID}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:e2eemulatorfakeappid',
  // Deliberately empty, not omitted — checkpoint 1B.1-D's fallback-path
  // tests (e2e/map-preview.spec.ts) require the Google Maps live adapter to
  // be unreachable. Explicitly setting this key (even to '') is what makes
  // Next.js treat it as "already present in process.env" and skip loading
  // any value from a developer's own local .env.local — see this file's
  // doc comment above for how this was actually discovered as a real gap.
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '',
  // Server-only — read by the Firebase Admin SDK (`lib/firebase/admin.ts`)
  // and directly by `resolveFirebaseAdminAppOptions` for `projectId`. Must
  // agree with the client-side project ID above for the same reason.
  FIREBASE_AUTH_EMULATOR_HOST: E2E_AUTH_EMULATOR_HOST,
  FIREBASE_PROJECT_ID: E2E_FIREBASE_PROJECT_ID,
  // checkpoint 1A.8 — read automatically by the Admin SDK's Firestore
  // client (`getFirebaseAdminFirestore()`), the same "no code needs to
  // check for it explicitly" convention `FIREBASE_AUTH_EMULATOR_HOST`
  // already documents in lib/firebase/admin.ts.
  FIRESTORE_EMULATOR_HOST: E2E_FIRESTORE_EMULATOR_HOST,
  // Server-only CSRF trust boundary — see lib/auth/origin-check.ts. Never
  // NEXT_PUBLIC_: the browser has no legitimate need to read this, it's a
  // server-side decision about which Origin header value to trust.
  APP_ORIGIN: E2E_APP_ORIGIN,
  // E2E repair round (post-1B.11): this was previously left entirely
  // UNSET here on the theory that a local machine would simply never have
  // a real `GOOGLE_PLACES_API_KEY` configured — but `lib/pois/provider-registry.ts`'s
  // resolution order makes a real key win UNCONDITIONALLY over
  // `E2E_FAKE_EXTERNAL_POI_PROVIDER` (by design — "a misconfigured
  // environment can never accidentally serve fake data in production"; see
  // that file's own doc comment, unchanged here). The exact same leak this
  // file's own `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` comment above already
  // documents discovering at checkpoint 1A.10 (a developer's real
  // `.env.local` value flowing into `next dev` because Next.js only skips
  // loading a `.env.local` value for a key ALREADY present in
  // `process.env` at startup) applies identically here: once this machine's
  // `apps/admin-web/.env.local` gained a real `GOOGLE_PLACES_API_KEY`, that
  // real key leaked into this "deterministic" E2E process, made
  // `getExternalPoiProvider()` return the real `GooglePlacesProvider`
  // instead of `FakeGooglePlacesProvider`, and broke every assertion in
  // `e2e/google-places-discovery.spec.ts`/`e2e/maps.spec.ts` that depends on
  // the fake provider's deterministic results (missing Sakura Sushi
  // Bar/Tokyo Ramen House, missing Import buttons, the fake error scenario
  // returning a real 200 instead of the fake-injected 502). Explicitly
  // setting it to `''` here — exactly mirroring `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`'s
  // own fix above — closes that leak: `provider-registry.ts`'s own
  // `if (apiKey)` check treats `''` as falsy, so it correctly falls through
  // to the `E2E_FAKE_EXTERNAL_POI_PROVIDER` branch below, restoring the
  // deterministic fake provider regardless of what a developer's own
  // `.env.local` happens to contain. `provider-registry.ts`'s resolution
  // order itself (real key always wins) is NOT changed — this is purely an
  // E2E harness config fix, not a redesign of checkpoint 1B.4.
  GOOGLE_PLACES_API_KEY: '',
  // checkpoint 1B.4 — opts into the deterministic in-process fake provider
  // (lib/pois/fake-external-provider.ts) — see
  // lib/pois/provider-registry.ts's resolution order. Combined with the
  // explicit `GOOGLE_PLACES_API_KEY: ''` above (which guarantees the real
  // key can never leak in and pre-empt this), this is what proves
  // e2e/google-places-discovery.spec.ts never makes a real, billable Google
  // Places request: the real GooglePlacesProvider class is never even
  // instantiated while this flag is the only thing enabling discovery.
  E2E_FAKE_EXTERNAL_POI_PROVIDER: 'true',
};

/**
 * Checkpoint 1B.9 — `tourist-web`'s own dedicated E2E port, distinct from
 * both its normal dev port (3001, see apps/tourist-web/package.json's `dev`
 * script) and admin-web's own E2E port (`E2E_PORT`, 3100) above, for the
 * same reason `E2E_PORT` itself is dedicated: this suite must never collide
 * with a developer's manually-running `next dev` server for either app.
 */
export const E2E_TOURIST_PORT = 3101;
export const E2E_TOURIST_BASE_URL = `http://127.0.0.1:${E2E_TOURIST_PORT}`;

/**
 * `tourist-web`'s own deterministic, emulator-adjacent application
 * configuration, injected into its `next dev` process the same way
 * `E2E_APP_ENV` is injected into admin-web's — see that constant's own doc
 * comment for why every value must be explicitly set (even to `''`) rather
 * than omitted, so a developer's own `apps/tourist-web/.env.local` can never
 * leak into this suite.
 *
 * `ADMIN_PUBLIC_API_BASE_URL` points at admin-web's OWN E2E server
 * (`E2E_BASE_URL`, port 3100) — the real `GET /api/public/maps/{mapId}`
 * route this whole checkpoint is built around, not a mock/stub. This is
 * what makes the cross-app E2E spec (`public-tourist-map.spec.ts`) a genuine
 * integration test: `tourist-web`'s server component really does make an
 * HTTP call to `admin-web`'s real running server for every scenario,
 * including the draft/publish isolation test.
 *
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is deliberately set to `''`, matching
 * `E2E_APP_ENV`'s own established pattern (see that constant's doc comment)
 * — this suite proves the "map preview is unavailable in this environment"
 * fallback (§4/§13) deterministically, with no real, billable Google Maps
 * network call ever made, and no real key needed to run this suite locally.
 */
export const E2E_TOURIST_APP_ENV: Record<string, string> = {
  ADMIN_PUBLIC_API_BASE_URL: E2E_BASE_URL,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '',
};

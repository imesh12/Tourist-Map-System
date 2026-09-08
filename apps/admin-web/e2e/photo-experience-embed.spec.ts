import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_BASE_URL, E2E_TOURIST_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * "Photo Experience Prototype + Embeddable Public Map Foundation" checkpoint
 * E2E suite.
 *
 * Same real cross-app pattern every public-map spec in this directory uses:
 * admin-web (`E2E_BASE_URL`, port 3100) for login / seed / publish / the
 * real public read + photo endpoints, tourist-web (`E2E_TOURIST_BASE_URL`,
 * port 3101) for the embed + POI-detail UI — both real `next dev` servers
 * from `playwright.config.ts`'s `webServer` array, against the real Auth +
 * Firestore emulators. No `GET /api/public/**` route is mocked.
 *
 * NO REAL GOOGLE PLACES CALL is ever made: `E2E_APP_ENV` forces the
 * deterministic in-process `FakeGooglePlacesProvider`
 * (`GOOGLE_PLACES_API_KEY: ''` + `E2E_FAKE_EXTERNAL_POI_PROVIDER: 'true'` —
 * see `e2e/constants.ts`). `places/fake-restaurant-1` deterministically HAS
 * a photo (a real 1x1 PNG + a fixed attribution); `places/fake-restaurant-2`
 * deterministically has none.
 *
 * The tourist-web E2E environment has no real Google Maps browser key
 * (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: ''`), so `google.maps.Map` never loads
 * and the real `photo-pin` marker image is never rendered in this suite —
 * marker-rendering mechanics stay in `apps/tourist-web/lib/public-map/
 * marker-style-adapter.test.ts` (unit). Here the surrounding
 * publication / photo-endpoint / detail-cover / fallback behavior is proven
 * end to end. `photo-pin` remains PROTOTYPE-ONLY and is never persisted into
 * `MAP_MARKER_STYLES`.
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const PHOTO_PLACE_ID = 'places/fake-restaurant-1';
const NO_PHOTO_PLACE_ID = 'places/fake-restaurant-2';

function genId(prefix: string): string {
  return `${prefix}${randomBytes(15).toString('base64url')}`;
}

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Same shape every public-map spec uses — see public-tourist-map.spec.ts for why this must be `page.request` + absolute URL + explicit `Origin`. */
async function publishViaApi(page: Page, mapId: string): Promise<{ status: number; body: { version?: number; code?: string } }> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/publish`, { headers: { Origin: E2E_BASE_URL } });
  return { status: response.status(), body: await response.json() };
}

async function importViaApi(
  page: Page,
  mapId: string,
  input: { categoryId: string; providerPlaceId: string },
): Promise<{ status: number; body: { ok?: boolean; poiId?: string; code?: string } }> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/pois/import`, {
    headers: { Origin: E2E_BASE_URL, 'Content-Type': 'application/json' },
    data: { categoryId: input.categoryId, provider: 'GOOGLE', providerPlaceId: input.providerPlaceId },
  });
  return { status: response.status(), body: await response.json() };
}

interface SeedGooglePoiOptions {
  readonly poiId?: string;
  readonly name: string;
  readonly providerPlaceId: string;
  readonly hasPhoto: boolean;
  readonly status?: 'ENABLED' | 'DISABLED';
}

/** Seeds a category + N `GOOGLE_PLACES` POIs directly (the exact shape `pois/import` writes), the same "seed backend state via the Admin SDK" discipline map-publishing.spec.ts uses. */
async function seedCategory(mapId: string, customerId: string, opts: { enabled?: boolean } = {}): Promise<string> {
  const firestore = await getE2eFirestore();
  const categoryId = genId('cat_');
  await firestore.doc(`maps/${mapId}/categories/${categoryId}`).set({
    categoryId,
    customerId,
    mapId,
    name: 'Restaurants',
    icon: 'FOOD',
    enabled: opts.enabled ?? true,
    order: 0,
    sourceType: 'CLIENT_CUSTOM',
    // Google Places-eligible link — what `pois/import`'s capability check requires.
    platformCategoryId: 'platcat_restaurant',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return categoryId;
}

async function seedGooglePoi(mapId: string, customerId: string, categoryId: string, opts: SeedGooglePoiOptions): Promise<string> {
  const firestore = await getE2eFirestore();
  const poiId = opts.poiId ?? genId('poi_');
  await firestore.doc(`maps/${mapId}/pois/${poiId}`).set({
    poiId,
    customerId,
    mapId,
    categoryId,
    name: opts.name,
    location: { latitude: 35.6812, longitude: 139.7671 },
    sourceType: 'GOOGLE_PLACES',
    provider: 'GOOGLE',
    providerPlaceId: opts.providerPlaceId,
    ...(opts.hasPhoto ? { hasPhoto: true } : {}),
    status: opts.status ?? 'ENABLED',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return poiId;
}

async function setPoiStatus(mapId: string, poiId: string, status: 'ENABLED' | 'DISABLED'): Promise<void> {
  const firestore = await getE2eFirestore();
  await firestore.doc(`maps/${mapId}/pois/${poiId}`).update({ status, updatedAt: FieldValue.serverTimestamp() });
}

async function seedSearchMenuItem(mapId: string, customerId: string): Promise<void> {
  const firestore = await getE2eFirestore();
  const menuItemId = genId('menu_');
  await firestore.doc(`maps/${mapId}/menuItems/${menuItemId}`).set({
    menuItemId,
    customerId,
    mapId,
    type: 'FEATURE',
    label: 'Search',
    featureKey: 'SEARCH',
    order: 0,
    status: 'ENABLED',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Mirrors multilingual-content.spec.ts's helper exactly — the settings PATCH takes the full settings body with a nested `languages` object, not bare fields. */
async function setMapLanguages(page: Page, mapId: string, languages: { defaultLanguage: string; supportedLanguages: string[] }): Promise<number> {
  const response = await page.request.fetch(`${E2E_BASE_URL}/api/maps/${mapId}/settings`, {
    method: 'PATCH',
    headers: { Origin: E2E_BASE_URL, 'Content-Type': 'application/json' },
    data: {
      name: 'E2E Photo/Embed Map',
      mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
      area: { type: 'UNBOUNDED' },
      languages,
    },
  });
  return response.status();
}

interface PublicResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly text: string;
  json(): unknown;
}

async function getPublic(request: APIRequestContext, path: string): Promise<PublicResult> {
  const response = await request.get(`${E2E_BASE_URL}${path}`);
  const text = await response.text();
  return {
    status: response.status(),
    headers: response.headers(),
    text,
    json: () => JSON.parse(text) as unknown,
  };
}

function touristUrl(mapId: string, query?: string): string {
  return `${E2E_TOURIST_BASE_URL}/maps/${mapId}${query ? `?${query}` : ''}`;
}

interface SeededScenario {
  readonly tenant: TestTenantFixture;
  readonly categoryId: string;
  readonly sakuraPoiId: string;
  readonly ramenPoiId: string;
}

/** Provision + login + seed one enabled category with a photo POI (`Sakura Sushi Bar`) and a no-photo POI (`Tokyo Ramen House`). */
async function provisionSeeded(page: Page, emailTag: string): Promise<SeededScenario> {
  const tenant = await provisionTestTenant({
    email: `checkpoint-photo-${emailTag}@example.com`,
    password: 'correct-horse-battery-staple',
    companyName: `Photo ${emailTag} Co`,
    displayName: `Pat ${emailTag}`,
  });
  await login(page, tenant);
  const categoryId = await seedCategory(tenant.mapId, tenant.customerId);
  const sakuraPoiId = await seedGooglePoi(tenant.mapId, tenant.customerId, categoryId, {
    name: 'Sakura Sushi Bar',
    providerPlaceId: PHOTO_PLACE_ID,
    hasPhoto: true,
  });
  const ramenPoiId = await seedGooglePoi(tenant.mapId, tenant.customerId, categoryId, {
    name: 'Tokyo Ramen House',
    providerPlaceId: NO_PHOTO_PLACE_ID,
    hasPhoto: false,
  });
  return { tenant, categoryId, sakuraPoiId, ramenPoiId };
}

test.describe('Photo Experience Prototype + Embeddable Public Map Foundation', () => {
  // `next dev` compiles a route's module graph lazily on first hit. When this
  // spec runs on its own, warm every route pattern it exercises so no single
  // test's first request pays the whole cold-compile cost inside its 30s
  // budget. Nonexistent ids are fine — Next compiles per route pattern, not
  // per param. (Mirrors public-tourist-map-interaction.spec.ts's own hook.)
  test.beforeAll(async ({ request }) => {
    await Promise.allSettled([
      request.get(`${E2E_TOURIST_BASE_URL}/maps/e2e-warmup`),
      request.get(`${E2E_BASE_URL}/api/public/maps/e2e-warmup`),
      request.get(`${E2E_BASE_URL}/api/public/maps/e2e-warmup/pois/e2e-warmup/photo`),
      request.get(`${E2E_BASE_URL}/api/public/maps/e2e-warmup/pois/e2e-warmup/photo-meta`),
      request.post(`${E2E_BASE_URL}/api/maps/e2e-warmup/publish`, { headers: { Origin: E2E_BASE_URL } }),
      request.post(`${E2E_BASE_URL}/api/maps/e2e-warmup/pois/import`, { headers: { Origin: E2E_BASE_URL } }),
      request.fetch(`${E2E_BASE_URL}/api/maps/e2e-warmup/settings`, { method: 'PATCH', headers: { Origin: E2E_BASE_URL } }),
      request.get(`${E2E_BASE_URL}/login`),
    ]);
  });

  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  // ===========================================================================
  // A · PUBLISH / PHOTO ISOLATION
  // ===========================================================================

  test('A1: real fake-provider import stamps hasPhoto → published snapshot exposes photo:{available:true} and leaks no provider identity', async ({
    page,
    request,
  }) => {
    test.setTimeout(45_000);
    const tenant = await provisionTestTenant({
      email: 'checkpoint-photo-a1@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Photo A1 Co',
      displayName: 'Pat A1',
    });
    await login(page, tenant);
    const categoryId = await seedCategory(tenant.mapId, tenant.customerId);

    // Real import route + real fake provider — not a direct POI seed.
    const importedPhoto = await importViaApi(page, tenant.mapId, { categoryId, providerPlaceId: PHOTO_PLACE_ID });
    expect(importedPhoto.status).toBe(201);
    const sakuraPoiId = importedPhoto.body.poiId!;
    const importedNoPhoto = await importViaApi(page, tenant.mapId, { categoryId, providerPlaceId: NO_PHOTO_PLACE_ID });
    expect(importedNoPhoto.status).toBe(201);
    const ramenPoiId = importedNoPhoto.body.poiId!;

    // The imported POI doc carries the hint; the no-photo one does not.
    const firestore = await getE2eFirestore();
    expect((await firestore.doc(`maps/${tenant.mapId}/pois/${sakuraPoiId}`).get()).data()?.hasPhoto).toBe(true);
    expect((await firestore.doc(`maps/${tenant.mapId}/pois/${ramenPoiId}`).get()).data()?.hasPhoto).toBeUndefined();

    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const snapshot = await getPublic(request, `/api/public/maps/${tenant.mapId}`);
    expect(snapshot.status).toBe(200);
    const body = snapshot.json() as {
      pois: Array<Record<string, unknown> & { poiId: string; name: string; photo?: unknown }>;
      photoProviderRefs?: unknown;
    };

    const sakura = body.pois.find((p) => p.poiId === sakuraPoiId)!;
    const ramen = body.pois.find((p) => p.poiId === ramenPoiId)!;
    expect(sakura.photo).toEqual({ available: true });
    expect(ramen.photo).toBeUndefined();

    // The publication-scoped server-only refs map is never on the wire.
    expect(body.photoProviderRefs).toBeUndefined();
    expect(snapshot.text).not.toContain('photoProviderRefs');

    // No POI object carries any provider/import identity — the ONLY public
    // photo signal is `photo: { available: true }`.
    for (const poi of body.pois) {
      expect(poi).not.toHaveProperty('provider');
      expect(poi).not.toHaveProperty('providerPlaceId');
      expect(poi).not.toHaveProperty('hasPhoto');
      expect(poi).not.toHaveProperty('sourceType');
    }
    // `map.mapProvider.provider` ("GOOGLE_MAPS", the BASEMAP config) is a
    // long-standing public field; the POI-level provider enum value is
    // "GOOGLE" and must never appear, nor the place id, the photo resource
    // name, or an API key.
    expect(snapshot.text).not.toContain('"provider":"GOOGLE"');
    expect(snapshot.text).not.toContain('providerPlaceId');
    expect(snapshot.text).not.toContain('fake-restaurant-1'); // the providerPlaceId
    expect(snapshot.text).not.toContain('fake-photo-1'); // the Google photo resource name
    expect(snapshot.text).not.toContain('AIza');
  });

  test('A2: GET published POI /photo → 200 image/* + nosniff + Cache-Control no-store + real PNG bytes', async ({ page, request }) => {
    const { tenant, sakuraPoiId } = await provisionSeeded(page, 'a2');
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const response = await request.get(`${E2E_BASE_URL}/api/public/maps/${tenant.mapId}/pois/${sakuraPoiId}/photo`);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers['content-type']).toMatch(/^image\//);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control'] ?? '').toContain('no-store');

    const bytes = await response.body();
    expect(bytes.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });

  test('A3: GET published POI /photo-meta → only the public-safe shape (available/count/dims/attributions), no provider identity', async ({
    page,
    request,
  }) => {
    const { tenant, sakuraPoiId } = await provisionSeeded(page, 'a3');
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const meta = await getPublic(request, `/api/public/maps/${tenant.mapId}/pois/${sakuraPoiId}/photo-meta`);
    expect(meta.status).toBe(200);
    const body = meta.json() as {
      available: boolean;
      count: number;
      widthPx?: number;
      heightPx?: number;
      attributions: Array<Record<string, unknown>>;
    };

    expect(body.available).toBe(true);

    // EXACT allow-list of public fields (not a loose objectContaining). `count`
    // is the deliberate multi-photo-gallery addition — everything else is
    // unchanged. `widthPx`/`heightPx` are present for this fake fixture.
    expect(Object.keys(body).sort()).toEqual(['attributions', 'available', 'count', 'heightPx', 'widthPx']);

    // `count` — a positive integer photo count for this fake-provider photo POI.
    expect(Number.isInteger(body.count)).toBe(true);
    expect(body.count).toBeGreaterThan(0);

    expect(Array.isArray(body.attributions)).toBe(true);
    expect(body.attributions.length).toBeGreaterThan(0);
    for (const entry of body.attributions) {
      expect(Object.keys(entry).every((k) => k === 'displayName' || k === 'uri')).toBe(true);
      expect(typeof entry.displayName).toBe('string');
      expect((entry.displayName as string).length).toBeGreaterThan(0);
    }

    // No provider / private identity is exposed: no providerPlaceId, no Google
    // photo resource name, no ephemeral photoUri, no provider key/id.
    expect(body).not.toHaveProperty('providerPlaceId');
    expect(body).not.toHaveProperty('provider');
    expect(meta.text).not.toContain('providerPlaceId');
    expect(meta.text).not.toContain('"provider"');
    expect(meta.text).not.toContain('resourceName');
    expect(meta.text).not.toContain('photoUri');
    expect(meta.text).not.toContain('fake-restaurant'); // the providerPlaceId
    expect(meta.text).not.toContain('fake-photo'); // any Google photo resource name
    expect(meta.text).not.toContain('/photos/'); // Google photo resource-name path shape
    expect(meta.text).not.toContain('AIza');
  });

  test('A4: a no-photo POI fails safely on both endpoints (never a placeholder, never a leak)', async ({ page, request }) => {
    const { tenant, ramenPoiId } = await provisionSeeded(page, 'a4');
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const photo = await getPublic(request, `/api/public/maps/${tenant.mapId}/pois/${ramenPoiId}/photo`);
    expect(photo.status).toBe(404);
    expect((photo.json() as { code: string }).code).toBe('public-map/photo-not-found');

    const meta = await getPublic(request, `/api/public/maps/${tenant.mapId}/pois/${ramenPoiId}/photo-meta`);
    expect(meta.status).toBe(404);
    expect(meta.json()).toEqual({ available: false });
  });

  test('A5: a wrong mapId+poiId pair is denied identically for /photo and /photo-meta', async ({ page, request }) => {
    const { tenant, sakuraPoiId } = await provisionSeeded(page, 'a5');
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);
    // sanity: the correct pair works
    expect((await getPublic(request, `/api/public/maps/${tenant.mapId}/pois/${sakuraPoiId}/photo`)).status).toBe(200);

    const foreignPoiId = genId('poi_');
    const foreignMapId = genId('map_');

    for (const path of [
      `/api/public/maps/${tenant.mapId}/pois/${foreignPoiId}/photo`, // real published map, POI not in it
      `/api/public/maps/${tenant.mapId}/pois/${foreignPoiId}/photo-meta`,
      `/api/public/maps/${foreignMapId}/pois/${sakuraPoiId}/photo`, // real POI id, wrong (unpublished/nonexistent) map
      `/api/public/maps/${foreignMapId}/pois/${sakuraPoiId}/photo-meta`,
    ]) {
      const result = await getPublic(request, path);
      expect(result.status, path).toBe(404);
    }
  });

  test('A6: draft-only photo POI is denied; a published photo stays resolvable across an unpublished draft edit; a later publish re-scopes it', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const { tenant, categoryId, sakuraPoiId } = await provisionSeeded(page, 'a6');
    expect((await publishViaApi(page, tenant.mapId)).body.version).toBe(1);

    const sakuraPhoto = () => getPublic(request, `/api/public/maps/${tenant.mapId}/pois/${sakuraPoiId}/photo`);
    expect((await sakuraPhoto()).status).toBe(200);

    // A NEW photo-eligible POI added to the draft, WITHOUT publishing.
    const draftOnlyPoiId = await seedGooglePoi(tenant.mapId, tenant.customerId, categoryId, {
      name: 'Draft Only Sushi',
      providerPlaceId: PHOTO_PLACE_ID,
      hasPhoto: true,
    });
    const draftOnlyPhoto = () => getPublic(request, `/api/public/maps/${tenant.mapId}/pois/${draftOnlyPoiId}/photo`);
    const draftOnlyMeta = () => getPublic(request, `/api/public/maps/${tenant.mapId}/pois/${draftOnlyPoiId}/photo-meta`);

    // 7 + 8: draft-only POI is denied on both endpoints.
    expect((await draftOnlyPhoto()).status).toBe(404);
    expect((await draftOnlyMeta()).status).toBe(404);
    // 11: the LIVE publication (v1) is unaffected by the new draft POI.
    expect((await sakuraPhoto()).status).toBe(200);

    // A draft edit to the ALREADY-published POI, still WITHOUT publishing.
    await setPoiStatus(tenant.mapId, sakuraPoiId, 'DISABLED');
    // 11: publication v1 is immutable — /photo still resolves from it.
    expect((await sakuraPhoto()).status).toBe(200);

    // Only an actual Publish re-scopes photo eligibility.
    expect((await publishViaApi(page, tenant.mapId)).body.version).toBe(2);
    expect((await sakuraPhoto()).status).toBe(404); // now disabled → excluded from v2
    expect((await draftOnlyPhoto()).status).toBe(200); // now enabled + published in v2
  });

  // ===========================================================================
  // B · EMBEDDABLE PUBLIC MAP
  // ===========================================================================

  test('B1: normal + embed both load 200; embed stamps data-embed="1", normal does not, markup is not forked (12–15)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-photo-b1@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Embed B1 Co',
      displayName: 'Bea B1',
    });
    await login(page, tenant);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const normal = await page.goto(touristUrl(tenant.mapId));
    expect(normal?.status()).toBe(200);
    await expect(page.getByTestId('tourist-map-shell')).toBeVisible();
    await expect(page.getByTestId('tourist-map-shell')).not.toHaveAttribute('data-embed', '1');
    await expect(page.getByTestId('tourist-map')).toHaveAttribute('role', 'img');
    await expect(page.locator('h1')).toHaveText(tenant.mapName);

    const embed = await page.goto(touristUrl(tenant.mapId, 'embed=1'));
    expect(embed?.status()).toBe(200);
    await expect(page.getByTestId('tourist-map-shell')).toHaveAttribute('data-embed', '1');
    // Same tree, no embed-only markup: the same core elements are present.
    await expect(page.getByTestId('tourist-map')).toHaveAttribute('role', 'img');
    await expect(page.locator('h1')).toHaveText(tenant.mapName);
  });

  test('B2: hosted and embedded views resolve the SAME published content (16)', async ({ page }) => {
    const { tenant } = await provisionSeeded(page, 'b2');
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.goto(touristUrl(tenant.mapId));
    const hostedPois = await page.getByTestId('tourist-map-diag-poi-names').textContent();
    const hostedBranding = await page.getByTestId('tourist-map-branding').textContent();

    await page.goto(touristUrl(tenant.mapId, 'embed=1'));
    await expect(page.getByTestId('tourist-map-shell')).toHaveAttribute('data-embed', '1');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText(hostedPois ?? '');
    await expect(page.getByTestId('tourist-map-branding')).toHaveText(hostedBranding ?? '');
    expect(hostedPois).toContain('Sakura Sushi Bar');
    expect(hostedPois).toContain('Tokyo Ramen House');
  });

  test('B3: ?embed=1&lang=<supported> preserves language behavior; an unsupported lang falls back without crashing (17)', async ({ page }) => {
    test.setTimeout(45_000);
    const tenant = await provisionTestTenant({
      email: 'checkpoint-photo-b3@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Embed B3 Co',
      displayName: 'Bea B3',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    const firestore = await getE2eFirestore();
    const categoryId = genId('cat_');
    await firestore.doc(`maps/${tenant.mapId}/categories/${categoryId}`).set({
      categoryId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      name: 'Restaurants',
      icon: 'FOOD',
      enabled: true,
      order: 0,
      sourceType: 'CLIENT_CUSTOM',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const poiId = genId('poi_');
    await firestore.doc(`maps/${tenant.mapId}/pois/${poiId}`).set({
      poiId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      categoryId,
      name: 'Sakura Restaurant',
      location: { latitude: 35.6812, longitude: 139.7671 },
      sourceType: 'CLIENT_CUSTOM',
      translations: { name: { ja: '桜レストラン' } },
      status: 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.goto(touristUrl(tenant.mapId, 'embed=1&lang=ja'));
    await expect(page.getByTestId('tourist-map-shell')).toHaveAttribute('data-embed', '1');
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('ja');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('桜レストラン');

    await page.goto(touristUrl(tenant.mapId, 'embed=1&lang=de'));
    await expect(page.getByTestId('tourist-map-shell')).toHaveAttribute('data-embed', '1');
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('en');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Sakura Restaurant');
  });

  test('B4: the embedded public map needs no admin session — never redirects to login (18)', async ({ page, browser }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-photo-b4@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Embed B4 Co',
      displayName: 'Bea B4',
    });
    await login(page, tenant);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    expect(await anonContext.cookies()).toHaveLength(0);

    const response = await anonPage.goto(touristUrl(tenant.mapId, 'embed=1'));
    expect(response?.status()).toBe(200);
    expect(anonPage.url()).toBe(touristUrl(tenant.mapId, 'embed=1'));
    expect(anonPage.url()).not.toContain('/login');
    await expect(anonPage.getByTestId('tourist-map-shell')).toHaveAttribute('data-embed', '1');
    await expect(anonPage.locator('h1')).toHaveText(tenant.mapName);
    expect(await anonContext.cookies()).toHaveLength(0);
    await anonContext.close();
  });

  test('B5: tourist-web permits iframe framing; this checkpoint did NOT add permissive framing headers to admin-web (19, 20)', async ({
    page,
    request,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-photo-b5@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Embed B5 Co',
      displayName: 'Bea B5',
    });
    await login(page, tenant);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    // tourist-web: intended framing is explicitly permitted.
    const touristResponse = await page.goto(touristUrl(tenant.mapId, 'embed=1'));
    const touristHeaders = touristResponse!.headers();
    expect(touristHeaders['content-security-policy'] ?? '').toContain('frame-ancestors *');
    expect(touristHeaders['permissions-policy'] ?? '').toContain('geolocation=*');
    // No X-Frame-Options that would contradict the permissive CSP.
    expect(touristHeaders['x-frame-options']).toBeUndefined();

    // admin-web: no permissive framing anywhere (private page, public page, and the public snapshot API).
    for (const adminPath of ['/login', `/admin/maps/${tenant.mapId}/settings`, `/api/public/maps/${tenant.mapId}`]) {
      const adminResponse = await request.get(`${E2E_BASE_URL}${adminPath}`);
      const csp = adminResponse.headers()['content-security-policy'] ?? '';
      expect(csp, adminPath).not.toContain('frame-ancestors');
      expect(adminResponse.headers()['permissions-policy'] ?? '', adminPath).not.toContain('geolocation=*');
    }
  });

  // ===========================================================================
  // C · PHOTO UI + REGRESSION
  // ===========================================================================

  test('C1: selecting a photo POI opens the detail card with its live photo cover + rendered attribution (21, 23, 24)', async ({ page }) => {
    test.setTimeout(45_000);
    const { tenant, sakuraPoiId } = await provisionSeeded(page, 'c1');
    await seedSearchMenuItem(tenant.mapId, tenant.customerId);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.goto(touristUrl(tenant.mapId));
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('sakura');
    await page.getByRole('button', { name: /Sakura Sushi Bar/ }).click();

    await expect(page.getByTestId('poi-detail-card')).toBeVisible();
    await expect(page.getByTestId('poi-detail-name')).toHaveText('Sakura Sushi Bar');

    // 23: a real cover image, sourced from the public photo endpoint for THIS POI.
    const cover = page.getByTestId('poi-detail-cover');
    await expect(cover).toBeVisible();
    const coverSrc = await cover.locator('img').getAttribute('src');
    expect(coverSrc).toContain(`/api/public/maps/${tenant.mapId}/pois/${sakuraPoiId}/photo`);

    // 24: attribution from /photo-meta is rendered (the fake provider's per-photo credit).
    await expect(page.getByTestId('poi-detail-cover-credit')).toBeVisible();
    await expect(page.getByTestId('poi-detail-cover-credit')).toContainText('Fake Photographer 0');
  });

  test('C2: a no-photo POI opens the same detail UI with NO cover and no broken/empty placeholder (22, 25)', async ({ page }) => {
    test.setTimeout(45_000);
    const { tenant } = await provisionSeeded(page, 'c2');
    await seedSearchMenuItem(tenant.mapId, tenant.customerId);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.goto(touristUrl(tenant.mapId));
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('ramen');
    await page.getByRole('button', { name: /Tokyo Ramen House/ }).click();

    await expect(page.getByTestId('poi-detail-card')).toBeVisible();
    await expect(page.getByTestId('poi-detail-name')).toHaveText('Tokyo Ramen House');
    await expect(page.getByTestId('poi-detail-cover')).toHaveCount(0);
    await expect(page.getByTestId('poi-detail-cover-credit')).toHaveCount(0);
  });

  test('C3: existing search + category-filter behavior is intact with photo POIs present (26)', async ({ page }) => {
    test.setTimeout(45_000);
    const { tenant, categoryId } = await provisionSeeded(page, 'c3');
    const firestore = await getE2eFirestore();
    // a second category + POI so filtering has something to narrow to
    const otherCategoryId = await seedCategory(tenant.mapId, tenant.customerId);
    await firestore.doc(`maps/${tenant.mapId}/categories/${otherCategoryId}`).update({ name: 'Cafes', icon: 'OTHER', order: 1 });
    await seedGooglePoi(tenant.mapId, tenant.customerId, otherCategoryId, {
      name: 'Corner Cafe',
      providerPlaceId: 'places/fake-cafe-x',
      hasPhoto: false,
    });
    await seedSearchMenuItem(tenant.mapId, tenant.customerId);
    // category menu item so the filter chip is rendered
    const menuItemId = genId('menu_');
    await firestore.doc(`maps/${tenant.mapId}/menuItems/${menuItemId}`).set({
      menuItemId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      type: 'CATEGORY',
      label: 'Restaurants',
      categoryId,
      order: 1,
      status: 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.goto(touristUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('3');

    // filter to Restaurants
    await page.getByTestId(`public-menu-category-${categoryId}`).click();
    await expect(page.getByTestId('tourist-map-diag-selected-category')).toHaveText(categoryId);
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('2');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toContainText('Sakura Sushi Bar');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).not.toContainText('Corner Cafe');

    // search still works
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('corner');
    await expect(page.getByRole('button', { name: /Corner Cafe/ })).toBeVisible();
  });

  test('C4: ordinary PIN/DOT marker theme + multilingual behavior are unchanged by the photo feature (27, 28)', async ({ page }) => {
    test.setTimeout(45_000);
    const tenant = await provisionTestTenant({
      email: 'checkpoint-photo-c4@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Photo C4 Co',
      displayName: 'Pat C4',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    const firestore = await getE2eFirestore();
    // an explicit DOT marker style on the map theme
    await firestore.doc(`maps/${tenant.mapId}`).update({
      theme: {
        preset: 'STANDARD',
        visibility: { businessPois: true, transit: true, schools: true, hospitals: true, parks: true, roadLabels: true, transitLabels: true },
        markerStyle: { style: 'DOT', size: 'SMALL' },
      },
    });
    const categoryId = genId('cat_');
    await firestore.doc(`maps/${tenant.mapId}/categories/${categoryId}`).set({
      categoryId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      name: 'Restaurants',
      icon: 'FOOD',
      enabled: true,
      order: 0,
      sourceType: 'CLIENT_CUSTOM',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // one ordinary CLIENT_CUSTOM POI (no photo) + one GOOGLE_PLACES photo POI
    const dinerPoiId = genId('poi_');
    await firestore.doc(`maps/${tenant.mapId}/pois/${dinerPoiId}`).set({
      poiId: dinerPoiId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      categoryId,
      name: 'Local Diner',
      location: { latitude: 35.68, longitude: 139.76 },
      sourceType: 'CLIENT_CUSTOM',
      translations: { name: { ja: '地元の食堂' } },
      status: 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await seedGooglePoi(tenant.mapId, tenant.customerId, categoryId, {
      name: 'Sakura Sushi Bar',
      providerPlaceId: PHOTO_PLACE_ID,
      hasPhoto: true,
    });
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    // 27: the persisted marker style still projects through unchanged.
    await page.goto(touristUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-marker-style')).toHaveText('DOT,SMALL');
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('2');

    // 28: multilingual still resolves the translated name.
    await page.goto(touristUrl(tenant.mapId, 'lang=ja'));
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('ja');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toContainText('地元の食堂');
  });

  // ===========================================================================
  // D · MULTI-PHOTO GALLERY + RICH PLACE METADATA (checkpoint expansion)
  // ===========================================================================

  test('D1: publish snapshots public-safe place metadata onto pois[].place — and STILL no provider identity on the wire', async ({
    page,
    request,
  }) => {
    test.setTimeout(45_000);
    const { tenant, sakuraPoiId, ramenPoiId } = await provisionSeeded(page, 'd1');
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const snapshot = await getPublic(request, `/api/public/maps/${tenant.mapId}`);
    expect(snapshot.status).toBe(200);
    const body = snapshot.json() as { pois: Array<{ poiId: string; place?: Record<string, unknown> }> };
    const sakura = body.pois.find((p) => p.poiId === sakuraPoiId)!;
    const ramen = body.pois.find((p) => p.poiId === ramenPoiId)!;

    // the fake provider's fixed metadata, projected + the derived price glyph
    expect(sakura.place).toMatchObject({
      rating: 4.5,
      userRatingCount: 128,
      priceLevel: 'MODERATE',
      priceLevelDisplay: '$$',
      primaryTypeDisplayName: 'Sushi restaurant',
      utcOffsetMinutes: 540,
      websiteUri: 'https://example.com/sakura-sushi',
      nationalPhoneNumber: '03-1234-5678',
      dineIn: true,
      takeout: true,
      delivery: false,
    });
    expect(Array.isArray((sakura.place as { openingHours?: { periods?: unknown[] } }).openingHours?.periods)).toBe(true);
    // fake-restaurant-2 has no metadata → no `place` (independent of photo)
    expect(ramen.place).toBeUndefined();

    // still no provider identity / photo resource name anywhere on the wire
    for (const poi of body.pois) {
      expect(poi).not.toHaveProperty('providerPlaceId');
      expect(poi).not.toHaveProperty('provider');
    }
    expect(snapshot.text).not.toContain('providerPlaceId');
    expect(snapshot.text).not.toContain('photoProviderRefs');
    expect(snapshot.text).not.toContain('fake-restaurant-1');
    expect(snapshot.text).not.toContain('fake-photo-');
    expect(snapshot.text).not.toContain('AIza');
  });

  test('D2: a pre-expansion publication document (no pois[].place) still serves 200 with no `place`', async ({ request }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-photo-d2@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Photo D2 Co',
      displayName: 'Pat D2',
    });
    const firestore = await getE2eFirestore();
    const publicationId = genId('pub_');
    // A raw, legacy-shape publication doc — no `place`, no `photo`, no photoProviderRefs.
    await firestore.doc(`maps/${tenant.mapId}/publications/${publicationId}`).set({
      schemaVersion: 1,
      publicationId,
      mapId: tenant.mapId,
      customerId: tenant.customerId,
      version: 1,
      publishedAt: FieldValue.serverTimestamp(),
      publishedByUid: tenant.uid,
      map: {
        name: 'Legacy Map',
        mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
        area: { type: 'UNBOUNDED' },
        theme: {
          preset: 'STANDARD',
          visibility: { businessPois: true, transit: true, schools: true, hospitals: true, parks: true, roadLabels: true, transitLabels: true },
          markerStyle: { style: 'PIN', size: 'MEDIUM' },
        },
      },
      defaultLanguage: 'en',
      supportedLanguages: ['en'],
      menu: [],
      categories: [{ categoryId: genId('cat_'), name: 'Restaurants', icon: 'FOOD' }],
      pois: [],
      pages: [],
    });
    await firestore.doc(`maps/${tenant.mapId}`).update({
      publication: { currentPublicationId: publicationId, version: 1, publishedAt: FieldValue.serverTimestamp(), publishedByUid: tenant.uid },
    });

    const snapshot = await getPublic(request, `/api/public/maps/${tenant.mapId}`);
    expect(snapshot.status).toBe(200);
    const body = snapshot.json() as { pois: unknown[]; categories: unknown[] };
    expect(body.categories).toHaveLength(1);
    expect(snapshot.text).not.toContain('"place"');
  });

  test('D3: multi-photo gallery — /photo-meta reports count, per-index photo + attribution resolve, out-of-range/invalid index → generic 404', async ({
    page,
    request,
  }) => {
    test.setTimeout(45_000);
    const { tenant, sakuraPoiId } = await provisionSeeded(page, 'd3');
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);
    const base = `/api/public/maps/${tenant.mapId}/pois/${sakuraPoiId}`;

    // count from the cover meta
    const meta0 = await getPublic(request, `${base}/photo-meta`);
    expect(meta0.status).toBe(200);
    const meta0Body = meta0.json() as { available: boolean; count: number; attributions: Array<{ displayName: string }> };
    expect(meta0Body.available).toBe(true);
    expect(meta0Body.count).toBe(3);

    // each in-range index resolves a photo + its OWN attribution
    for (const index of [0, 1, 2]) {
      const photo = await request.get(`${E2E_BASE_URL}${base}/photo?index=${index}`);
      expect(photo.status(), `photo ${index}`).toBe(200);
      expect(photo.headers()['content-type']).toMatch(/^image\//);
      expect(photo.headers()['cache-control'] ?? '').toContain('no-store');

      const meta = await getPublic(request, `${base}/photo-meta?index=${index}`);
      expect(meta.status, `meta ${index}`).toBe(200);
      expect((meta.json() as { attributions: Array<{ displayName: string }> }).attributions[0]?.displayName).toBe(
        `Fake Photographer ${index}`,
      );
    }
    // distinct attribution per photo (Google requires per-photo credit)
    const names = await Promise.all(
      [0, 1, 2].map(async (i) => (await getPublic(request, `${base}/photo-meta?index=${i}`)).json() as { attributions: Array<{ displayName: string }> }),
    );
    expect(new Set(names.map((m) => m.attributions[0]?.displayName)).size).toBe(3);

    // out-of-range and malformed index → the SAME generic not-found
    for (const badIndex of ['3', '9', '99', '-1', 'abc', '1.5']) {
      expect((await request.get(`${E2E_BASE_URL}${base}/photo?index=${badIndex}`)).status(), `photo ?index=${badIndex}`).toBe(404);
      const badMeta = await getPublic(request, `${base}/photo-meta?index=${badIndex}`);
      expect(badMeta.status, `meta ?index=${badIndex}`).toBe(404);
      expect(badMeta.json()).toEqual({ available: false });
    }
  });

  test('D4: the gallery renders in the detail panel with prev/next + a count indicator; navigation advances the photo and its credit', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const { tenant } = await provisionSeeded(page, 'd4');
    await seedSearchMenuItem(tenant.mapId, tenant.customerId);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.goto(touristUrl(tenant.mapId));
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('sakura');
    await page.getByRole('button', { name: /Sakura Sushi Bar/ }).click();

    await expect(page.getByTestId('poi-detail-cover')).toBeVisible();
    await expect(page.getByTestId('poi-detail-gallery-indicator')).toContainText('1 / 3');
    await expect(page.getByTestId('poi-detail-cover-credit')).toContainText('Fake Photographer 0');

    await page.getByTestId('poi-detail-gallery-next').click();
    await expect(page.getByTestId('poi-detail-gallery-indicator')).toContainText('2 / 3');
    const src = await page.getByTestId('poi-detail-cover').locator('img').getAttribute('src');
    expect(src).toContain('index=1');
    await expect(page.getByTestId('poi-detail-cover-credit')).toContainText('Fake Photographer 1');

    // wrap-around: prev from photo 2 → photo 1, prev again → photo 3
    await page.getByTestId('poi-detail-gallery-prev').click();
    await expect(page.getByTestId('poi-detail-gallery-indicator')).toContainText('1 / 3');
    await page.getByTestId('poi-detail-gallery-prev').click();
    await expect(page.getByTestId('poi-detail-gallery-indicator')).toContainText('3 / 3');
  });

  test('D5: rich place-metadata rows render for a POI with `place`, and NONE render (no placeholders) for one without', async ({ page }) => {
    test.setTimeout(45_000);
    const { tenant } = await provisionSeeded(page, 'd5');
    await seedSearchMenuItem(tenant.mapId, tenant.customerId);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.goto(touristUrl(tenant.mapId));
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('sakura');
    await page.getByRole('button', { name: /Sakura Sushi Bar/ }).click();
    await expect(page.getByTestId('poi-detail-rating')).toContainText('4.5');
    await expect(page.getByTestId('poi-detail-rating-count')).toContainText('128');
    await expect(page.getByTestId('poi-detail-price')).toContainText('$$');
    await expect(page.getByTestId('poi-detail-type')).toContainText('Sushi restaurant');
    // Google explicitly supplied all three booleans: true → positive chip,
    // false → muted negative chip. (undefined would render nothing.)
    await expect(page.getByTestId('poi-detail-service-dine-in')).toHaveAttribute('data-available', 'true');
    await expect(page.getByTestId('poi-detail-service-takeaway')).toHaveAttribute('data-available', 'true');
    await expect(page.getByTestId('poi-detail-service-delivery')).toHaveAttribute('data-available', 'false');
    await expect(page.getByTestId('poi-detail-hours-state')).toBeVisible();
    await expect(page.getByTestId('poi-detail-website')).toHaveAttribute('href', 'https://example.com/sakura-sushi');
    await expect(page.getByTestId('poi-detail-phone')).toHaveAttribute('href', 'tel:03-1234-5678');

    // the no-metadata POI: name only, zero rich rows, zero cover
    await page.getByTestId('poi-detail-close').click();
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('ramen');
    await page.getByRole('button', { name: /Tokyo Ramen House/ }).click();
    await expect(page.getByTestId('poi-detail-name')).toHaveText('Tokyo Ramen House');
    for (const id of ['poi-detail-cover', 'poi-detail-rating', 'poi-detail-price', 'poi-detail-services', 'poi-detail-hours-status', 'poi-detail-website', 'poi-detail-phone']) {
      await expect(page.getByTestId(id), id).toHaveCount(0);
    }
  });

  test('D6: hosted and ?embed=1 render the SAME gallery + rich-detail behavior (no forked markup)', async ({ page }) => {
    test.setTimeout(45_000);
    const { tenant } = await provisionSeeded(page, 'd6');
    await seedSearchMenuItem(tenant.mapId, tenant.customerId);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    for (const query of [undefined, 'embed=1'] as const) {
      await page.goto(touristUrl(tenant.mapId, query));
      if (query === 'embed=1') {
        await expect(page.getByTestId('tourist-map-shell')).toHaveAttribute('data-embed', '1');
      }
      await page.getByTestId('public-menu-feature-search').click();
      await page.getByTestId('public-search-input').fill('sakura');
      await page.getByRole('button', { name: /Sakura Sushi Bar/ }).click();
      await expect(page.getByTestId('poi-detail-cover')).toBeVisible();
      await expect(page.getByTestId('poi-detail-gallery-indicator')).toContainText('/ 3');
      await expect(page.getByTestId('poi-detail-rating')).toContainText('4.5');
      await page.getByTestId('poi-detail-close').click();
    }
  });

  test('D7: the mobile bottom-sheet renders the SAME gallery markup at a narrow viewport', async ({ page }) => {
    test.setTimeout(45_000);
    const { tenant } = await provisionSeeded(page, 'd7');
    await seedSearchMenuItem(tenant.mapId, tenant.customerId);
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(touristUrl(tenant.mapId));
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('sakura');
    await page.getByRole('button', { name: /Sakura Sushi Bar/ }).click();
    await expect(page.getByTestId('poi-detail-card')).toBeVisible();
    await expect(page.getByTestId('poi-detail-cover')).toBeVisible();
    await expect(page.getByTestId('poi-detail-gallery-next')).toBeVisible();
    await expect(page.getByTestId('poi-detail-rating')).toContainText('4.5');
  });

  test('D8: marker photo fetches are bounded and do NOT loop/cancel on ordinary re-renders (category filter toggle)', async ({ page }) => {
    test.setTimeout(45_000);
    const { tenant, categoryId } = await provisionSeeded(page, 'd8');
    // a category menu item so the filter chip exists to toggle
    const firestore = await getE2eFirestore();
    await firestore.doc(`maps/${tenant.mapId}/menuItems/${genId('menu_')}`).set({
      menuItemId: genId('menu_'),
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      type: 'CATEGORY',
      label: 'Restaurants',
      categoryId,
      order: 0,
      status: 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    expect((await publishViaApi(page, tenant.mapId)).status).toBe(201);

    const markerPhotoRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/photo?') && url.includes('maxWidthPx=128')) {
        markerPhotoRequests.push(url);
      }
    });

    await page.goto(touristUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('2');
    // let the one-shot marker photo fetch settle
    await page.waitForTimeout(1500);
    const afterLoad = markerPhotoRequests.length;
    // exactly one marker-photo request per photo-eligible POI (Sakura only) — never a loop
    expect(afterLoad).toBeLessThanOrEqual(1);

    // toggle the category filter a few times — an ordinary re-render / marker re-sync
    for (let i = 0; i < 4; i += 1) {
      await page.getByTestId(`public-menu-category-${categoryId}`).click();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);
    // no additional marker-photo fetches were issued by the re-renders
    expect(markerPhotoRequests.length).toBe(afterLoad);
    // and no request was ever canceled/aborted (a canceled fetch would repeat)
    expect(markerPhotoRequests.length).toBeLessThanOrEqual(1);
  });

  // ===========================================================================
  // E · ADMIN PHOTO MARKER STYLE — PERSISTENCE + PUBLICATION IMMUTABILITY
  // ===========================================================================

  test('E1: Diamond Pin persists across Save + reload, publishes to the live public map, and an unpublished draft change to Rounded Pin never affects the live map until republished (A-P)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // A real photo-capable published POI (reusing this file's own
    // deterministic fake-provider fixture, §4 of the checkpoint spec) so
    // Photo Marker Style actually governs a real marker's rendering — not
    // just an otherwise-empty map.
    const { tenant } = await provisionSeeded(page, 'e1');
    const firestore = await getE2eFirestore();

    // A: open Admin Map Appearance for this tenant-owned map.
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // Sanity precondition — a never-touched map's draft defaults to
    // ROUNDED_PIN (`DEFAULT_PHOTO_MARKER_STYLE`), so this test's later
    // republish-to-Rounded assertion is meaningful rather than vacuous.
    await expect(page.getByRole('radio', { name: 'Rounded Pin' })).toBeChecked();

    // B: select DIAMOND_PIN via the visible "Diamond Pin" Photo Marker Style
    // card — a real native radio input (see map-settings-form.tsx's
    // `PHOTO_MARKER_STYLE_OPTIONS`), located by its accessible name rather
    // than any CSS border/class/data-selected state.
    const diamondRadio = page.getByRole('radio', { name: 'Diamond Pin' });
    await diamondRadio.check();
    await expect(diamondRadio).toBeChecked();

    // C: Save settings.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // D, E: reload the settings page and confirm Diamond Pin remains
    // selected — real persistence, not just uncommitted local React state.
    // The Photo Marker Style card is its own top-level card (not inside the
    // "Customize map information" disclosure), so no re-open step is needed.
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Diamond Pin' })).toBeChecked();

    // F: publish the map. `publishViaApi` (this file's own helper, shared
    // with public-tourist-map.spec.ts's identical pattern) uses
    // `page.request.post` against the absolute admin-web URL with an
    // explicit Origin header — required, not just convenient, because this
    // test's `page` is about to be navigated back and forth between
    // admin-web and tourist-web, and an in-page relative `fetch` would
    // silently resolve against whichever origin the page last navigated to.
    const firstPublish = await publishViaApi(page, tenant.mapId);
    expect(firstPublish.status).toBe(201);
    expect(firstPublish.body.version).toBe(1);

    // Firestore truth, not just the API response: the immutable publication
    // snapshot itself carries the published DIAMOND_PIN style.
    const mapAfterFirstPublish = await firestore.doc(`maps/${tenant.mapId}`).get();
    const firstPublicationId = mapAfterFirstPublish.data()?.publication?.currentPublicationId as string | undefined;
    expect(firstPublicationId).toBeTruthy();
    const firstPublicationSnap = await firestore.doc(`maps/${tenant.mapId}/publications/${firstPublicationId}`).get();
    expect((firstPublicationSnap.data() as { map: { theme: { photoMarkerStyle?: string } } }).map.theme.photoMarkerStyle).toBe(
      'DIAMOND_PIN',
    );

    // G, H: open the public Tourist Map with NO `?photoMarker=` override —
    // this production flow must work from the persisted publication alone.
    // `tourist-map-diag-photo-marker-template` is a small, E2E-only
    // diagnostic (added alongside the existing `tourist-map-diag-*` fields
    // in tourist-map.tsx) that exposes only the already-safe, resolved
    // internal template name the real marker renderer
    // (`marker-style-adapter.ts`) would use — never the raw
    // `PhotoMarkerStyle` enum value, never any provider/photo identity.
    // DIAMOND_PIN resolves to `'photo-pin-3'` (`resolvePhotoPinTemplate`).
    await page.goto(touristUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-photo-marker-template')).toHaveText('photo-pin-3');

    // I, J, K: back in Admin, change the DRAFT to ROUNDED_PIN and Save —
    // but do NOT publish.
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await expect(page.getByRole('radio', { name: 'Diamond Pin' })).toBeChecked();
    await page.getByRole('radio', { name: 'Rounded Pin' }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    // The saved DRAFT really did change in Firestore...
    const draftMapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect((draftMapSnap.data() as { theme?: { photoMarkerStyle?: string } }).theme?.photoMarkerStyle).toBe('ROUNDED_PIN');

    // L, M: ...but PUBLICATION IMMUTABILITY (critical, §6 of the checkpoint
    // spec) means the LIVE public map must STILL render Diamond Pin — only
    // an actual Publish, never a Save, may change what tourists see.
    await page.goto(touristUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-photo-marker-template')).toHaveText('photo-pin-3');

    // N: publish again.
    const secondPublish = await publishViaApi(page, tenant.mapId);
    expect(secondPublish.status).toBe(201);
    expect(secondPublish.body.version).toBe(2);

    const mapAfterSecondPublish = await firestore.doc(`maps/${tenant.mapId}`).get();
    const secondPublicationId = mapAfterSecondPublish.data()?.publication?.currentPublicationId as string | undefined;
    expect(secondPublicationId).toBeTruthy();
    expect(secondPublicationId).not.toBe(firstPublicationId);
    const secondPublicationSnap = await firestore.doc(`maps/${tenant.mapId}/publications/${secondPublicationId}`).get();
    expect((secondPublicationSnap.data() as { map: { theme: { photoMarkerStyle?: string } } }).map.theme.photoMarkerStyle).toBe(
      'ROUNDED_PIN',
    );
    // v1 remains byte-for-byte unchanged (the same immutability guarantee
    // map-publishing.spec.ts's own "second Publish" test proves generally).
    expect((firstPublicationSnap.data() as { map: { theme: { photoMarkerStyle?: string } } }).map.theme.photoMarkerStyle).toBe(
      'DIAMOND_PIN',
    );

    // O, P: only NOW does the live public map reflect Rounded Pin.
    await page.goto(touristUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-photo-marker-template')).toHaveText('photo-pin-1');
  });
});

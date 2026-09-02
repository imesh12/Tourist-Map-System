import { expect, test, type Page } from '@playwright/test';
import type { PublicationMenuItem } from 'shared-types';
import { E2E_BASE_URL, E2E_TOURIST_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionAdditionalMap, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/** A parsed JSON response body from any of admin-web's mutation routes —every route returns a plain JSON object (`{ ok, categoryId }`, `{ code, message }`, etc.), so `Record<string, unknown>` is precise enough for this suite's own assertions without resorting to `any`; call sites narrow individual fields with a targeted `as string` where the value is then used as an id. */
type JsonRecord = Record<string, unknown>;

/**
 * Checkpoint 1B.17B "Multilingual Tourist Map UI + Multilingual Content
 * Editing" —the required minimum-24-scenario E2E suite (§23), built on top
 * of 1B.17A's data foundation (`map-language-settings.spec.ts`) and 1B.9-
 * 1B.11's own public-map/CMS E2E conventions (`public-tourist-map.spec.ts`,
 * `categories.spec.ts`, `pois.spec.ts`, `pages-cms.spec.ts`,
 * `menu-builder.spec.ts`).
 *
 * A genuine cross-app suite, same shape `public-tourist-map.spec.ts`
 * establishes: admin-web (port 3100, login/CRUD/publish) and tourist-web
 * (port 3101, the public rendering under test) against the real Auth +
 * Firestore Emulators. Admin-side CRUD mutations mostly go through
 * `page.request` directly against the real REST routes (not the drawer UI)
 * for the tests whose actual subject is server-side/public-rendering
 * behavior —this is deliberate, matching `map-language-settings.spec.ts`'s
 * own established pattern of driving mutations however is most direct for
 * what a given scenario is actually proving. The admin EDITOR UI itself
 * (drawer visibility, field persistence, blank-clears-the-key behavior) is
 * separately exercised through the real `TranslationEditor` UI in the
 * scenarios whose subject IS that UI (1, 2-7).
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/**
 * A generic authenticated JSON request against admin-web's real API, using
 * `page.request` —shares the same cookie jar as `page`'s browser context
 * (so the real session cookie `login()` established is sent automatically),
 * targets an explicit ABSOLUTE admin-web URL (safe regardless of whether
 * `page` is currently showing admin-web or tourist-web —several scenarios
 * below navigate between both), and sets the `Origin` header explicitly
 * since `isTrustedOrigin()` guards every mutation route and `page.request`
 * does not set it automatically the way a real same-origin browser `fetch`
 * would. Mirrors `public-tourist-map.spec.ts`'s own `publishViaApi` helper,
 * generalized to every HTTP method/route this suite needs.
 */
async function apiRequest(
  page: Page,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<{ status: number; body: JsonRecord }> {
  const response = await page.request.fetch(`${E2E_BASE_URL}${path}`, {
    method,
    headers: { Origin: E2E_BASE_URL, 'Content-Type': 'application/json' },
    data,
  });
  let body: JsonRecord = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { status: response.status(), body };
}

async function publishViaApi(page: Page, mapId: string): Promise<{ status: number; body: { publicationId?: string; version?: number } }> {
  return apiRequest(page, 'POST', `/api/maps/${mapId}/publish`);
}

async function setMapLanguages(
  page: Page,
  mapId: string,
  languages: { defaultLanguage: string; supportedLanguages: string[] },
  mapName = 'E2E Multilingual Map',
): Promise<number> {
  const result = await apiRequest(page, 'PATCH', `/api/maps/${mapId}/settings`, {
    name: mapName,
    mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
    area: { type: 'UNBOUNDED' },
    languages,
  });
  return result.status;
}

async function createCategory(page: Page, mapId: string, payload: Record<string, unknown>) {
  return apiRequest(page, 'POST', `/api/maps/${mapId}/categories`, payload);
}
async function createPoi(page: Page, mapId: string, payload: Record<string, unknown>) {
  return apiRequest(page, 'POST', `/api/maps/${mapId}/pois`, payload);
}
async function createPageContent(page: Page, mapId: string, payload: Record<string, unknown>) {
  return apiRequest(page, 'POST', `/api/maps/${mapId}/pages`, payload);
}
async function createMenuItem(page: Page, mapId: string, payload: Record<string, unknown>) {
  return apiRequest(page, 'POST', `/api/maps/${mapId}/menu-items`, payload);
}

function touristMapUrl(mapId: string, query?: string): string {
  return `${E2E_TOURIST_BASE_URL}/maps/${mapId}${query ? `?${query}` : ''}`;
}

test.describe('1B.17B multilingual tourist map UI + multilingual content editing', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('scenario 1: the Translations section shows ONLY the languages this map has enabled —never an unsupported registry language', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-visible-languages@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Matsue Castle Co',
      displayName: 'Mat Matsue',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    await page.goto(`/admin/maps/${tenant.mapId}/categories`);
    await page.getByRole('button', { name: '+ New category' }).click();

    await expect(page.getByTestId('category-translations-section')).toBeVisible();
    await expect(page.getByTestId('category-translation-name-en-input')).toBeVisible();
    await expect(page.getByTestId('category-translation-name-ja-input')).toBeVisible();
    // Registry-valid but not enabled on this map —must never render.
    await expect(page.getByTestId('category-translation-name-zh-CN-input')).toHaveCount(0);
    await expect(page.getByTestId('category-translation-name-ko-input')).toHaveCount(0);
    await expect(page.getByTestId('category-translation-name-fr-input')).toHaveCount(0);
  });

  test('scenario 2: a Category name translation is saved and persists across reload', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-category-persist@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nagano Ski Co',
      displayName: 'Nag Nagano',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    await page.goto(`/admin/maps/${tenant.mapId}/categories`);
    await page.getByRole('button', { name: '+ New category' }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Restaurants');
    await page.getByTestId('category-translation-name-ja-input').fill('レストラン');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Restaurants', { exact: true })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('category-translation-name-ja-input')).toHaveValue('レストラン');

    const firestore = await getE2eFirestore();
    const categoriesSnap = await firestore.collection(`maps/${tenant.mapId}/categories`).get();
    expect(categoriesSnap.docs[0]!.data().translations).toEqual({ name: { ja: 'レストラン' } });
  });

  test('scenario 3: a POI name + description translation is saved and persists across reload', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-poi-persist@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Beppu Onsen Co',
      displayName: 'Bep Beppu',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    expect(categoryResult.status).toBe(201);

    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await page.getByRole('button', { name: '+ New POI' }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Sakura Restaurant');
    await page.getByLabel('Latitude').fill('35.6812');
    await page.getByLabel('Longitude').fill('139.7671');
    await page.getByTestId('poi-translation-name-ja-input').fill('桜レストラン');
    await page.getByTestId('poi-translation-description-ja-input').fill('美味しい寿司');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Sakura Restaurant')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('poi-translation-name-ja-input')).toHaveValue('桜レストラン');
    await expect(page.getByTestId('poi-translation-description-ja-input')).toHaveValue('美味しい寿司');
  });

  test('scenario 4: a Page title + content translation is saved and persists across reload (plain text only)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-page-persist@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Otaru Canal Co',
      displayName: 'Ota Otaru',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    await page.goto(`/admin/maps/${tenant.mapId}/pages`);
    await page.getByRole('button', { name: '+ New Page' }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Wi-Fi Info');
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Connect to GuestWiFi.');
    await page.getByTestId('page-translation-title-ja-input').fill('Wi-Fi情報');
    await page.getByTestId('page-translation-content-ja-input').fill('GuestWiFiに接続してください。');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Wi-Fi Info')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('page-translation-title-ja-input')).toHaveValue('Wi-Fi情報');
    await expect(page.getByTestId('page-translation-content-ja-input')).toHaveValue('GuestWiFiに接続してください。');
  });

  test('scenario 5: a Menu Item label translation is saved and persists across reload', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-menu-persist@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Yokohama Bay Co',
      displayName: 'Yoko Yokohama',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    expect(categoryResult.status).toBe(201);

    await page.goto(`/admin/maps/${tenant.mapId}/menu`);
    await page.getByRole('button', { name: '+ Add menu item' }).click();
    await page.getByRole('textbox', { name: 'Public label', exact: true }).fill('Restaurants');
    await page.getByTestId('menu-item-translation-label-ja-input').fill('レストラン一覧');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Restaurants', { exact: true })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('menu-item-translation-label-ja-input')).toHaveValue('レストラン一覧');
  });

  test('scenario 6: an imported (Google Places) POI never renders —or accepts —Translations, preserving immutability', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-google-places-immutable@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kobe Port Co',
      displayName: 'Kob Kobe',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    expect(categoryResult.status).toBe(201);
    const categoryId = categoryResult.body.categoryId as string;

    // Simulate an existing imported POI directly via Firestore —the same
    // "seed backend state directly" discipline `map-language-settings.spec.ts`
    // uses for legacy-shaped fixtures. The document id AND the stored
    // `poiId` must both satisfy `poiIdSchema`
    // (packages/validation/src/ids.ts: `POI_ID_PREFIX` + 16-40 url-safe
    // characters) — an auto-generated Firestore doc id does not match that
    // shape, so `loadTenantPois()`'s `poiSchema.safeParse()` silently drops
    // it and the row never renders. A fixed, deterministic id is used here
    // rather than importing the production `generatePoiId()` into this E2E
    // suite. The rest of the document mirrors the real import write in
    // apps/admin-web/app/api/maps/[mapId]/pois/import/route.ts (~line 130).
    const firestore = await getE2eFirestore();
    const poiId = 'poi_0123456789abcdef';
    const poiRef = firestore.doc(`maps/${tenant.mapId}/pois/${poiId}`);
    await poiRef.set({
      poiId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      categoryId,
      name: 'Imported Sushi Bar',
      location: { latitude: 34.6901, longitude: 135.1955 },
      sourceType: 'GOOGLE_PLACES',
      provider: 'GOOGLE',
      providerPlaceId: 'places_fake_0001',
      status: 'ENABLED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await expect(page.getByText('Imported Sushi Bar', { exact: true })).toBeVisible();

    // The Edit action itself is NOT hidden for an imported POI — `pois-manager.tsx`
    // renders it unconditionally — but `poi-form-drawer.tsx` opens it in a
    // read-only-except-status mode (`readOnlyExceptStatus`) for any
    // `GOOGLE_PLACES`-sourced POI: content fields are disabled and the
    // translations editor is not rendered at all, so there is no way to
    // reach or submit a translations payload through the UI.
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByText(/Imported from Google Places/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeDisabled();
    await expect(page.getByTestId('poi-translations-section')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Even bypassing the form entirely, the server rejects a translations
    // payload for a GOOGLE_PLACES-sourced POI.
    const result = await apiRequest(page, 'PATCH', `/api/maps/${tenant.mapId}/pois/${poiRef.id}`, {
      translations: { name: { ja: '輸入寿司バー' } },
    });
    expect(result.status).toBe(400);

    const poiSnap = await poiRef.get();
    expect(poiSnap.data()?.translations).toBeUndefined();
  });

  test('scenario 7: clearing a translation field back to blank removes it —it is never stored as an empty string', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-blank-clears@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sapporo Snow Co',
      displayName: 'Sap Sapporo',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    await page.goto(`/admin/maps/${tenant.mapId}/categories`);
    await page.getByRole('button', { name: '+ New category' }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Restaurants');
    // Whitespace-only —must never be stored as `''`.
    await page.getByTestId('category-translation-name-ja-input').fill('   ');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Restaurants', { exact: true })).toBeVisible();

    const firestore = await getE2eFirestore();
    const categoriesSnap = await firestore.collection(`maps/${tenant.mapId}/categories`).get();
    expect(categoriesSnap.docs[0]!.data().translations).toBeUndefined();

    // Set a real translation, then clear it back to blank on a later edit —    // the stored field must be removed entirely.
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByTestId('category-translation-name-ja-input').fill('レストラン');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const afterSet = await firestore.collection(`maps/${tenant.mapId}/categories`).get();
    expect(afterSet.docs[0]!.data().translations).toEqual({ name: { ja: 'レストラン' } });

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByTestId('category-translation-name-ja-input').fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const afterClear = await firestore.collection(`maps/${tenant.mapId}/categories`).get();
    expect(afterClear.docs[0]!.data().translations).toBeUndefined();
  });

  test('scenario 8: a registry-valid language the MAP has not enabled is rejected server-side —the §13 worked example (map enables en/ja, request sends translations.name.fr)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-map-disabled-language@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kanazawa Garden Co',
      displayName: 'Kana Kanazawa',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    const result = await createCategory(page, tenant.mapId, {
      name: 'Restaurants',
      icon: 'FOOD',
      translations: { name: { fr: 'Restaurants FR' } },
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('map/unsupported-language');

    const firestore = await getE2eFirestore();
    const categoriesSnap = await firestore.collection(`maps/${tenant.mapId}/categories`).get();
    expect(categoriesSnap.empty).toBe(true);
  });

  test('scenario 9: a cross-tenant translation-bearing mutation is denied', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b17b-cross-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Multilingual',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b17b-cross-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Multilingual',
      displayName: 'Bob B',
    });

    await login(page, tenantB);
    const result = await createCategory(page, tenantA.mapId, {
      name: 'Forged Category',
      icon: 'FOOD',
      translations: { name: { ja: 'フォージド' } },
    });
    expect(result.status).toBe(404);

    const firestore = await getE2eFirestore();
    const categoriesSnap = await firestore.collection(`maps/${tenantA.mapId}/categories`).get();
    expect(categoriesSnap.empty).toBe(true);
  });

  test('scenario 10: a signed-out visitor cannot submit a translation-bearing mutation', async ({ page }) => {
    await page.goto('/login');
    const result = await createCategory(page, 'map_does_not_matter_00000000', {
      name: 'x',
      icon: 'FOOD',
      translations: { name: { ja: 'x' } },
    });
    expect(result.status).toBe(401);
  });

  test('scenario 11: a forged mapId/customerId in a translation-bearing create payload is rejected outright', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-forged-ownership@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kumamoto Castle Co',
      displayName: 'Kuma Kumamoto',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    const result = await createCategory(page, tenant.mapId, {
      name: 'Forged Category',
      icon: 'FOOD',
      mapId: 'map_attackerControlled0000000',
      customerId: 'cust_attackerControlled00000',
      translations: { name: { ja: 'フォージド' } },
    });
    expect(result.status).toBe(400);

    const firestore = await getE2eFirestore();
    const categoriesSnap = await firestore.collection(`maps/${tenant.mapId}/categories`).get();
    expect(categoriesSnap.empty).toBe(true);
  });

  test("scenario 12: Publish captures every entity's translations onto the new immutable snapshot", async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-publish-captures@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Takayama Old Town Co',
      displayName: 'Taka Takayama',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    const categoryResult = await createCategory(page, tenant.mapId, {
      name: 'Restaurants',
      icon: 'FOOD',
      translations: { name: { ja: 'レストラン' } },
    });
    expect(categoryResult.status).toBe(201);
    const categoryId = categoryResult.body.categoryId as string;

    const poiResult = await createPoi(page, tenant.mapId, {
      name: 'Sakura Restaurant',
      categoryId,
      latitude: 35.6812,
      longitude: 139.7671,
      translations: { name: { ja: '桜レストラン' }, description: { ja: '美味しい' } },
    });
    expect(poiResult.status).toBe(201);

    const pageResult = await createPageContent(page, tenant.mapId, {
      title: 'Wi-Fi Info',
      content: 'Connect to GuestWiFi.',
      translations: { title: { ja: 'Wi-Fi情報' }, content: { ja: 'GuestWiFiに接続してください。' } },
    });
    expect(pageResult.status).toBe(201);

    const menuItemResult = await createMenuItem(page, tenant.mapId, {
      type: 'CATEGORY',
      categoryId,
      label: 'Restaurants',
      translations: { label: { ja: 'レストラン一覧' } },
    });
    expect(menuItemResult.status).toBe(201);

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    const firestore = await getE2eFirestore();
    const publicationSnap = await firestore.doc(`maps/${tenant.mapId}/publications/${published.body.publicationId}`).get();
    const publication = publicationSnap.data()!;
    expect(publication.categories[0].translations).toEqual({ name: { ja: 'レストラン' } });
    expect(publication.pois[0].translations).toEqual({ name: { ja: '桜レストラン' }, description: { ja: '美味しい' } });
    expect(publication.pages[0].translations).toEqual({ title: { ja: 'Wi-Fi情報' }, content: { ja: 'GuestWiFiに接続してください。' } });
    const categoryMenuItem = (publication.menu as PublicationMenuItem[]).find((item) => item.type === 'CATEGORY')!;
    expect(categoryMenuItem.translations).toEqual({ label: { ja: 'レストラン一覧' } });
  });

  test('scenario 13: the public endpoint is readable anonymously and never leaks customerId/publisher identity, even alongside translated content', async ({ browser, page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-no-leaks@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nikko Shrine Co',
      displayName: 'Nik Nikko',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, {
      name: 'Restaurants',
      icon: 'FOOD',
      translations: { name: { ja: 'レストラン' } },
    });
    expect(categoryResult.status).toBe(201);

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    const response = await anonymousPage.request.get(`${E2E_BASE_URL}/api/public/maps/${tenant.mapId}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(tenant.customerId);
    expect(raw).not.toContain(tenant.uid);
    expect(body.categories[0].translations).toEqual({ name: { ja: 'レストラン' } });
    await anonymousContext.close();
  });

  test("scenario 14: with no ?lang and no matching browser language, the tourist page initializes to the publication's own default language", async ({ browser }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-default-language@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Hakone Hot Spring Co',
      displayName: 'Hak Hakone',
    });
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'ja', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('ja');
    await context.close();
  });

  test('scenario 15: an explicit ?lang=ja renders translated category/POI/Page/menu content throughout', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-lang-param-renders@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kyoto Temple Co',
      displayName: 'Kyo Kyoto',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);

    const categoryResult = await createCategory(page, tenant.mapId, {
      name: 'Restaurants',
      icon: 'FOOD',
      translations: { name: { ja: 'レストラン' } },
    });
    const categoryId = categoryResult.body.categoryId as string;
    await createPoi(page, tenant.mapId, {
      name: 'Sakura Restaurant',
      categoryId,
      latitude: 35.6812,
      longitude: 139.7671,
      translations: { name: { ja: '桜レストラン' } },
    });
    const pageResult = await createPageContent(page, tenant.mapId, {
      title: 'Wi-Fi Info',
      content: 'Connect to GuestWiFi.',
      translations: { title: { ja: 'Wi-Fi情報' }, content: { ja: 'GuestWiFiに接続してください。' } },
    });
    const pageId = pageResult.body.pageId as string;
    await createMenuItem(page, tenant.mapId, {
      type: 'CATEGORY',
      categoryId,
      label: 'Restaurants',
      translations: { label: { ja: 'レストラン一覧' } },
    });
    await createMenuItem(page, tenant.mapId, {
      type: 'PAGE',
      pageId,
      label: 'Wi-Fi',
      translations: { label: { ja: 'Wi-Fi情報メニュー' } },
    });

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId, 'lang=ja'));
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('ja');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('桜レストラン');
    await expect(page.getByTestId(`public-menu-category-${categoryId}`)).toContainText('レストラン一覧');
    await expect(page.getByTestId(`public-menu-page-${pageId}`)).toContainText('Wi-Fi情報メニュー');

    await page.getByTestId(`public-menu-page-${pageId}`).click();
    await expect(page.getByTestId('page-overlay-title')).toHaveText('Wi-Fi情報');
    await expect(page.getByTestId('page-overlay-content')).toHaveText('GuestWiFiに接続してください。');
  });

  test('scenario 16: switching language via the selector updates content immediately, updates ?lang in the URL, and never navigates away from the map', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-language-switch@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Fukuoka Ramen Co',
      displayName: 'Fuk Fukuoka',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    const categoryId = categoryResult.body.categoryId as string;
    await createPoi(page, tenant.mapId, {
      name: 'Sakura Restaurant',
      categoryId,
      latitude: 35.6812,
      longitude: 139.7671,
      translations: { name: { ja: '桜レストラン' } },
    });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Sakura Restaurant');

    await page.getByTestId('tourist-language-selector').selectOption('ja');
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('桜レストラン');
    await expect(page).toHaveURL(new RegExp(`/maps/${tenant.mapId}\\?lang=ja$`));

    // A genuine in-place update, not a navigation —the map container is
    // still present and the mapId in the URL is unchanged.
    await expect(page.getByTestId('tourist-map')).toBeVisible();
  });

  test('scenario 17: an unsupported/malformed ?lang value never crashes —it safely falls back to the publication default', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-unsupported-lang-param@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Okinawa Beach Co',
      displayName: 'Oki Okinawa',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    const response = await page.goto(touristMapUrl(tenant.mapId, 'lang=de'));
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('en');

    const responseGarbage = await page.goto(touristMapUrl(tenant.mapId, 'lang=%3Cscript%3E'));
    expect(responseGarbage?.status()).toBe(200);
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('en');
  });

  test('scenario 18: a map with no translations anywhere still renders exactly as before —existing non-i18n behavior is unchanged, and a single-language map hides the selector entirely', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-legacy-unchanged@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sendai Tanabata Co',
      displayName: 'Sen Sendai',
    });
    await login(page, tenant);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    const categoryId = categoryResult.body.categoryId as string;
    await createPoi(page, tenant.mapId, { name: 'Sakura Restaurant', categoryId, latitude: 35.6812, longitude: 139.7671 });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    // Only one supported language (the untouched platform default) —§12:
    // a single supported language offers no real choice, so the selector
    // must not even render.
    await expect(page.getByTestId('tourist-language-selector')).toHaveCount(0);
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Sakura Restaurant');
  });

  test("scenario 19: a requested language with no translation for a field falls back to the map default language's translation", async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-fallback-to-default@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Hiroshima Peace Co',
      displayName: 'Hiro Hiroshima',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja', 'ko'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    const categoryId = categoryResult.body.categoryId as string;
    await createPoi(page, tenant.mapId, {
      name: 'Sakura Restaurant',
      categoryId,
      latitude: 35.6812,
      longitude: 139.7671,
      // No 'ko' translation at all —only the map default ('en') and 'ja'.
      translations: { name: { en: 'Sakura Restaurant', ja: '桜レストラン' } },
    });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId, 'lang=ko'));
    await expect(page.getByTestId('tourist-language-selector')).toHaveValue('ko');
    // Falls back to the map default ('en') translation, never 'ja' or blank.
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Sakura Restaurant');
  });

  test('scenario 20: when neither the requested nor the default language has a translation, the legacy scalar value is shown', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-fallback-to-legacy@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nagoya Castle Co',
      displayName: 'Nago Nagoya',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    const categoryId = categoryResult.body.categoryId as string;
    await createPoi(page, tenant.mapId, {
      name: 'Sakura Restaurant',
      categoryId,
      latitude: 35.6812,
      longitude: 139.7671,
      // No translations at all.
    });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId, 'lang=ja'));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Sakura Restaurant');
  });

  test('scenario 21: search operates on the currently DISPLAYED (localized) text, not just the legacy scalar', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-localized-search@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Osaka Castle Co',
      displayName: 'Osa Osaka',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    const categoryId = categoryResult.body.categoryId as string;
    const poiResult = await createPoi(page, tenant.mapId, {
      name: 'Sakura Restaurant',
      categoryId,
      latitude: 35.6812,
      longitude: 139.7671,
      translations: { name: { ja: '桜レストラン' } },
    });
    const poiId = poiResult.body.poiId as string;
    await createMenuItem(page, tenant.mapId, { type: 'FEATURE', featureKey: 'SEARCH', label: 'Search' });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId, 'lang=ja'));
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('桜');
    await expect(page.getByTestId(`public-search-result-${poiId}`)).toContainText('桜レストラン');

    // The English legacy term no longer matches —the displayed/searched
    // text is now the Japanese translation.
    await page.getByTestId('public-search-input').fill('Sakura');
    await expect(page.getByTestId('public-search-no-results')).toBeVisible();

    // Selecting the localized result opens the detail card with the
    // localized name too.
    await page.getByTestId('public-search-input').fill('桜');
    await page.getByTestId(`public-search-result-${poiId}`).click();
    await expect(page.getByTestId('poi-detail-name')).toHaveText('桜レストラン');
  });

  test('scenario 22: switching language while a Page overlay is open updates its content in place', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-page-overlay-live-switch@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Takayama Old Town Co',
      displayName: 'Taka Takayama',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const pageResult = await createPageContent(page, tenant.mapId, {
      title: 'Wi-Fi Info',
      content: 'Connect to GuestWiFi.',
      translations: { title: { ja: 'Wi-Fi情報' }, content: { ja: 'GuestWiFiに接続してください。' } },
    });
    const pageId = pageResult.body.pageId as string;
    await createMenuItem(page, tenant.mapId, { type: 'PAGE', pageId, label: 'Wi-Fi' });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await page.getByTestId(`public-menu-page-${pageId}`).click();
    await expect(page.getByTestId('page-overlay-title')).toHaveText('Wi-Fi Info');

    await page.getByTestId('tourist-language-selector').selectOption('ja');
    await expect(page.getByTestId('page-overlay-title')).toHaveText('Wi-Fi情報');
    await expect(page.getByTestId('page-overlay-content')).toHaveText('GuestWiFiに接続してください。');
  });

  test('scenario 23: draft/publish isolation —editing a translation in the draft never changes what tourists see until a NEW Publish', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-draft-publish-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kanazawa Garden Second Co',
      displayName: 'Kana2 Kanazawa',
    });
    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] })).toBe(200);
    const categoryResult = await createCategory(page, tenant.mapId, { name: 'Restaurants', icon: 'FOOD' });
    const categoryId = categoryResult.body.categoryId as string;
    const poiResult = await createPoi(page, tenant.mapId, {
      name: 'Sakura Restaurant',
      categoryId,
      latitude: 35.6812,
      longitude: 139.7671,
      translations: { name: { ja: '桜レストラン v1' } },
    });
    const poiId = poiResult.body.poiId as string;

    const v1 = await publishViaApi(page, tenant.mapId);
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    await page.goto(touristMapUrl(tenant.mapId, 'lang=ja'));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('桜レストラン v1');

    // Edit the ja translation in the DRAFT only —never publish yet.
    const draftEdit = await apiRequest(page, 'PATCH', `/api/maps/${tenant.mapId}/pois/${poiId}`, {
      translations: { name: { ja: '桜レストラン v2 UNPUBLISHED' } },
    });
    expect(draftEdit.status).toBe(200);

    const firestore = await getE2eFirestore();
    const draftSnap = await firestore.doc(`maps/${tenant.mapId}/pois/${poiId}`).get();
    expect(draftSnap.data()?.translations?.name?.ja).toBe('桜レストラン v2 UNPUBLISHED');

    // Tourist-web still shows the OLD, published v1 translation.
    await page.goto(touristMapUrl(tenant.mapId, 'lang=ja'));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('桜レストラン v1');

    // A NEW Publish is what actually moves what tourists see.
    const v2 = await publishViaApi(page, tenant.mapId);
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);

    await page.goto(touristMapUrl(tenant.mapId, 'lang=ja'));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('桜レストラン v2 UNPUBLISHED');
  });

  test('scenario 24: two maps under the same tenant keep fully independent language settings and translated content', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17b-two-maps-independent@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Fukuoka Ramen Second Co',
      displayName: 'Fuk2 Fukuoka',
    });
    const mapB = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Second Multilingual Map' });

    await login(page, tenant);
    expect(await setMapLanguages(page, tenant.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'ja'] }, 'First Map')).toBe(200);
    expect(await setMapLanguages(page, mapB.mapId, { defaultLanguage: 'en', supportedLanguages: ['en', 'fr'] }, 'Second Map')).toBe(200);

    const categoryA = await createCategory(page, tenant.mapId, {
      name: 'Restaurants',
      icon: 'FOOD',
      translations: { name: { ja: 'レストラン' } },
    });
    const categoryAId = categoryA.body.categoryId as string;
    await createPoi(page, tenant.mapId, {
      name: 'Sakura',
      categoryId: categoryAId,
      latitude: 35.6812,
      longitude: 139.7671,
      translations: { name: { ja: '桜' } },
    });

    const categoryB = await createCategory(page, mapB.mapId, {
      name: 'Shops',
      icon: 'SHOPPING',
      translations: { name: { fr: 'Boutiques' } },
    });
    const categoryBId = categoryB.body.categoryId as string;
    await createPoi(page, mapB.mapId, {
      name: 'Le Marche',
      categoryId: categoryBId,
      latitude: 48.8566,
      longitude: 2.3522,
      translations: { name: { fr: 'Le Marché' } },
    });

    const publishA = await publishViaApi(page, tenant.mapId);
    expect(publishA.status).toBe(201);
    const publishB = await publishViaApi(page, mapB.mapId);
    expect(publishB.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId, 'lang=ja'));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('桜');
    await expect(page.getByTestId('tourist-language-selector')).not.toContainText('Français');

    await page.goto(touristMapUrl(mapB.mapId, 'lang=fr'));
    await expect(page.getByTestId('tourist-map-diag-poi-names')).toHaveText('Le Marché');
    await expect(page.getByTestId('tourist-language-selector')).not.toContainText('日本語');
  });
});

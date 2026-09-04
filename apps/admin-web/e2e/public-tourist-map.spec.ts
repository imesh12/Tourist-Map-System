import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_BASE_URL, E2E_TOURIST_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionAdditionalMap, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.9 "Public Tourist Map Foundation" E2E suite — §16.
 *
 * A genuine cross-app integration suite: every scenario drives BOTH real
 * `next dev` servers Playwright's `webServer` array starts
 * (`playwright.config.ts`) — admin-web (port 3100, for login/save/publish,
 * exactly like the rest of this suite) and tourist-web (port 3101, the
 * subject under test) — against the real Auth + Firestore Emulators. No
 * mock/stub of `GET /api/public/maps/{mapId}` is ever used;
 * `tourist-web`'s server component makes a real HTTP call to admin-web's
 * real running server for every scenario here, including the
 * draft/publish-isolation test below (§16 item 6 — "one of the most
 * important tests in the checkpoint").
 *
 * `page.goto()` calls against tourist-web use an explicit, full
 * `E2E_TOURIST_BASE_URL` URL — Playwright's `use.baseURL` (admin-web's
 * `E2E_BASE_URL`) only applies to relative navigations, and this suite
 * deliberately navigates between two different origins within single tests
 * (e.g. login+publish on admin-web, then verify on tourist-web).
 */

function generateId(prefix: string): string {
  return `${prefix}${randomBytes(15).toString('base64url')}`;
}

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/**
 * E2E repair round — bucket 3: this MUST NOT be `page.evaluate(() =>
 * fetch('/api/maps/...'))`. That runs the `fetch` call inside the PAGE's own
 * current browser origin, whatever it happens to be at that moment in the
 * test — several scenarios in this file navigate the same `page` back and
 * forth between admin-web and tourist-web, so a relative `fetch` there is
 * silently resolved against tourist-web (which has no `/api/maps/...`
 * route at all) whenever the last navigation was a tourist-web one,
 * returning tourist-web's HTML 404 page instead of JSON (`Unexpected token
 * '<'`).
 *
 * `page.request` is Playwright's own fix for exactly this: an HTTP client
 * that shares the SAME cookie jar as `page`'s browser context (so the real
 * admin session cookie `login()` established is sent automatically) but
 * makes the request directly, outside any browser page's JS/CORS sandbox —
 * so it always targets the explicit, ABSOLUTE admin-web URL below
 * regardless of what origin `page` is currently showing, and is never
 * subject to the browser's same-origin `fetch` restrictions the way
 * `page.evaluate`'s in-page `fetch` is. This is not a duplicate publish
 * implementation — it calls the exact same real `POST
 * /api/maps/{mapId}/publish` route every other test in this suite (and
 * `map-publishing.spec.ts`) already exercises, just via Playwright's
 * request client instead of in-page `fetch`.
 *
 * The explicit `Origin` header is required separately from the cookie:
 * `POST /api/maps/{mapId}/publish` is one of the routes guarded by
 * `isTrustedOrigin()` (`lib/auth/origin-check.ts`) — real same-origin
 * browser `fetch` calls set this automatically, but `page.request` does
 * not, so it has to be supplied explicitly here to match `APP_ORIGIN`
 * (`E2E_APP_ENV.APP_ORIGIN`, which equals `E2E_BASE_URL`).
 *
 * E2E regression repair (post-checkpoint-1B.16) — `isTransportError()` below
 * guards a ONE-time retry of this exact same request against a raw TCP-level
 * transport failure only (`ECONNRESET` / "socket hang up" / `EPIPE`), never
 * against any received HTTP response, including an error status. Evidence
 * this is a test-harness/dev-server transport race rather than an
 * application bug: (a) `page.request.post()` only throws this way when the
 * connection itself is reset before any HTTP response is received — a real
 * bug in the publish route (`app/api/maps/[mapId]/publish/route.ts`) always
 * resolves with a 2xx/4xx/5xx `NextResponse` instead, which this retry does
 * NOT catch or mask; (b) `git diff` shows the publish route itself is
 * untouched by checkpoint 1B.16; (c) this exact route, called through this
 * exact helper shape, succeeds dozens of times earlier in the same serial
 * `workers: 1` run (`map-publishing.spec.ts`, `map-language-settings.spec.ts`,
 * `multilingual-content.spec.ts`) — proving the route and this call pattern
 * are correct — and the one observed failure was a bare `ECONNRESET` with no
 * response body at all, the textbook signature of a transient reset against
 * a long-lived `next dev` process, not a reproducible code defect. A single,
 * immediate retry of the identical request is therefore the correct fix
 * here, not a workaround: it re-issues the same real request rather than
 * hiding, weakening, or working around a failure.
 */
function isTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ECONNREFUSED|EPIPE|socket hang up/.test(message);
}

async function publishViaApi(page: Page, mapId: string): Promise<{ status: number; body: { publicationId?: string; version?: number } }> {
  let response;
  try {
    response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/publish`, {
      headers: { Origin: E2E_BASE_URL },
    });
  } catch (error) {
    if (!isTransportError(error)) {
      throw error;
    }
    // Bounded to exactly one retry — see this function's doc comment above.
    response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/publish`, {
      headers: { Origin: E2E_BASE_URL },
    });
  }
  return { status: response.status(), body: await response.json() };
}

function touristMapUrl(mapId: string): string {
  return `${E2E_TOURIST_BASE_URL}/maps/${mapId}`;
}

test.describe('1B.9 public tourist map foundation', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('a published map renders on tourist-web, reflecting the saved map name/theme/geography (1)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-published@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nagoya Castle Co',
      displayName: 'Nag Nagoya',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Map name').fill('Nagoya Castle Tourist Map');
    await page.getByLabel('Preset').selectOption('TOURIST_CLEAN');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Nagoya Castle Tourist Map');
    await expect(page.getByTestId('tourist-map-diag-preset')).toHaveText('TOURIST_CLEAN');
    await expect(page.getByTestId('tourist-map-diag-area-type')).toHaveText('UNBOUNDED');
  });

  test('a never-published map shows the friendly "not currently available" state, with a real 404 (2)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-never-published@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Hakone Hot Spring Co',
      displayName: 'Hak Hakone',
    });

    const response = await page.goto(touristMapUrl(tenant.mapId));
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('tourist-map-message-state')).toContainText('This map is not currently available.');
  });

  test('a nonexistent mapId shows the IDENTICAL "not currently available" state — never distinguishable from a never-published map (3)', async ({
    page,
  }) => {
    const response = await page.goto(touristMapUrl(generateId('map_')));
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('tourist-map-message-state')).toContainText('This map is not currently available.');
  });

  test('branding shows only the map name — never customerId, mapId, publishedByUid, or any internal identifier (4)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-branding@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kanazawa Garden Co',
      displayName: 'Kan Kanazawa',
    });

    await login(page, tenant);
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(tenant.customerId);
    expect(bodyText).not.toContain(tenant.mapId);
    expect(bodyText).not.toContain(tenant.uid);
  });

  test('draft/publish isolation: publish v1, edit without publishing, save without publishing — tourist-web still shows v1 until v2 is actually published (5)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sendai Tanabata Co',
      displayName: 'Sen Sendai',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Map name').fill('Sendai Tanabata v1');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const v1 = await publishViaApi(page, tenant.mapId);
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Sendai Tanabata v1');

    // Edit the draft in the admin app WITHOUT saving — still nothing to
    // publish, and tourist-web must still show v1.
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Map name').fill('Sendai Tanabata UNSAVED — must never be public');
    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Sendai Tanabata v1');
    await expect(page.getByTestId('tourist-map-branding')).not.toContainText('UNSAVED');

    // Save the draft WITHOUT publishing — Firestore's live `maps/{mapId}`
    // doc really changes, but tourist-web reads only the publication
    // snapshot, so it must still show v1.
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Map name').fill('Sendai Tanabata SAVED-BUT-UNPUBLISHED — must never be public');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Sendai Tanabata v1');
    await expect(page.getByTestId('tourist-map-branding')).not.toContainText('SAVED-BUT-UNPUBLISHED');

    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.name).toBe('Sendai Tanabata SAVED-BUT-UNPUBLISHED — must never be public');

    // Only an actual second Publish moves what tourist-web shows.
    const v2 = await publishViaApi(page, tenant.mapId);
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Sendai Tanabata SAVED-BUT-UNPUBLISHED');
  });

  test('two published maps under the same tenant render independently on tourist-web (6)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-multi-map@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Fukuoka Ramen Co',
      displayName: 'Fuk Fukuoka',
    });
    const mapB = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Fukuoka Ramen Second Map' });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Map name').fill('Fukuoka Ramen First Map Published');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();
    const publishA = await publishViaApi(page, tenant.mapId);
    expect(publishA.status).toBe(201);

    // Map B is never published in this test.
    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Fukuoka Ramen First Map Published');

    const responseB = await page.goto(touristMapUrl(mapB.mapId));
    expect(responseB?.status()).toBe(404);
    await expect(page.getByTestId('tourist-map-message-state')).toContainText('This map is not currently available.');

    // Publishing map B now must never alter map A's already-rendered content.
    await page.goto(`/admin/maps/${mapB.mapId}/settings`);
    await page.getByLabel('Map name').fill('Fukuoka Ramen Second Map Published');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();
    const publishB = await publishViaApi(page, mapB.mapId);
    expect(publishB.status).toBe(201);

    await page.goto(touristMapUrl(mapB.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Fukuoka Ramen Second Map Published');

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-branding')).toContainText('Fukuoka Ramen First Map Published');
  });

  test('with no Google Maps browser key configured, tourist-web shows a graceful, tourist-friendly fallback — no crash, no real Maps network call (7)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-no-key@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Okinawa Beach Co',
      displayName: 'Oki Okinawa',
    });

    await login(page, tenant);
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    // E2E_TOURIST_APP_ENV deliberately sets NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    // to '' (see e2e/constants.ts) — this app-wide, deterministic absence is
    // what this assertion actually exercises, not a per-test override.
    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-unavailable')).toContainText('Map preview is unavailable in this environment.');
  });

  test('a BOUNDED map area publishes real bounds, reflected in tourist-web geography diagnostics (8)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-bounded@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kyoto Temple Co',
      displayName: 'Kyo Kyoto',
    });

    const firestore = await getE2eFirestore();
    await firestore.doc(`maps/${tenant.mapId}`).update({
      area: {
        type: 'BOUNDED',
        center: { lat: 35.0116, lng: 135.7681 },
        defaultZoom: 14,
        bounds: { north: 35.05, south: 34.97, east: 135.82, west: 135.72 },
      },
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByTestId('tourist-map-diag-area-type')).toHaveText('BOUNDED');
    await expect(page.getByTestId('tourist-map-diag-bounds')).toHaveText('35.05,34.97,135.82,135.72');
    await expect(page.getByTestId('tourist-map-diag-center')).toHaveText('35.0116,135.7681');
  });

  test('the public map page is fully reachable with no admin session/cookie of any kind (9)', async ({ browser }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-no-session@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Osaka Castle Co',
      displayName: 'Osa Osaka',
    });

    // Publish using one context (with a real admin session)...
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, tenant);
    const published = await publishViaApi(adminPage, tenant.mapId);
    expect(published.status).toBe(201);
    await adminContext.close();

    // ...then verify from a completely FRESH, cookie-free browser context —
    // proving the public route needs no admin session, no cookie, no prior
    // navigation to admin-web at all.
    const touristContext = await browser.newContext();
    const touristPage = await touristContext.newPage();
    const cookiesBefore = await touristContext.cookies();
    expect(cookiesBefore).toHaveLength(0);

    const response = await touristPage.goto(touristMapUrl(tenant.mapId));
    expect(response?.status()).toBe(200);
    await expect(touristPage.getByTestId('tourist-map-branding')).toContainText(tenant.mapName);

    const cookiesAfter = await touristContext.cookies();
    expect(cookiesAfter).toHaveLength(0);
    await touristContext.close();
  });

  test('the rendered page exposes basic accessibility structure — a real h1, a labeled main region, and an accessible map canvas (10)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b9-a11y@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nikko Shrine Co',
      displayName: 'Nik Nikko',
    });

    await login(page, tenant);
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.locator('h1')).toHaveText(tenant.mapName);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByTestId('tourist-map')).toHaveAttribute('role', 'img');
    await expect(page.getByTestId('tourist-map')).toHaveAttribute('aria-label', `Map of ${tenant.mapName}`);
    await expect(page.getByTestId('tourist-map-attribution')).toBeVisible();
  });
});

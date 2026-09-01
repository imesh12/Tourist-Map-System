import { expect, test, type Page } from '@playwright/test';
import { E2E_BASE_URL, E2E_TOURIST_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionAdditionalMap, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.11 "Pages CMS" E2E suite — §18. A focused, separate spec
 * file (not extending `menu-builder.spec.ts` or
 * `public-tourist-map-interaction.spec.ts`) so this checkpoint's own new
 * behavior is provable and re-runnable in isolation without destabilizing
 * either historical suite — same reasoning
 * `public-tourist-map-interaction.spec.ts`'s own header comment already
 * gives for *its* separation from `public-tourist-map.spec.ts`.
 *
 * Same real, deterministic, emulator-backed architecture every spec in this
 * project already uses (real Auth + Firestore Emulator + real `next dev`
 * servers for both admin-web and tourist-web — see `playwright.config.ts`).
 * tourist-web's E2E environment never has a real Google Maps browser key
 * (`E2E_TOURIST_APP_ENV.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is `''`, see
 * `./constants.ts`), so — exactly like every test in
 * `public-tourist-map-interaction.spec.ts` — nothing here depends on a live
 * `google.maps.Map`; the Page overlay/menu button are plain React/DOM,
 * entirely independent of the Maps SDK (see `tourist-map.tsx`'s own "E2E
 * repair round" doc comment for the general mechanism this suite leans on
 * the same way).
 *
 * Helper functions below mirror the established, already-proven UI-driven
 * conventions from `e2e/categories.spec.ts`/`e2e/menu-builder.spec.ts`/
 * `e2e/public-tourist-map-interaction.spec.ts` — copied locally rather than
 * imported cross-spec-file, matching this codebase's own established
 * convention for Playwright spec files.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Mirrors e2e/public-tourist-map-interaction.spec.ts's identical helper. */
async function publishViaApi(page: Page, mapId: string): Promise<{ status: number; body: { publicationId?: string; version?: number } }> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/publish`, {
    headers: { Origin: E2E_BASE_URL },
  });
  return { status: response.status(), body: await response.json() };
}

function touristMapUrl(mapId: string): string {
  return `${E2E_TOURIST_BASE_URL}/maps/${mapId}`;
}

/**
 * E2E repair round: `page.locator('tbody tr', { hasText: name })` performs
 * SUBSTRING matching on a plain string — "Wi-Fi Guide (Updated)" also
 * matches `hasText: 'Wi-Fi Guide'`, so after the "editing persists a new
 * title" test renames a page, a `row(page, 'Wi-Fi Guide')` assertion meant
 * to prove the OLD title no longer exists would still find the renamed
 * row. Scoping the match to the row's Title cell (the first `<td>` in
 * `pages-manager.tsx`, which renders `{page.title}` and nothing else) with
 * an EXACT accessible-name match closes that gap without touching any
 * production markup: a cell whose text is exactly "Wi-Fi Guide (Updated)"
 * no longer satisfies `name: 'Wi-Fi Guide', exact: true`. This is a
 * test-only fix — Pages CMS production behavior is unchanged.
 */
function row(page: Page, name: string) {
  return page.locator('tbody tr').filter({ has: page.getByRole('cell', { name, exact: true }) });
}

/** Mirrors e2e/categories.spec.ts's/e2e/menu-builder.spec.ts's identical helper. */
async function createCategory(page: Page, mapId: string, name: string, icon: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/categories`);
  await page.getByRole('button', { name: '+ New category', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create Category' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Icon', { exact: true }).selectOption(icon);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

interface CreatePageOptions {
  readonly title: string;
  readonly content: string;
  readonly status?: 'ENABLED' | 'DISABLED';
}

async function createPage(page: Page, mapId: string, options: CreatePageOptions): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/pages`);
  await page.getByRole('button', { name: '+ New Page', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create Page' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(options.title);
  await page.getByLabel('Content', { exact: true }).fill(options.content);
  if (options.status === 'DISABLED') {
    await page.getByRole('button', { name: 'Disabled', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

interface EditPageOptions {
  readonly title?: string;
  readonly content?: string;
}

async function editPage(page: Page, mapId: string, currentTitle: string, options: EditPageOptions): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/pages`);
  await row(page, currentTitle).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Page' })).toBeVisible();
  if (options.title !== undefined) {
    await page.getByLabel('Title', { exact: true }).fill(options.title);
  }
  if (options.content !== undefined) {
    await page.getByLabel('Content', { exact: true }).fill(options.content);
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Mirrors e2e/menu-builder.spec.ts's identical helper. */
async function openAddMenuItemDrawer(page: Page, mapId: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/menu`);
  await page.getByRole('button', { name: '+ Add menu item', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add Menu Item' })).toBeVisible();
}

/** Mirrors e2e/menu-builder.spec.ts's identical addCategoryMenuItem/addFeatureMenuItem helpers, extended with a Page variant. */
async function addCategoryMenuItem(page: Page, mapId: string, label: string): Promise<void> {
  await openAddMenuItemDrawer(page, mapId);
  await page.getByLabel('Category', { exact: true }).selectOption({ index: 0 });
  await page.getByLabel('Public label', { exact: true }).fill(label);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function addFeatureMenuItem(page: Page, mapId: string, featureLabel: string, label: string): Promise<void> {
  await openAddMenuItemDrawer(page, mapId);
  await page.getByRole('button', { name: 'Feature', exact: true }).click();
  await page.getByLabel('Feature', { exact: true }).selectOption({ label: featureLabel });
  await page.getByLabel('Public label', { exact: true }).fill(label);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

interface AddPageMenuItemOptions {
  /** Selects the Nth eligible (enabled, not-already-linked) Page option — mirrors addCategoryMenuItem's `categoryIndex` convention. Defaults to 0. */
  readonly pageIndex?: number;
  readonly label?: string;
}

async function addPageMenuItem(page: Page, mapId: string, options: AddPageMenuItemOptions = {}): Promise<void> {
  await openAddMenuItemDrawer(page, mapId);
  await page.getByRole('button', { name: 'Page', exact: true }).click();
  await page.getByLabel('Page', { exact: true }).selectOption({ index: options.pageIndex ?? 0 });
  if (options.label !== undefined) {
    await page.getByLabel('Public label', { exact: true }).fill(options.label);
  }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('1B.11 Pages CMS', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('creating a page lists it, editing persists a new title/content, and search narrows the list by title (1, 3, 5)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-crud@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Onsen Guide Co',
      displayName: 'Ollie Onsen',
    });
    await login(page, tenant);

    await createPage(page, tenant.mapId, { title: 'Wi-Fi Guide', content: 'Network: Guest\nPassword: welcome' });
    const wifiRow = row(page, 'Wi-Fi Guide');
    await expect(wifiRow).toBeVisible(); // (1)
    await expect(wifiRow.getByText('Enabled')).toBeVisible();

    await createPage(page, tenant.mapId, { title: 'Parking Info', content: 'Level 2, Spot 14' });

    // (5) search narrows by title.
    await page.getByLabel('Search pages', { exact: true }).fill('wi-fi');
    await expect(row(page, 'Wi-Fi Guide')).toBeVisible();
    await expect(row(page, 'Parking Info')).toHaveCount(0);
    await page.getByLabel('Search pages', { exact: true }).fill('');

    // (3) editing persists a new title AND content.
    await editPage(page, tenant.mapId, 'Wi-Fi Guide', {
      title: 'Wi-Fi Guide (Updated)',
      content: 'Network: Guest2\nPassword: newpass',
    });
    await expect(row(page, 'Wi-Fi Guide (Updated)')).toBeVisible();
    await expect(row(page, 'Wi-Fi Guide')).toHaveCount(0);

    await row(page, 'Wi-Fi Guide (Updated)').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Content', { exact: true })).toHaveValue('Network: Guest2\nPassword: newpass');
  });

  test('enable/disable toggling on a page persists across reload (4)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-toggle@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Rules Co',
      displayName: 'Rita Rules',
    });
    await login(page, tenant);
    await createPage(page, tenant.mapId, { title: 'House Rules', content: 'Quiet hours after 10pm.' });

    await row(page, 'House Rules').getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(row(page, 'House Rules').getByText('Disabled')).toBeVisible();
    await page.reload();
    await expect(row(page, 'House Rules').getByText('Disabled')).toBeVisible();

    await row(page, 'House Rules').getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(row(page, 'House Rules').getByText('Enabled')).toBeVisible();
  });

  test('a page created under one map never appears in another map’s Pages list or its Menu Builder Page options (2, 15)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-isolation@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Multi Map Co',
      displayName: 'Mika MultiMap',
    });
    await login(page, tenant);
    await createPage(page, tenant.mapId, { title: 'Map A Only Page', content: 'Only visible on map A.' });

    const mapB = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Map B' });

    await page.goto(`/admin/maps/${mapB.mapId}/pages`);
    await expect(row(page, 'Map A Only Page')).toHaveCount(0);
    await expect(page.getByText('No pages yet')).toBeVisible();

    await openAddMenuItemDrawer(page, mapB.mapId);
    await page.getByRole('button', { name: 'Page', exact: true }).click();
    await expect(page.getByText('No eligible pages')).toBeVisible();
  });

  test('adding a Page menu item offers only eligible pages, and a duplicate or malformed Page linkage is rejected (6, 7)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-menueligibility@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Eligible Co',
      displayName: 'Ellie Eligible',
    });
    await login(page, tenant);
    await createPage(page, tenant.mapId, { title: 'Wi-Fi Guide', content: 'Network: Guest' });
    await createPage(page, tenant.mapId, { title: 'Parking Info', content: 'Level 2' });

    // "Not-already-linked" eligible-option filtering means index 0 is always
    // the next unlinked page — Parking Info/Wi-Fi Guide in whichever order
    // `loadTenantPages()` returns (alphabetical by title), so link the first
    // one and assert only the OTHER remains selectable.
    await addPageMenuItem(page, tenant.mapId, { pageIndex: 0, label: 'Parking' });

    await openAddMenuItemDrawer(page, tenant.mapId);
    await page.getByRole('button', { name: 'Page', exact: true }).click();
    const pageSelect = page.getByLabel('Page', { exact: true });
    await expect(pageSelect.locator('option')).toHaveCount(1); // (6)
    await expect(pageSelect.locator('option')).toHaveText('Wi-Fi Guide');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    const firestore = await getE2eFirestore();
    const linkedPageId = (
      await firestore.collection(`maps/${tenant.mapId}/pages`).where('title', '==', 'Parking Info').limit(1).get()
    ).docs[0]!.id;

    // (7) a duplicate Page linkage is rejected.
    const duplicateResult = await page.evaluate(
      async ({ mapId, pageId }: { mapId: string; pageId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/menu-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'PAGE', pageId, label: 'Parking Again' }),
        });
        const body = (await response.json()) as { code?: string };
        return { status: response.status, code: body.code };
      },
      { mapId: tenant.mapId, pageId: linkedPageId },
    );
    expect(duplicateResult.status).toBe(409);
    expect(duplicateResult.code).toBe('map/duplicate-menu-item');

    // (7) a malformed/invalid Page reference is rejected — never a 500, and
    // never silently accepted.
    const invalidResult = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PAGE', pageId: 'not-a-real-page-id', label: 'Bad Link' }),
      });
      return { status: response.status };
    }, tenant.mapId);
    expect(invalidResult.status).toBe(400);

    const menuItems = await firestore.collection(`maps/${tenant.mapId}/menuItems`).get();
    expect(menuItems.size).toBe(1); // only the original "Parking" link exists
  });

  test('a published Page appears in the tourist menu, clicking it shows exactly its title/content with no leaked identifiers or extra requests, and closing it preserves existing map state (9, 10, 11, 18)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-touristflow@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kamakura Temple Co',
      displayName: 'Kama Kamakura',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await addCategoryMenuItem(page, tenant.mapId, 'Food');
    await createPage(page, tenant.mapId, { title: 'Wi-Fi Guide', content: 'Network: Guest\nPassword: welcome' });
    await addPageMenuItem(page, tenant.mapId, { label: 'WiFi' });

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));

    // Establish some pre-existing map state (§13): a category filter.
    await page.getByRole('button', { name: 'Food' }).click();
    await expect(page.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');

    const publicApiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/public/maps/')) {
        publicApiRequests.push(request.url());
      }
    });

    await page.getByRole('button', { name: 'WiFi' }).click();
    await expect(page.getByTestId('page-overlay')).toBeVisible(); // (9) appears once published
    await expect(page.getByTestId('page-overlay-title')).toHaveText('Wi-Fi Guide'); // (10)
    await expect(page.getByTestId('page-overlay-content')).toHaveText('Network: Guest\nPassword: welcome'); // (10)

    // (18) no internal identifiers ever appear in visible text.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(tenant.customerId);
    expect(bodyText).not.toContain(tenant.mapId);
    expect(bodyText).not.toContain(tenant.uid);

    // Clicking the already-published Page must not trigger a second fetch of
    // the public snapshot — `TouristMap` reads only the `snapshot` prop it
    // already received from the Server Component (§12).
    expect(publicApiRequests).toHaveLength(0);

    // (11) closing preserves the pre-existing category filter/map state.
    await page.getByTestId('page-overlay-close').click();
    await expect(page.getByTestId('page-overlay')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('editing a published page and saving only never changes what tourists see; only a new Publish updates it (8, 12, 13)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-savevspublish@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Hiroshima Peace Co',
      displayName: 'Hiro Hiroshima',
    });
    await login(page, tenant);
    await createPage(page, tenant.mapId, { title: 'Wi-Fi Guide', content: 'v1 content' });
    await addPageMenuItem(page, tenant.mapId, { label: 'WiFi' });

    const v1 = await publishViaApi(page, tenant.mapId);
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    await page.goto(touristMapUrl(tenant.mapId));
    await page.getByRole('button', { name: 'WiFi' }).click();
    await expect(page.getByTestId('page-overlay-content')).toHaveText('v1 content');

    // Edit + save only — no publish. (8) — the live draft really changes...
    await editPage(page, tenant.mapId, 'Wi-Fi Guide', { content: 'v2 content — must stay unpublished' });
    const firestore = await getE2eFirestore();
    const draftPageId = (await firestore.collection(`maps/${tenant.mapId}/pages`).limit(1).get()).docs[0]!.id;
    expect((await firestore.doc(`maps/${tenant.mapId}/pages/${draftPageId}`).get()).data()?.content).toBe(
      'v2 content — must stay unpublished',
    );

    // ...but tourists still see v1 (8).
    await page.goto(touristMapUrl(tenant.mapId));
    await page.getByRole('button', { name: 'WiFi' }).click();
    await expect(page.getByTestId('page-overlay-content')).toHaveText('v1 content'); // (12) old content still shown publicly

    // Only an actual second Publish moves what tourists see (13).
    const v2 = await publishViaApi(page, tenant.mapId);
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);

    await page.goto(touristMapUrl(tenant.mapId));
    await page.getByRole('button', { name: 'WiFi' }).click();
    await expect(page.getByTestId('page-overlay-content')).toHaveText('v2 content — must stay unpublished');
  });

  test('disabling a published page and publishing removes both the page and its now-invalid menu link from what tourists see (14)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-disablepublish@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nikko Shrine Co',
      displayName: 'Niko Nikko',
    });
    await login(page, tenant);
    await createPage(page, tenant.mapId, { title: 'Wi-Fi Guide', content: 'Network: Guest' });
    await addPageMenuItem(page, tenant.mapId, { label: 'WiFi' });

    const v1 = await publishViaApi(page, tenant.mapId);
    expect(v1.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByRole('button', { name: 'WiFi' })).toBeVisible();

    await page.goto(`/admin/maps/${tenant.mapId}/pages`);
    await row(page, 'Wi-Fi Guide').getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(row(page, 'Wi-Fi Guide').getByText('Disabled')).toBeVisible();

    const v2 = await publishViaApi(page, tenant.mapId);
    expect(v2.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));
    await expect(page.getByRole('button', { name: 'WiFi' })).toHaveCount(0);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Network: Guest');
  });

  test('cross-tenant Page API access is rejected with anti-enumeration 404s (16)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b11-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Co',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b11-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Co',
      displayName: 'Bob B',
    });

    const firestore = await getE2eFirestore();
    const tenantBPageId = 'page_tenant_b_seed_00000000';
    await firestore.doc(`maps/${tenantB.mapId}/pages/${tenantBPageId}`).set({
      pageId: tenantBPageId,
      customerId: tenantB.customerId,
      mapId: tenantB.mapId,
      title: 'Tenant B Secret Page',
      content: 'Should never be reachable by tenant A.',
      status: 'ENABLED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await login(page, tenantA);

    // Tenant A's own (verified) mapId, tenant B's pageId — the page simply
    // doesn't exist under A's map, so 404.
    const ownMapResult = await page.evaluate(
      async ({ mapId, pageId }: { mapId: string; pageId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/pages/${pageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Hijacked' }),
        });
        return { status: response.status };
      },
      { mapId: tenantA.mapId, pageId: tenantBPageId },
    );
    expect(ownMapResult.status).toBe(404);

    // Tenant B's own mapId forged into the URL — getOwnedMapContext denies
    // before the pageId is ever looked at (a browser-controlled mapId is an
    // identifier, never authorization).
    const forgedMapResult = await page.evaluate(
      async ({ mapId, pageId }: { mapId: string; pageId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/pages/${pageId}`, {
          method: 'DELETE',
        });
        const body = (await response.json()) as { code?: string };
        return { status: response.status, code: body.code };
      },
      { mapId: tenantB.mapId, pageId: tenantBPageId },
    );
    expect(forgedMapResult.status).toBe(404);
    expect(forgedMapResult.code).toBe('map/not-found');

    const tenantBDoc = await firestore.doc(`maps/${tenantB.mapId}/pages/${tenantBPageId}`).get();
    expect(tenantBDoc.data()?.title).toBe('Tenant B Secret Page');

    // A signed-out caller is rejected the same way every other trusted
    // mutation route already is.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    const signedOutResult = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Should Not Exist', content: 'x' }),
      });
      return { status: response.status };
    }, tenantA.mapId);
    expect(signedOutResult.status).toBe(401);
  });

  test('an anonymous visitor with no admin session can read a published page from the public API (17)', async ({ page, browser }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-anonymous@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Osaka Castle Co',
      displayName: 'Osa Osaka',
    });
    await login(page, tenant);
    await createPage(page, tenant.mapId, { title: 'Wi-Fi Guide', content: 'Network: Guest' });
    await addPageMenuItem(page, tenant.mapId, { label: 'WiFi' });
    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    // A fresh browser context — no cookies, no admin session of any kind.
    const anonymousPage = await (await browser.newContext()).newPage();
    const response = await anonymousPage.request.get(`${E2E_BASE_URL}/api/public/maps/${tenant.mapId}`);
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { pages: readonly { title: string; content: string }[] };
    expect(body.pages).toEqual([{ pageId: expect.any(String), title: 'Wi-Fi Guide', content: 'Network: Guest' }]);
  });

  test('adding Pages does not regress existing published CATEGORY/SEARCH/MY_LOCATION public behavior, and works with no Google Maps network dependency (19, 20)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b11-regression@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kyoto Bamboo Co',
      displayName: 'Kyo Kyoto',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await page.getByRole('button', { name: '+ New POI', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Sushi Place');
    await page.getByLabel('Latitude', { exact: true }).fill('35.0');
    await page.getByLabel('Longitude', { exact: true }).fill('135.0');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await addCategoryMenuItem(page, tenant.mapId, 'Food');
    await addFeatureMenuItem(page, tenant.mapId, 'Search', 'Search');
    await addFeatureMenuItem(page, tenant.mapId, 'My Location', 'Locate Me');
    await createPage(page, tenant.mapId, { title: 'Wi-Fi Guide', content: 'Network: Guest' });
    await addPageMenuItem(page, tenant.mapId, { label: 'WiFi' });

    const published = await publishViaApi(page, tenant.mapId);
    expect(published.status).toBe(201);

    await page.goto(touristMapUrl(tenant.mapId));

    // (20) — this app's E2E environment never has a real Google Maps key
    // (see this file's header comment); the whole interaction below —
    // category filter, search, My Location button, and the new Page
    // overlay — works entirely without a live SDK/network call.
    await expect(page.getByTestId('tourist-map-unavailable')).toBeVisible();

    // (19) CATEGORY filter still works.
    await expect(page.getByTestId('tourist-map-diag-poi-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Food' }).click();
    await expect(page.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');

    // (19) SEARCH still works.
    await page.getByTestId('public-menu-feature-search').click();
    await page.getByTestId('public-search-input').fill('sushi');
    await expect(page.getByRole('button', { name: /Sushi Place/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('public-search-overlay')).toHaveCount(0);

    // (19) MY_LOCATION menu item still renders as a real, present control.
    await expect(page.getByTestId('public-menu-feature-my-location')).toBeVisible();

    // The new Page overlay works alongside all of the above.
    await page.getByRole('button', { name: 'WiFi' }).click();
    await expect(page.getByTestId('page-overlay-title')).toHaveText('Wi-Fi Guide');
    await page.getByTestId('page-overlay-close').click();
    await expect(page.getByTestId('page-overlay')).toHaveCount(0);
  });
});

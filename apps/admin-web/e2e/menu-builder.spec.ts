import { expect, test, type Page } from '@playwright/test';
import { FieldValue } from 'firebase-admin/firestore';
import { categorySchema, menuItemSchema, type CategoryParsed, type MenuItemParsed } from 'validation';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';
import { buildPublicMenuProjection } from '../lib/tenant/menu-projection';

/**
 * `/admin/maps/{mapId}/menu` (Menu Builder) integration tests — checkpoint
 * 1B.5, same pattern as the rest of this suite (real Auth + Firestore
 * Emulator + a real `next dev` server — see playwright.config.ts). Covers
 * the checkpoint's own A–V test list; see each `test()`'s trailing
 * `(letter)` for the mapping.
 *
 * Checkpoint 1B.6 rewrite: every route/fetch in this file is now explicitly
 * mapId-scoped (`/admin/maps/{mapId}/menu`, `/api/maps/{mapId}/menu-items`)
 * instead of the old flat single-map routes — see
 * `apps/admin-web/e2e/categories.spec.ts`'s own header comment for the full
 * reasoning; this file follows the identical convention, threading `mapId`
 * as an explicit parameter through every local helper.
 *
 * Tests T/U/V exercise `buildPublicMenuProjection()` — a pure function with
 * no HTTP surface of its own (§21: "Do NOT expose this publicly yet", so
 * there is deliberately no public/authenticated API route to drive it
 * through the browser). Playwright test bodies run in Node, not just
 * `page.evaluate()` callbacks, so these three tests import that one pure
 * function directly by relative path — `e2e/auth.spec.ts` already
 * establishes the same "import real app-server code into a spec file"
 * pattern (`'../lib/auth/session-config'`). `buildPublicMenuProjection`
 * itself has zero Firebase dependency (only `shared-types`/`validation`
 * types), so it's safe to import directly into the Playwright *test-runner*
 * process — unlike `lib/tenant/{load-menu-items,load-categories}.ts` or
 * `lib/firebase/admin.ts`, which are DELIBERATELY NOT imported here: that
 * singleton resolves its project ID from `process.env.FIREBASE_PROJECT_ID`,
 * which `e2e/helpers/e2e-admin-app.ts`'s own doc comment already documents
 * as "not proven to be set for every process `firebase emulators:exec`
 * wraps" (the exact reason that helper exists as a separate, explicitly-
 * configured Admin app instead of reusing `lib/firebase/admin.ts`). So
 * `loadMenuItemsViaE2eAdmin`/`loadCategoriesViaE2eAdmin` below re-implement
 * those two loaders' query+parse+sort logic (byte-for-byte the same
 * behavior, including the "skip a document that fails schema validation"
 * fail-closed rule) sourced through the already-proven-reliable
 * `getE2eFirestore()` instead — the real schemas (`menuItemSchema`/
 * `categorySchema` from `validation`, also pure), the real projection
 * function, real emulator data; only the Firestore CLIENT differs, and only
 * for the documented reason above.
 */

async function loadMenuItemsViaE2eAdmin(mapId: string): Promise<readonly MenuItemParsed[]> {
  const firestore = await getE2eFirestore();
  const snapshot = await firestore.collection(`maps/${mapId}/menuItems`).orderBy('order', 'asc').get();
  const menuItems: MenuItemParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = menuItemSchema.safeParse(doc.data());
    if (parsed.success) {
      menuItems.push(parsed.data);
    }
  }
  return menuItems.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.menuItemId.localeCompare(b.menuItemId));
}

async function loadCategoriesViaE2eAdmin(mapId: string): Promise<readonly CategoryParsed[]> {
  const firestore = await getE2eFirestore();
  const snapshot = await firestore.collection(`maps/${mapId}/categories`).orderBy('order', 'asc').get();
  const categories: CategoryParsed[] = [];
  for (const doc of snapshot.docs) {
    const parsed = categorySchema.safeParse(doc.data());
    if (parsed.success) {
      categories.push(parsed.data);
    }
  }
  return categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.categoryId.localeCompare(b.categoryId));
}

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function row(page: Page, name: string) {
  return page.locator('tbody tr', { hasText: name });
}

/** Mirrors e2e/categories.spec.ts's/e2e/pois.spec.ts's identical helper. */
async function createCategory(page: Page, mapId: string, name: string, icon: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/categories`);
  await page.getByRole('button', { name: '+ New category', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create Category' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Icon', { exact: true }).selectOption(icon);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function disableCategory(page: Page, mapId: string, name: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/categories`);
  await page.locator('tbody tr', { hasText: name }).getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.locator('tbody tr', { hasText: name }).getByText('Disabled')).toBeVisible();
}

async function openMenuBuilder(page: Page, mapId: string): Promise<void> {
  await page.goto(`/admin/maps/${mapId}/menu`);
}

async function openAddMenuItemDrawer(page: Page, mapId: string): Promise<void> {
  await openMenuBuilder(page, mapId);
  await page.getByRole('button', { name: '+ Add menu item', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add Menu Item' })).toBeVisible();
}

interface AddCategoryMenuItemOptions {
  /** Selects the Nth eligible category option (0-based) — options appear in `Category.enabled`-filtered, not-already-linked order, matching e2e/pois.spec.ts's own `categoryIndex` convention (the select's option text is icon-prefixed, so index-based selection avoids that entirely). Defaults to 0. */
  readonly categoryIndex?: number;
  readonly label?: string;
  readonly status?: 'ENABLED' | 'DISABLED';
}

async function addCategoryMenuItem(page: Page, mapId: string, options: AddCategoryMenuItemOptions = {}): Promise<void> {
  await openAddMenuItemDrawer(page, mapId);
  // Type defaults to Category — no click needed unless a test wants to be explicit.
  await page.getByLabel('Category', { exact: true }).selectOption({ index: options.categoryIndex ?? 0 });
  if (options.label !== undefined) {
    await page.getByLabel('Public label', { exact: true }).fill(options.label);
  }
  if (options.status === 'DISABLED') {
    await page.getByRole('button', { name: 'Disabled', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

interface AddFeatureMenuItemOptions {
  readonly featureLabel?: string;
  readonly label?: string;
  readonly status?: 'ENABLED' | 'DISABLED';
}

async function addFeatureMenuItem(page: Page, mapId: string, options: AddFeatureMenuItemOptions = {}): Promise<void> {
  await openAddMenuItemDrawer(page, mapId);
  await page.getByRole('button', { name: 'Feature', exact: true }).click();
  if (options.featureLabel) {
    await page.getByLabel('Feature', { exact: true }).selectOption({ label: options.featureLabel });
  }
  if (options.label !== undefined) {
    await page.getByLabel('Public label', { exact: true }).fill(options.label);
  }
  if (options.status === 'DISABLED') {
    await page.getByRole('button', { name: 'Disabled', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('1B.5 Menu Builder', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('the /admin/maps/{mapId}/menu route renders inside the admin shell (A)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-shell@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Shell Co',
      displayName: 'Shelly Admin',
    });
    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}/menu`);
    await expect(page.getByRole('heading', { name: 'Menu Builder', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('the Menu Builder sidebar link is a real, active route (B)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-nav@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nav Co',
      displayName: 'Nadia Nav',
    });
    await login(page, tenant);

    // Menu Builder only renders in the sidebar once inside a map's own
    // routes (checkpoint 1B.6 — see admin-shell.spec.ts's header comment).
    await page.goto(`/admin/maps/${tenant.mapId}`);
    const sidebar = page.getByRole('navigation', { name: 'Admin' });
    await sidebar.getByRole('link', { name: 'Menu Builder', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/maps/${tenant.mapId}/menu$`));
    await expect(sidebar.getByRole('link', { name: 'Menu Builder', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('an empty menu shows the empty state (C)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-empty@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Empty Co',
      displayName: 'Emma Empty',
    });
    await login(page, tenant);

    await page.goto(`/admin/maps/${tenant.mapId}/menu`);
    await expect(page.getByText('No menu items yet')).toBeVisible();
  });

  test('a Client Admin adds a Category menu item (D), a custom label persists (E), and it survives a reload (F)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-addcat@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Create Co',
      displayName: 'Cara Create',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    await addCategoryMenuItem(page, tenant.mapId, { label: 'Gourmet' });

    const itemRow = row(page, 'Gourmet');
    await expect(itemRow).toBeVisible(); // (D)
    await expect(itemRow.getByText('Category')).toBeVisible();
    await expect(itemRow.getByText('Restaurants')).toBeVisible();
    await expect(itemRow.getByText('Enabled')).toBeVisible();
    await expect(itemRow.getByText('Gourmet')).toBeVisible(); // (E) custom label — the row's own label cell, distinct from the "Restaurants" category name shown separately in the Source column

    await page.reload(); // (F)
    await expect(row(page, 'Gourmet')).toBeVisible();
  });

  test('a Client Admin adds a Feature menu item (G)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-addfeature@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Feature Co',
      displayName: 'Fiona Feature',
    });
    await login(page, tenant);

    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' });

    const itemRow = row(page, 'Search');
    await expect(itemRow).toBeVisible();
    await expect(itemRow.getByText('Feature')).toBeVisible();
    await expect(itemRow.getByText('Enabled')).toBeVisible();
  });

  test('only released feature keys are selectable (H)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-releasedfeatures@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Released Co',
      displayName: 'Rena Released',
    });
    await login(page, tenant);

    await openAddMenuItemDrawer(page, tenant.mapId);
    await page.getByRole('button', { name: 'Feature', exact: true }).click();

    const featureSelect = page.getByLabel('Feature', { exact: true });
    const optionLabels = await featureSelect.locator('option').allTextContents();
    expect(optionLabels.sort()).toEqual(['My Location', 'Search']);
  });

  test('reordering persists (I)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-reorder@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Order Co',
      displayName: 'Ollie Order',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await addCategoryMenuItem(page, tenant.mapId, { label: 'Gourmet' }); // order 0
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' }); // order 1

    await row(page, 'Search').getByRole('button', { name: 'Move Search up', exact: true }).click();

    // Repair Round 2 (checkpoint 1B.6): the first mutation in the whole
    // suite to hit the reorder endpoint — Next.js dev-mode compiling it on
    // its first-ever request in this process can legitimately take several
    // seconds (see `admin-shell.spec.ts`'s own header comment for the same,
    // previously-diagnosed mechanism on a page route). A generous explicit
    // timeout absorbs that one-time cost.
    const FIRST_MUTATION_TIMEOUT_MS = 20_000;

    // Repair Round 4 (checkpoint 1B.6): Round 3 replaced an ambiguous
    // `.getByText('Search')` (two legitimately identical `<td>Search</td>`
    // cells in this row — the custom label and the linked feature's own
    // registry label happen to match) with `toBeDisabled()` on the row's
    // own "Move Search up" button. That was closer, but still wrong in a
    // way a fresh trace exposed: `menu-builder-manager.tsx`'s `<button
    // disabled={isBusy || index <= 0}>` is disabled for TWO independent
    // reasons — either the item is already first (`index <= 0`, what this
    // test actually means to prove), OR a mutation for THIS item is merely
    // in flight (`isBusy`, set synchronously the instant `handleMove` is
    // called, before either network request even starts). The trace's own
    // action log showed the click, this assertion starting, and it
    // resolving — via the `isBusy` reason, not `index <= 0` — within ~15ms,
    // long before the reorder's request could possibly have completed. The
    // test then called `page.reload()` while the mutation's own request was
    // still in flight, and the browser navigation cancelled it outright
    // (confirmed in the network trace: status -1, duration -1) — so the
    // reorder never actually reached Firestore, and the reload correctly
    // showed the ORIGINAL, unswapped order. Not a persistence, race, or
    // ordering defect in production (classification A once again: a test
    // assertion that matched a true-but-wrong reason for the same DOM
    // attribute) — but a real one, since it let the test race ahead of its
    // own mutation.
    //
    // `isBusy` disables BOTH the up AND down arrows for the row, whereas
    // `index <= 0` alone only disables "up" (Search, moving from index 1 to
    // index 0, still isn't the LAST item, so "down" stays enabled once
    // settled). Waiting for "Move Search down" to become enabled again is
    // therefore a signal `isBusy` cannot produce early: it can only occur
    // once `handleMove`'s `finally`-equivalent `setBusyMenuItemId(undefined)`
    // has run, which — per that function's own body — happens strictly
    // AFTER its `refetchMenuItems()` call resolves. Only once busy has
    // genuinely cleared does "up disabled" reflect the real, persisted
    // `index <= 0` — not the transient in-flight state.
    await expect(row(page, 'Search').getByRole('button', { name: 'Move Search down', exact: true })).toBeEnabled({
      timeout: FIRST_MUTATION_TIMEOUT_MS,
    });
    await expect(row(page, 'Search').getByRole('button', { name: 'Move Search up', exact: true })).toBeDisabled();

    await page.reload();
    await expect(row(page, 'Search').getByRole('button', { name: 'Move Search up', exact: true })).toBeDisabled();
    await expect(row(page, 'Search').getByRole('button', { name: 'Move Search down', exact: true })).toBeEnabled();
  });

  test('disable and re-enable a menu item works (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-toggle@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Toggle Co',
      displayName: 'Toby Toggle',
    });
    await login(page, tenant);
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' });

    await row(page, 'Search').getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(row(page, 'Search').getByText('Disabled')).toBeVisible();

    await row(page, 'Search').getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(row(page, 'Search').getByText('Enabled')).toBeVisible();
  });

  test('editing a menu item’s label works (K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-editlabel@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Edit Co',
      displayName: 'Eddie Edit',
    });
    await login(page, tenant);
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Old Label' });

    await row(page, 'Old Label').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Menu Item' })).toBeVisible();
    await page.getByLabel('Public label', { exact: true }).fill('New Label');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(row(page, 'New Label')).toBeVisible();
    await expect(row(page, 'Old Label')).toHaveCount(0);
  });

  test('delete requires deliberate confirmation (L)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-deleteconfirm@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Confirm Co',
      displayName: 'Connie Confirm',
    });
    await login(page, tenant);
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Doomed Item' });

    await row(page, 'Doomed Item').getByRole('button', { name: 'Delete Doomed Item', exact: true }).click();
    await expect(page.getByRole('alertdialog', { name: /Remove .Doomed Item. from public menu\?/ })).toBeVisible();
    await expect(page.getByText('This only removes it from the menu')).toBeVisible();

    // Cancel preserves the item.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(row(page, 'Doomed Item')).toBeVisible();

    // Confirming removes it.
    await row(page, 'Doomed Item').getByRole('button', { name: 'Delete Doomed Item', exact: true }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(row(page, 'Doomed Item')).toHaveCount(0);
  });

  test('deleting a menu item does not delete the linked category or its POIs (M)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-deletesafe@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Safe Co',
      displayName: 'Sasha Safe',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');

    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await page.getByRole('button', { name: '+ New POI', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Sakura Restaurant');
    await page.getByLabel('Latitude', { exact: true }).fill('35.6812');
    await page.getByLabel('Longitude', { exact: true }).fill('139.7671');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await addCategoryMenuItem(page, tenant.mapId, { label: 'Gourmet' });
    await row(page, 'Gourmet').getByRole('button', { name: 'Delete Gourmet', exact: true }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(row(page, 'Gourmet')).toHaveCount(0);

    await page.goto(`/admin/maps/${tenant.mapId}/categories`);
    await expect(row(page, 'Restaurants')).toBeVisible();

    await page.goto(`/admin/maps/${tenant.mapId}/pois`);
    await expect(row(page, 'Sakura Restaurant')).toBeVisible();
  });

  test('a duplicate category linkage is rejected (N)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-dupcategory@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Dup Co',
      displayName: 'Dana Dup',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await addCategoryMenuItem(page, tenant.mapId, { label: 'Gourmet' });

    const categoryId = (await (await getE2eFirestore()).collection(`maps/${tenant.mapId}/categories`).limit(1).get()).docs[0]!.id;

    const result = await page.evaluate(
      async ({ mapId, cid }: { mapId: string; cid: string }) => {
        const response = await fetch(`/api/maps/${mapId}/menu-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'CATEGORY', categoryId: cid, label: 'Gourmet Again' }),
        });
        const responseBody = (await response.json()) as { code?: string };
        return { status: response.status, code: responseBody.code };
      },
      { mapId: tenant.mapId, cid: categoryId },
    );

    expect(result.status).toBe(409);
    expect(result.code).toBe('map/duplicate-menu-item');

    const firestore = await getE2eFirestore();
    const menuItems = await firestore.collection(`maps/${tenant.mapId}/menuItems`).get();
    expect(menuItems.size).toBe(1);
  });

  test('a duplicate feature linkage is rejected (O)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-dupfeature@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Dup Co',
      displayName: 'Dana Dup',
    });
    await login(page, tenant);
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' });

    const result = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'FEATURE', featureKey: 'SEARCH', label: 'Search Again' }),
      });
      const responseBody = (await response.json()) as { code?: string };
      return { status: response.status, code: responseBody.code };
    }, tenant.mapId);

    expect(result.status).toBe(409);
    expect(result.code).toBe('map/duplicate-menu-item');

    const firestore = await getE2eFirestore();
    const menuItems = await firestore.collection(`maps/${tenant.mapId}/menuItems`).get();
    expect(menuItems.size).toBe(1);
  });

  test('a category belonging to another tenant cannot be referenced (P)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b5-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Co',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b5-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Co',
      displayName: 'Bob B',
    });

    const firestore = await getE2eFirestore();
    const tenantBCategoryId = 'cat_tenant_b_menu_seed_0000';
    await firestore.doc(`maps/${tenantB.mapId}/categories/${tenantBCategoryId}`).set({
      categoryId: tenantBCategoryId,
      customerId: tenantB.customerId,
      mapId: tenantB.mapId,
      name: 'Tenant B Category',
      icon: 'OTHER',
      enabled: true,
      order: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await login(page, tenantA);

    // Posted against tenant A's own map — the categoryId simply doesn't
    // exist there (it lives under tenant B's map), so this is a plain
    // "category not found" rejection, not a cross-tenant mapId access.
    const result = await page.evaluate(
      async ({ mapId, categoryId }: { mapId: string; categoryId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/menu-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'CATEGORY', categoryId, label: 'Cross-Tenant' }),
        });
        return { status: response.status };
      },
      { mapId: tenantA.mapId, categoryId: tenantBCategoryId },
    );

    expect(result.status).toBe(400);

    const tenantAMenuItems = await firestore.collection(`maps/${tenantA.mapId}/menuItems`).get();
    expect(tenantAMenuItems.empty).toBe(true);
  });

  test('Tenant A cannot edit Tenant B’s menu item — neither via menuItemId under A’s own map nor by forging B’s mapId (Q)', async ({
    page,
  }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b5-editcross-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Co',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b5-editcross-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Co',
      displayName: 'Bob B',
    });

    const firestore = await getE2eFirestore();
    const tenantBMenuItemId = 'menu_tenant_b_seed_0000000';
    await firestore.doc(`maps/${tenantB.mapId}/menuItems/${tenantBMenuItemId}`).set({
      menuItemId: tenantBMenuItemId,
      customerId: tenantB.customerId,
      mapId: tenantB.mapId,
      type: 'FEATURE',
      label: 'Tenant B Search',
      featureKey: 'SEARCH',
      order: 0,
      status: 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await login(page, tenantA);

    // Attempt 1: tenant A's own map, tenant B's menuItemId — the item
    // simply doesn't exist under A's map, so 404.
    const ownMapResult = await page.evaluate(
      async ({ mapId, menuItemId }: { mapId: string; menuItemId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/menu-items/${menuItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Hijacked' }),
        });
        return { status: response.status };
      },
      { mapId: tenantA.mapId, menuItemId: tenantBMenuItemId },
    );
    expect(ownMapResult.status).toBe(404);

    // Attempt 2: tenant B's own mapId forged into the URL — getOwnedMapContext
    // denies before the menuItemId is ever looked at (§14 — a browser-
    // controlled mapId is an identifier, not authorization).
    const forgedMapResult = await page.evaluate(
      async ({ mapId, menuItemId }: { mapId: string; menuItemId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/menu-items/${menuItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Hijacked' }),
        });
        const body = (await response.json()) as { code?: string };
        return { status: response.status, code: body.code };
      },
      { mapId: tenantB.mapId, menuItemId: tenantBMenuItemId },
    );
    expect(forgedMapResult.status).toBe(404);
    expect(forgedMapResult.code).toBe('map/not-found');

    const tenantBDoc = await firestore.doc(`maps/${tenantB.mapId}/menuItems/${tenantBMenuItemId}`).get();
    expect(tenantBDoc.data()?.label).toBe('Tenant B Search');
  });

  test('forged customerId/sourceType-style ownership fields cannot change ownership (R)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-forged@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Forged Co',
      displayName: 'Frank Forged',
    });
    await login(page, tenant);

    // mapId is now a URL segment resolved via getOwnedMapContext, not a
    // body field — this proves the remaining forgeable-looking body field
    // (customerId) is still rejected by menuItemCreateInputSchema's
    // `.strict()` on both branches.
    const result = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'FEATURE',
          featureKey: 'SEARCH',
          label: 'Forged',
          customerId: 'cust_attacker_controlled0000',
        }),
      });
      return { status: response.status };
    }, tenant.mapId);

    // Any unrecognized/forbidden field rejects the whole request rather
    // than silently stripping it, so no menu item is created with forged
    // ownership at all.
    expect(result.status).toBe(400);
    const firestore = await getE2eFirestore();
    const menuItems = await firestore.collection(`maps/${tenant.mapId}/menuItems`).get();
    expect(menuItems.empty).toBe(true);
  });

  test('a signed-out user cannot mutate the menu (S)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-signedout@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'SignedOut Co',
      displayName: 'Sid SignedOut',
    });
    await login(page, tenant);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    const result = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'FEATURE', featureKey: 'SEARCH', label: 'Should Not Exist' }),
      });
      return { status: response.status };
    }, tenant.mapId);

    expect(result.status).toBe(401);
  });

  test('the public projection returns only enabled items, in order (T)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-projection@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Projection Co',
      displayName: 'Penny Projection',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await addCategoryMenuItem(page, tenant.mapId, { label: 'Gourmet' }); // order 0, ENABLED
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'Search', label: 'Search' }); // order 1, ENABLED
    await addFeatureMenuItem(page, tenant.mapId, { featureLabel: 'My Location', label: 'My Location', status: 'DISABLED' }); // order 2, DISABLED

    const [menuItems, categories] = await Promise.all([loadMenuItemsViaE2eAdmin(tenant.mapId), loadCategoriesViaE2eAdmin(tenant.mapId)]);
    const projection = buildPublicMenuProjection(menuItems, categories);

    expect(projection).toEqual([
      { type: 'CATEGORY', label: 'Gourmet', icon: 'FOOD', categoryId: expect.any(String) },
      { type: 'FEATURE', label: 'Search', icon: 'INFORMATION', featureKey: 'SEARCH' },
    ]);
  });

  test('a disabled category causes its CATEGORY menu item to fail closed in the projection (U)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-projection-disabled@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'FailClosed Co',
      displayName: 'Fay FailClosed',
    });
    await login(page, tenant);
    await createCategory(page, tenant.mapId, 'Restaurants', 'FOOD');
    await addCategoryMenuItem(page, tenant.mapId, { label: 'Gourmet' });

    // Sanity: still projects while the category is enabled.
    const beforeProjection = buildPublicMenuProjection(
      await loadMenuItemsViaE2eAdmin(tenant.mapId),
      await loadCategoriesViaE2eAdmin(tenant.mapId),
    );
    expect(beforeProjection).toHaveLength(1);

    await disableCategory(page, tenant.mapId, 'Restaurants');

    // The MenuItem itself is untouched — still ENABLED, still stored — only
    // excluded from the projection because its category is now disabled.
    const menuItems = await loadMenuItemsViaE2eAdmin(tenant.mapId);
    expect(menuItems).toHaveLength(1);
    expect(menuItems[0]!.status).toBe('ENABLED');

    const afterProjection = buildPublicMenuProjection(menuItems, await loadCategoriesViaE2eAdmin(tenant.mapId));
    expect(afterProjection).toEqual([]);
  });

  test('an unreleased/forged feature key never appears in the projection (V)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b5-projection-unreleased@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Unreleased Co',
      displayName: 'Uma Unreleased',
    });
    await login(page, tenant); // establishes the tenant; no UI mutation needed for this test

    // menuItemSchema's discriminated union (via the closed
    // menuItemFeatureKeySchema enum) would reject an unreleased featureKey
    // at the API mutation boundary — this seeds the malformed document
    // directly via the Admin SDK (bypassing that boundary entirely, the
    // same "prove the read/projection path also fails closed, independent
    // of the write-side guard" reasoning e2e/google-places-discovery.spec.ts's
    // forged-field tests already establish) to prove the REST of the real
    // stack — the loader's own `menuItemSchema.safeParse` skip, and
    // `buildPublicMenuProjection()`'s own independent guard — both refuse
    // to ever surface it, not just the create-input schema.
    const firestore = await getE2eFirestore();
    const forgedMenuItemId = 'menu_forged_unreleased_0000';
    await firestore.doc(`maps/${tenant.mapId}/menuItems/${forgedMenuItemId}`).set({
      menuItemId: forgedMenuItemId,
      customerId: tenant.customerId,
      mapId: tenant.mapId,
      type: 'FEATURE',
      label: 'Forged Ranking',
      featureKey: 'RANKING',
      order: 0,
      status: 'ENABLED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const menuItems = await loadMenuItemsViaE2eAdmin(tenant.mapId);
    // The loader already fails closed on the malformed document — it never
    // even reaches the returned list.
    expect(menuItems.find((item) => item.menuItemId === forgedMenuItemId)).toBeUndefined();

    const projection = buildPublicMenuProjection(menuItems, await loadCategoriesViaE2eAdmin(tenant.mapId));
    expect(projection.find((item) => item.type === 'FEATURE' && item.featureKey === 'RANKING')).toBeUndefined();
  });
});

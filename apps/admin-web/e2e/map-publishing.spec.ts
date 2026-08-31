import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { FieldValue } from 'firebase-admin/firestore';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import {
  getE2eFirestore,
  provisionAdditionalMap,
  provisionTestTenant,
  type TestTenantFixture,
} from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.8 "Preview + Publish Foundation + Map Settings UX Repair"
 * integration tests — the publish/versioning/security/public-read half of
 * the checkpoint's required scenario list (K–AC; A–J — the UX-repair half —
 * live in e2e/map-settings-ux.spec.ts). Real Auth + Firestore Emulator + a
 * real `next dev` server, same pattern as the rest of this suite.
 *
 * Draft content (categories/POIs/menu items) is seeded DIRECTLY via
 * `getE2eFirestore()` writes, not via the admin UI — the exact same
 * "seed backend state, never bypass login" discipline
 * `tenant-fixture.ts`'s own header comment establishes, and the same choice
 * `map-settings.spec.ts`'s cross-tenant test already makes for its forged-
 * request assertions. Every seeded document matches
 * `packages/validation/src/{category,poi,menu-item}.ts`'s real schemas
 * field-for-field — a fixture built from the real target shape, not a
 * parallel invented one. Publish/public-read calls go through
 * `page.evaluate(fetch(...))` against the real routes, matching this
 * suite's own established forged-request pattern.
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
 * Switches the same browser `page` from one signed-in tenant to another —
 * used by the security test below, which needs three DIFFERENT signed-in
 * identities (tenant B, a CLIENT_EDITOR, then tenant A) within one test.
 * Deliberately NOT `clearEmulatorUsers()` mid-test: that wipes every Auth
 * Emulator user for the whole project, including tenants this same test
 * still needs later — see e2e/auth.spec.ts's own "logout clears the
 * session" test for the same real Sign-out-button pattern reused here.
 */
async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

interface SeededContent {
  readonly enabledCategoryId: string;
  readonly disabledCategoryId: string;
  readonly enabledPoiId: string;
  readonly disabledPoiId: string;
  readonly poiUnderDisabledCategoryId: string;
  readonly poiWithBrokenCategoryId: string;
  readonly categoryMenuItemId: string;
  readonly featureMenuItemId: string;
  readonly disabledMenuItemId: string;
}

/**
 * Seeds one enabled + one disabled category, POIs covering every §13
 * exclusion rule (disabled POI, POI under a disabled category, POI
 * referencing a category that was never created at all), and menu items
 * covering both branches of `buildPublicMenuProjection()` plus one disabled
 * item — everything a Publish's content-selection rules need to prove
 * against in one seed.
 */
async function seedPublishingContent(mapId: string, customerId: string): Promise<SeededContent> {
  const firestore = await getE2eFirestore();

  const enabledCategoryId = generateId('cat_');
  const disabledCategoryId = generateId('cat_');
  const enabledPoiId = generateId('poi_');
  const disabledPoiId = generateId('poi_');
  const poiUnderDisabledCategoryId = generateId('poi_');
  const poiWithBrokenCategoryId = generateId('poi_');
  const brokenCategoryId = generateId('cat_'); // well-formed, never written — a broken reference.
  const categoryMenuItemId = generateId('menu_');
  const featureMenuItemId = generateId('menu_');
  const disabledMenuItemId = generateId('menu_');

  const batch = firestore.batch();

  batch.set(firestore.doc(`maps/${mapId}/categories/${enabledCategoryId}`), {
    categoryId: enabledCategoryId,
    customerId,
    mapId,
    name: 'Restaurants',
    icon: 'FOOD',
    enabled: true,
    order: 0,
    sourceType: 'CLIENT_CUSTOM',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(firestore.doc(`maps/${mapId}/categories/${disabledCategoryId}`), {
    categoryId: disabledCategoryId,
    customerId,
    mapId,
    name: 'Retired Category',
    icon: 'SHOPPING',
    enabled: false,
    order: 1,
    sourceType: 'CLIENT_CUSTOM',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const poiBase = {
    customerId,
    mapId,
    location: { latitude: 35.0, longitude: 135.0 },
    sourceType: 'CLIENT_CUSTOM' as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  batch.set(firestore.doc(`maps/${mapId}/pois/${enabledPoiId}`), {
    ...poiBase,
    poiId: enabledPoiId,
    categoryId: enabledCategoryId,
    name: 'Published Ramen Shop',
    status: 'ENABLED',
  });
  batch.set(firestore.doc(`maps/${mapId}/pois/${disabledPoiId}`), {
    ...poiBase,
    poiId: disabledPoiId,
    categoryId: enabledCategoryId,
    name: 'Disabled POI',
    status: 'DISABLED',
  });
  batch.set(firestore.doc(`maps/${mapId}/pois/${poiUnderDisabledCategoryId}`), {
    ...poiBase,
    poiId: poiUnderDisabledCategoryId,
    categoryId: disabledCategoryId,
    name: 'POI Under Disabled Category',
    status: 'ENABLED',
  });
  batch.set(firestore.doc(`maps/${mapId}/pois/${poiWithBrokenCategoryId}`), {
    ...poiBase,
    poiId: poiWithBrokenCategoryId,
    categoryId: brokenCategoryId,
    name: 'POI With Broken Category Reference',
    status: 'ENABLED',
  });

  const menuBase = { customerId, mapId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  batch.set(firestore.doc(`maps/${mapId}/menuItems/${categoryMenuItemId}`), {
    ...menuBase,
    menuItemId: categoryMenuItemId,
    type: 'CATEGORY',
    label: 'Restaurants',
    categoryId: enabledCategoryId,
    order: 0,
    status: 'ENABLED',
  });
  batch.set(firestore.doc(`maps/${mapId}/menuItems/${featureMenuItemId}`), {
    ...menuBase,
    menuItemId: featureMenuItemId,
    type: 'FEATURE',
    label: 'Search',
    featureKey: 'SEARCH',
    order: 1,
    status: 'ENABLED',
  });
  batch.set(firestore.doc(`maps/${mapId}/menuItems/${disabledMenuItemId}`), {
    ...menuBase,
    menuItemId: disabledMenuItemId,
    type: 'FEATURE',
    label: 'My Location (disabled)',
    featureKey: 'MY_LOCATION',
    order: 2,
    status: 'DISABLED',
  });

  await batch.commit();

  return {
    enabledCategoryId,
    disabledCategoryId,
    enabledPoiId,
    disabledPoiId,
    poiUnderDisabledCategoryId,
    poiWithBrokenCategoryId,
    categoryMenuItemId,
    featureMenuItemId,
    disabledMenuItemId,
  };
}

async function publishViaApi(page: Page, mapId: string): Promise<{ status: number; body: { publicationId?: string; version?: number; code?: string } }> {
  return page.evaluate(async (targetMapId: string) => {
    const response = await fetch(`/api/maps/${targetMapId}/publish`, { method: 'POST' });
    return { status: response.status, body: await response.json() };
  }, mapId);
}

test.describe('1B.8 publish + public read', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('a brand-new map reports "Never published" (K)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-never-published@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sapporo Snow Co',
      displayName: 'Sap Sapporo',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await expect(page.getByTestId('publication-status')).toContainText('Never published');
    await expect(page.getByTestId('publication-status')).not.toContainText('Published');
  });

  test('first Publish creates version 1 with correct saved map/theme/menu/category/POI content, excluding disabled and broken-reference content and never including a Discover candidate (L, M, N, O, P, Q)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-first-publish@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Yokohama Bay Co',
      displayName: 'Yoko Yokohama',
    });
    const content = await seedPublishingContent(tenant.mapId, tenant.customerId);

    await login(page, tenant);
    // Save a real draft edit first (§14 requires Publish read the SAVED
    // draft) — also proves the publication reflects saved map/theme data,
    // not the Phase-1A provisioning default.
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByLabel('Map name').fill('Yokohama Bay Published Map');
    await page.getByLabel('Preset').selectOption('MINIMAL');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const result = await publishViaApi(page, tenant.mapId);
    expect(result.status).toBe(201);
    expect(result.body.version).toBe(1);
    const publicationId = result.body.publicationId!;

    const firestore = await getE2eFirestore();
    const publicationSnap = await firestore.doc(`maps/${tenant.mapId}/publications/${publicationId}`).get();
    expect(publicationSnap.exists).toBe(true);
    const publication = publicationSnap.data()!;

    // M: saved map/theme.
    expect(publication.map.name).toBe('Yokohama Bay Published Map');
    expect(publication.map.theme.preset).toBe('MINIMAL');

    // O: valid enabled categories/POIs only.
    expect(publication.categories).toHaveLength(1);
    expect(publication.categories[0].categoryId).toBe(content.enabledCategoryId);
    const publishedPoiIds = (publication.pois as Array<{ poiId: string }>).map((poi) => poi.poiId).sort();
    expect(publishedPoiIds).toEqual([content.enabledPoiId]);

    // P: disabled POI, POI under a disabled category, and a POI with a
    // broken/nonexistent categoryId reference are all excluded.
    expect(publishedPoiIds).not.toContain(content.disabledPoiId);
    expect(publishedPoiIds).not.toContain(content.poiUnderDisabledCategoryId);
    expect(publishedPoiIds).not.toContain(content.poiWithBrokenCategoryId);

    // N: valid menu projection — the enabled CATEGORY item and the enabled
    // FEATURE item are present; the disabled FEATURE item is excluded.
    const menuKeys = (publication.menu as Array<{ type: string; categoryId?: string; featureKey?: string }>).map((item) =>
      item.type === 'CATEGORY' ? `CATEGORY:${item.categoryId}` : `FEATURE:${item.featureKey}`,
    );
    expect(menuKeys).toEqual([`CATEGORY:${content.enabledCategoryId}`, 'FEATURE:SEARCH']);

    // Q: no temporary Google Places Discover candidate was ever seeded and
    // none appears — proven here by construction: only the exact POI this
    // test itself created and expects (`enabledPoiId`) is present, nothing
    // extra snuck in.
    expect(publication.pois).toHaveLength(1);

    // The map's own pointer now reflects this publish.
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.publication).toMatchObject({ currentPublicationId: publicationId, version: 1 });
  });

  test('a second Publish creates version 2, version 1 remains byte-for-byte unchanged, and the current pointer moves to v2 (R, S, T)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-second-publish@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kobe Port Co',
      displayName: 'Kob Kobe',
    });
    const content = await seedPublishingContent(tenant.mapId, tenant.customerId);
    const firestore = await getE2eFirestore();

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    const first = await publishViaApi(page, tenant.mapId);
    expect(first.status).toBe(201);
    expect(first.body.version).toBe(1);
    const v1PublicationId = first.body.publicationId!;
    const v1SnapBefore = (await firestore.doc(`maps/${tenant.mapId}/publications/${v1PublicationId}`).get()).data();

    // Change draft content, save, then publish again.
    await firestore.doc(`maps/${tenant.mapId}/categories/${content.enabledCategoryId}`).update({
      name: 'Restaurants (Renamed)',
      updatedAt: FieldValue.serverTimestamp(),
    });
    await page.reload();
    await page.getByLabel('Map name').fill('Kobe Port Republished Map');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const second = await publishViaApi(page, tenant.mapId);
    expect(second.status).toBe(201);
    expect(second.body.version).toBe(2);
    const v2PublicationId = second.body.publicationId!;
    expect(v2PublicationId).not.toBe(v1PublicationId);

    // S: v1 is completely untouched.
    const v1SnapAfter = (await firestore.doc(`maps/${tenant.mapId}/publications/${v1PublicationId}`).get()).data();
    expect(v1SnapAfter).toEqual(v1SnapBefore);
    expect(v1SnapAfter?.map.name).not.toBe('Kobe Port Republished Map');

    // R/T: v2 exists with the new content, and the map's current pointer
    // moved to v2.
    const v2Snap = (await firestore.doc(`maps/${tenant.mapId}/publications/${v2PublicationId}`).get()).data();
    expect(v2Snap?.version).toBe(2);
    expect(v2Snap?.map.name).toBe('Kobe Port Republished Map');
    expect(v2Snap?.categories[0].name).toBe('Restaurants (Renamed)');

    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.publication).toMatchObject({ currentPublicationId: v2PublicationId, version: 2 });
  });

  test('publishing one map never affects a second map under the same tenant (U)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-multi-map@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nara Deer Co',
      displayName: 'Nar Nara',
    });
    const mapB = await provisionAdditionalMap({ customerId: tenant.customerId, mapName: 'Nara Deer Second Map' });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    const result = await publishViaApi(page, tenant.mapId);
    expect(result.status).toBe(201);

    const firestore = await getE2eFirestore();
    const mapASnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapASnap.data()?.publication).toBeDefined();

    const mapBSnap = await firestore.doc(`maps/${mapB.mapId}`).get();
    expect(mapBSnap.data()?.publication).toBeUndefined();
    const mapBPublications = await firestore.collection(`maps/${mapB.mapId}/publications`).get();
    expect(mapBPublications.empty).toBe(true);
  });

  test('cross-tenant, signed-out, non-admin, and forged-payload Publish attempts are all denied (V, W, X, Y)', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b8-security-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Publishing',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b8-security-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Publishing',
      displayName: 'Bob B',
    });
    const tenantEditor = await provisionTestTenant({
      email: 'checkpoint-1b8-security-editor@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant Editor Publishing',
      displayName: 'Eve E',
      role: 'CLIENT_EDITOR',
    });

    // W: signed out entirely.
    await page.goto('/login');
    const signedOutResult = await page.evaluate(async (targetMapId: string) => {
      const response = await fetch(`/api/maps/${targetMapId}/publish`, { method: 'POST' });
      return response.status;
    }, tenantA.mapId);
    expect(signedOutResult).toBe(401);

    // V: cross-tenant — tenant B, signed in, tries to publish tenant A's map.
    await login(page, tenantB);
    const crossTenantResult = await publishViaApi(page, tenantA.mapId);
    expect(crossTenantResult.status).toBe(404);
    expect(crossTenantResult.body.code).toBe('map/not-found');

    // X: CLIENT_EDITOR (non-admin) denied on their own map.
    await logout(page);
    await login(page, tenantEditor);
    const nonAdminResult = await publishViaApi(page, tenantEditor.mapId);
    expect(nonAdminResult.status).toBe(403);
    expect(nonAdminResult.body.code).toBe('map/forbidden');

    // Y: a forged request body (a fabricated publication snapshot / version
    // / mapId / customerId) is completely ignored — the route never reads
    // the request body at all, so the resulting publication is still built
    // exclusively from the caller's own authoritative Firestore draft.
    await logout(page);
    await login(page, tenantA);
    await page.goto(`/admin/maps/${tenantA.mapId}/settings`);
    const forgedResult = await page.evaluate(
      async ({ mapId, forgedTargetMapId }: { mapId: string; forgedTargetMapId: string }) => {
        const response = await fetch(`/api/maps/${mapId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mapId: forgedTargetMapId,
            customerId: 'cust_forged00000000000000000',
            version: 999,
            publicationId: 'pub_forged000000000000000000',
            map: { name: 'Forged Public Map' },
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { mapId: tenantA.mapId, forgedTargetMapId: tenantB.mapId },
    );
    expect(forgedResult.status).toBe(201);

    const firestore = await getE2eFirestore();
    const publicationSnap = await firestore.doc(`maps/${tenantA.mapId}/publications/${forgedResult.body.publicationId}`).get();
    const publication = publicationSnap.data()!;
    expect(publication.mapId).toBe(tenantA.mapId);
    expect(publication.customerId).toBe(tenantA.customerId);
    expect(publication.version).toBe(1);
    expect(publication.map.name).not.toBe('Forged Public Map');
    expect(publication.map.name).toBe(tenantA.mapName);

    // Tenant B's map was never touched by tenant A's forged request.
    const tenantBMapSnap = await firestore.doc(`maps/${tenantB.mapId}`).get();
    expect(tenantBMapSnap.data()?.publication).toBeUndefined();
  });

  test('an old map with no publication metadata still works, and the public read endpoint returns only the latest published snapshot, never the current draft (Z, AA, AB)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-public-read@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Matsue Castle Co',
      displayName: 'Mat Matsue',
    });
    await seedPublishingContent(tenant.mapId, tenant.customerId);

    // Z: before any publish, the map (identical in shape to every pre-1B.8
    // map — no `publication` field at all) still loads its settings page
    // successfully, and the public endpoint safely reports "not available"
    // rather than erroring.
    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await expect(page.getByLabel('Map name')).toHaveValue(tenant.mapName);

    const beforePublish = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/public/maps/${mapId}`);
      return { status: response.status, body: await response.json() };
    }, tenant.mapId);
    expect(beforePublish.status).toBe(404);
    expect(beforePublish.body.code).toBe('public-map/not-found');

    await page.getByLabel('Map name').fill('Matsue Castle Public Name');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const publishResult = await publishViaApi(page, tenant.mapId);
    expect(publishResult.status).toBe(201);

    // AA: the public endpoint now returns the published snapshot.
    const afterPublish = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/public/maps/${mapId}`);
      return { status: response.status, body: await response.json() };
    }, tenant.mapId);
    expect(afterPublish.status).toBe(200);
    expect(afterPublish.body.version).toBe(1);
    expect(afterPublish.body.map.name).toBe('Matsue Castle Public Name');
    expect(afterPublish.body.customerId).toBeUndefined();
    expect(afterPublish.body.publishedByUid).toBeUndefined();

    // AB: an unsaved, and even a SAVED-but-not-republished, draft change
    // must never leak through the public endpoint.
    await page.getByLabel('Map name').fill('Unsaved Draft Name — Should Never Be Public');
    const withUnsavedDraft = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/public/maps/${mapId}`);
      return response.json();
    }, tenant.mapId);
    expect(withUnsavedDraft.map.name).toBe('Matsue Castle Public Name');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();
    const withSavedButUnpublishedDraft = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/public/maps/${mapId}`);
      return response.json();
    }, tenant.mapId);
    // The draft was saved (Firestore's `maps/{mapId}.name` really did
    // change), but the public endpoint still serves the last PUBLISHED
    // snapshot, proving it reads `publications/{currentPublicationId}`, not
    // the live map document.
    expect(withSavedButUnpublishedDraft.map.name).toBe('Matsue Castle Public Name');

    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.name).toBe('Unsaved Draft Name — Should Never Be Public');
  });

  test('unsaved Map Settings changes cannot be silently published — Publish is disabled until Save (AC)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-unsaved-guard@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Takamatsu Udon Co',
      displayName: 'Tak Takamatsu',
    });
    await seedPublishingContent(tenant.mapId, tenant.customerId);

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // First publish something real, so a later Publish click (if it were
    // wrongly enabled) would be able to create a NEW version — makes the
    // assertion below meaningful rather than vacuous.
    await expect(page.getByTestId('publish-button')).toBeEnabled();
    const before = await publishViaApi(page, tenant.mapId);
    expect(before.status).toBe(201);
    await page.reload();

    await page.getByLabel('Map name').fill('Takamatsu Udon Unsaved Rename');
    await expect(page.getByTestId('unsaved-map-settings-badge')).toBeVisible();
    await expect(page.getByTestId('publish-button')).toBeDisabled();
    await expect(page.getByTestId('publish-disabled-hint')).toHaveText('Save changes before publishing.');

    // Even a direct API call (bypassing the disabled button) only ever
    // republishes the last SAVED draft, never the unsaved browser state —
    // the server has no notion of "unsaved" at all, by design (§17): the
    // browser-only guard is defense in depth on top of that, not the only
    // thing preventing an unsaved value from reaching a publication.
    const forcedPublish = await publishViaApi(page, tenant.mapId);
    expect(forcedPublish.status).toBe(201);
    expect(forcedPublish.body.version).toBe(2);

    const firestore = await getE2eFirestore();
    const publicationSnap = await firestore
      .doc(`maps/${tenant.mapId}/publications/${forcedPublish.body.publicationId}`)
      .get();
    expect(publicationSnap.data()?.map.name).not.toBe('Takamatsu Udon Unsaved Rename');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();
    await expect(page.getByTestId('publish-button')).toBeEnabled();
  });
});

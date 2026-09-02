import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { getE2eFirestore, provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.17A "Multilingual Data Foundation" — Public Languages Map
 * Settings integration tests, real Auth + Firestore Emulator + a real
 * `next dev` server, same pattern as `map-settings.spec.ts`/
 * `map-publishing.spec.ts`. Covers the checkpoint's required 12 E2E
 * scenarios: the Public Languages section itself, legacy-map safe defaults,
 * enabling/defaulting languages, the "default must stay supported" UX guard,
 * server-side rejection of an unsupported code, Save-never-publishes,
 * Publish capturing the language config onto the snapshot, existing/legacy
 * public map rendering, and cross-tenant/signed-out denial.
 *
 * This checkpoint deliberately builds NO tourist-facing language selector
 * and NO translation editor (1B.17B) — "renders" below means the existing,
 * unchanged single-language public map continues to load successfully, not
 * that it displays translated content or a language switcher.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function publishViaApi(page: Page, mapId: string): Promise<{ status: number; body: { publicationId?: string; version?: number; code?: string } }> {
  return page.evaluate(async (targetMapId: string) => {
    const response = await fetch(`/api/maps/${targetMapId}/publish`, { method: 'POST' });
    return { status: response.status, body: await response.json() };
  }, mapId);
}

test.describe('1B.17A Public Languages map settings', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('scenario 1: the Public Languages section displays with the current default marked and every registered language listed', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-section@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nagoya Castle Co',
      displayName: 'Nago Nagoya',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await expect(page.getByTestId('public-languages-card')).toBeVisible();
    await expect(page.getByTestId('public-languages-card')).toContainText('English');
    await expect(page.getByTestId('public-languages-card')).toContainText('Japanese');
    // The platform default (English) starts checked and marked default —
    // matching every map's own Phase-1A-descended provisioning default.
    await expect(page.getByTestId('public-language-checkbox-en')).toBeChecked();
    await expect(page.getByTestId('public-language-default-en')).toBeChecked();
  });

  test('scenario 2: a legacy map stored with pre-1B.17A Language codes (EN) still loads, normalized safely', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-legacy@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sendai Tanabata Co',
      displayName: 'Sen Sendai',
    });

    // Directly overwrite the map document with the OLD (pre-1B.17A)
    // Language enum's own codes — exactly what every map document created
    // before this checkpoint actually has stored.
    const firestore = await getE2eFirestore();
    await firestore.doc(`maps/${tenant.mapId}`).update({ defaultLanguage: 'EN', enabledLanguages: ['EN'] });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // The page loads without error, and the legacy code normalizes to the
    // current registry's own equivalent (`EN` -> `en`).
    await expect(page.getByTestId('public-languages-card')).toBeVisible();
    await expect(page.getByTestId('public-language-checkbox-en')).toBeChecked();
    await expect(page.getByTestId('public-language-default-en')).toBeChecked();
  });

  test('scenarios 3-4: enabling a second language, then setting it as default, saves and persists across reload', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-enable-default@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Fukuoka Ramen Co',
      displayName: 'Fuku Fukuoka',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // scenario 3: enable Japanese alongside the existing default (English).
    await page.getByTestId('public-language-checkbox-ja').check();
    await expect(page.getByTestId('public-language-checkbox-ja')).toBeChecked();

    // scenario 4: make Japanese the new default.
    await page.getByTestId('public-language-default-ja').check();
    await expect(page.getByTestId('public-language-default-ja')).toBeChecked();
    await expect(page.getByTestId('public-language-default-en')).not.toBeChecked();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('public-language-checkbox-ja')).toBeChecked();
    await expect(page.getByTestId('public-language-checkbox-en')).toBeChecked();
    await expect(page.getByTestId('public-language-default-ja')).toBeChecked();

    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.defaultLanguage).toBe('ja');
    expect(mapSnap.data()?.enabledLanguages.sort()).toEqual(['en', 'ja']);
  });

  test('scenario 5: the current default cannot be deselected directly — a new default must be chosen first', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-cant-deselect@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Hiroshima Peace Co',
      displayName: 'Hiro Hiroshima',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // English starts as the default — its checkbox is disabled, preventing
    // a direct uncheck.
    await expect(page.getByTestId('public-language-checkbox-en')).toBeDisabled();

    // The radio for a language that isn't supported yet is also disabled —
    // it must be enabled (checked) before it can become the default.
    await expect(page.getByTestId('public-language-default-ja')).toBeDisabled();

    // Enable Japanese, make it default — English's checkbox becomes
    // enabled (no longer the default), and can now be unchecked.
    await page.getByTestId('public-language-checkbox-ja').check();
    await page.getByTestId('public-language-default-ja').check();
    await expect(page.getByTestId('public-language-checkbox-en')).toBeEnabled();
    await page.getByTestId('public-language-checkbox-en').uncheck();
    await expect(page.getByTestId('public-language-checkbox-en')).not.toBeChecked();
  });

  test('scenario 6: an unsupported/malformed language payload is rejected server-side even if the browser guard is bypassed', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-server-reject@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kanazawa Garden Co',
      displayName: 'Kana Kanazawa',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    const result = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Kanazawa Garden Map',
          mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
          area: { type: 'UNBOUNDED' },
          languages: { defaultLanguage: 'de', supportedLanguages: ['de'] },
        }),
      });
      return { status: response.status };
    }, tenant.mapId);
    expect(result.status).toBe(400);

    // The map's language config is completely untouched.
    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.defaultLanguage).toBe('en');

    // A default not included in supportedLanguages is rejected the same way.
    const resultMismatch = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/maps/${mapId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Kanazawa Garden Map',
          mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
          area: { type: 'UNBOUNDED' },
          languages: { defaultLanguage: 'ko', supportedLanguages: ['ja', 'en'] },
        }),
      });
      return { status: response.status };
    }, tenant.mapId);
    expect(resultMismatch.status).toBe(400);
  });

  test('scenario 7: Save with a changed language config never publishes anything', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-save-not-publish@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Okinawa Beach Co',
      displayName: 'Oki Okinawa',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByTestId('public-language-checkbox-ja').check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const firestore = await getE2eFirestore();
    const mapSnap = await firestore.doc(`maps/${tenant.mapId}`).get();
    expect(mapSnap.data()?.publication).toBeUndefined();
    const publications = await firestore.collection(`maps/${tenant.mapId}/publications`).get();
    expect(publications.empty).toBe(true);
  });

  test('scenario 8: Publish captures the current language config onto the new snapshot', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-publish-captures@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Kumamoto Castle Co',
      displayName: 'Kuma Kumamoto',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await page.getByTestId('public-language-checkbox-ja').check();
    await page.getByTestId('public-language-default-ja').check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const result = await publishViaApi(page, tenant.mapId);
    expect(result.status).toBe(201);

    const firestore = await getE2eFirestore();
    const publicationSnap = await firestore.doc(`maps/${tenant.mapId}/publications/${result.body.publicationId}`).get();
    const publication = publicationSnap.data()!;
    expect(publication.defaultLanguage).toBe('ja');
    expect((publication.supportedLanguages as string[]).sort()).toEqual(['en', 'ja']);
  });

  test('scenario 9: the public map continues to render (existing behavior unchanged) after a multilingual publish', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-public-renders@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nikko Shrine Co',
      displayName: 'Nik Nikko',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    await page.getByTestId('public-language-checkbox-ja').check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();

    const result = await publishViaApi(page, tenant.mapId);
    expect(result.status).toBe(201);

    const publicResult = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/public/maps/${mapId}`);
      return { status: response.status, body: await response.json() };
    }, tenant.mapId);
    expect(publicResult.status).toBe(200);
    expect(publicResult.body.defaultLanguage).toBe('en');
    expect((publicResult.body.supportedLanguages as string[]).sort()).toEqual(['en', 'ja']);
  });

  test('scenario 10: a legacy publication document predating this checkpoint (no language fields at all) still renders via the public read endpoint', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b17a-legacy-publication@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Takayama Old Town Co',
      displayName: 'Taka Takayama',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);
    const result = await publishViaApi(page, tenant.mapId);
    expect(result.status).toBe(201);

    // Simulate a publication document that genuinely predates 1B.17A — real
    // ones never had `defaultLanguage`/`supportedLanguages` fields at all.
    // `FieldValue.delete()` is the Admin SDK's real field-removal sentinel
    // (an `undefined` value in a plain `.update()` object is simply ignored,
    // not a deletion).
    const firestore = await getE2eFirestore();
    const { FieldValue } = await import('firebase-admin/firestore');
    await firestore.doc(`maps/${tenant.mapId}/publications/${result.body.publicationId}`).update({
      defaultLanguage: FieldValue.delete(),
      supportedLanguages: FieldValue.delete(),
    });

    const publicResult = await page.evaluate(async (mapId: string) => {
      const response = await fetch(`/api/public/maps/${mapId}`);
      return { status: response.status, body: await response.json() };
    }, tenant.mapId);
    expect(publicResult.status).toBe(200);
    // Normalized safely to the platform default, never a parse failure.
    expect(publicResult.body.defaultLanguage).toBe('en');
    expect(publicResult.body.supportedLanguages).toEqual(['en']);
  });

  test('scenario 11: a cross-tenant Public Languages update is denied', async ({ page }) => {
    const tenantA = await provisionTestTenant({
      email: 'checkpoint-1b17a-cross-tenant-a@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant A Languages',
      displayName: 'Alice A',
    });
    const tenantB = await provisionTestTenant({
      email: 'checkpoint-1b17a-cross-tenant-b@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Tenant B Languages',
      displayName: 'Bob B',
    });

    await login(page, tenantB);
    const result = await page.evaluate(async (targetMapId: string) => {
      const response = await fetch(`/api/maps/${targetMapId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Forged Cross-Tenant Language Change',
          mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
          area: { type: 'UNBOUNDED' },
          languages: { defaultLanguage: 'ja', supportedLanguages: ['ja'] },
        }),
      });
      return response.status;
    }, tenantA.mapId);
    expect(result).toBe(404);

    const firestore = await getE2eFirestore();
    const mapASnap = await firestore.doc(`maps/${tenantA.mapId}`).get();
    expect(mapASnap.data()?.defaultLanguage).toBe('en');
  });

  test('scenario 12: a signed-out visitor cannot change Public Languages settings', async ({ page }) => {
    await page.goto('/login');
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/maps/map_does_not_matter_0000000/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'x',
          mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
          area: { type: 'UNBOUNDED' },
          languages: { defaultLanguage: 'ja', supportedLanguages: ['ja'] },
        }),
      });
      return response.status;
    });
    expect(result).toBe(401);
  });
});

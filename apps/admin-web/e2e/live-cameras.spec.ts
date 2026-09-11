import { expect, test as base, type Page } from '@playwright/test';
import type { LiveCameraPlayback, PublishedLiveCamera } from 'shared-types';
import type { LiveCameraParsed } from 'validation';
import type { LivePlaybackAdapterFactory } from '../../tourist-web/lib/public-map/live-playback';
import { E2E_BASE_URL, E2E_TOURIST_BASE_URL } from './constants';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant } from './helpers/tenant-fixture';

// Real Firebase-backed Admin/public APIs and the real CameraDetailCard.
// Selection uses the non-production diagnostics boundary, NOT Google markers.
// Actual marker-click wiring is covered by live-camera-marker-layer.test.ts.
const HARBOR: LiveCameraPlayback = { transport: 'HLS', playbackUrl: 'https://relay.example.test/cameras/harbor/index.m3u8' };
const HILL: LiveCameraPlayback = { transport: 'WEBRTC', playbackUrl: 'https://relay.example.test/cameras/hill/whep' };
const LOCATION = { latitude: 35.6812, longitude: 139.7671 };

interface PlaybackEvent {
  readonly kind: 'connect' | 'disconnect';
  readonly playbackUrl: string;
  readonly transport: LiveCameraPlayback['transport'];
  readonly sequence: number;
}
type ObservedWindow = Window & {
  __TOURIST_MAP_E2E__?: { readonly playbackAdapterFactory: LivePlaybackAdapterFactory };
  __LIVE_CAMERA_EVENTS__?: PlaybackEvent[];
};

const test = base.extend<{ relayRequests: string[] }>({
  relayRequests: [async ({ page }, use) => {
    const requests: string[] = [];
    await page.route('https://relay.example.test/**', async (route) => {
      requests.push(route.request().url());
      await route.abort();
    });
    await use(requests);
    expect(requests, 'The deterministic adapter must never request a relay URL').toEqual([]);
  }, { auto: true }],
});

test.beforeEach(async ({ page }) => {
  await clearEmulatorUsers();
  await page.addInitScript(() => {
    const browser = window as ObservedWindow;
    const recorded: PlaybackEvent[] = [];
    browser.__LIVE_CAMERA_EVENTS__ = recorded;
    browser.__TOURIST_MAP_E2E__ = {
      playbackAdapterFactory: () => {
        let active: LiveCameraPlayback | undefined;
        const record = (kind: PlaybackEvent['kind'], playback: LiveCameraPlayback) => {
          recorded.push({ kind, ...playback, sequence: recorded.length + 1 });
        };
        return {
          connect(_container, playback, change) {
            active = playback;
            record('connect', playback);
            change({ status: 'playing' });
          },
          disconnect() {
            if (active) record('disconnect', active);
            active = undefined;
          },
        };
      },
    };
  });
});

async function setup(page: Page, suffix: string) {
  const tenant = await provisionTestTenant({
    email: `live-cameras-${suffix}@example.test`, password: 'LiveCamera-E2E-123!',
    companyName: 'Live Camera E2E', displayName: 'Camera Admin',
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return tenant;
}

async function createViaApi(page: Page, mapId: string, name: string, status: 'ENABLED' | 'DISABLED', playback?: LiveCameraPlayback) {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/cameras`, {
    headers: { Origin: E2E_BASE_URL },
    data: { name, description: `Description for ${name}`, location: LOCATION, status, ...(playback ? { playback } : {}) },
  });
  expect(response.status()).toBe(201);
  const body: { cameraId: string } = await response.json();
  expect(body.cameraId).toEqual(expect.any(String));
  return body.cameraId;
}

async function readDraft(page: Page, mapId: string): Promise<LiveCameraParsed[]> {
  const response = await page.request.get(`${E2E_BASE_URL}/api/maps/${mapId}/cameras`);
  expect(response.status()).toBe(200);
  return (await response.json()).cameras;
}

async function publish(page: Page, mapId: string) {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/publish`, { headers: { Origin: E2E_BASE_URL } });
  expect(response.status()).toBe(201);
}

async function createLiveCamerasMenuItem(page: Page, mapId: string): Promise<void> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/maps/${mapId}/menu-items`, {
    headers: { Origin: E2E_BASE_URL },
    data: { type: 'LIVE_CAMERAS', label: 'Live Cameras', status: 'ENABLED' },
  });
  expect(response.status()).toBe(201);
}

async function readPublic(page: Page, mapId: string): Promise<{ publicationId: string; version: number; liveCameras: PublishedLiveCamera[] }> {
  const response = await page.request.get(`${E2E_BASE_URL}/api/public/maps/${mapId}`);
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).not.toMatch(/rtsp:\/\/|"(?:customerId|username|password|sourceUrl|sourceCredentials|privateSourceUrl)"/i);
  return JSON.parse(text);
}

function cameraRow(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
}

async function createViaUi(page: Page, name: string, description: string) {
  await page.getByRole('button', { name: '+ New Camera', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Live Camera' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('Description', { exact: true }).fill(description);
  await dialog.getByLabel('Latitude', { exact: true }).fill(String(LOCATION.latitude));
  await dialog.getByLabel('Longitude', { exact: true }).fill(String(LOCATION.longitude));
  await dialog.getByRole('button', { name: 'HLS', exact: true }).click();
  await dialog.getByLabel('Relay playback URL').fill(HARBOR.playbackUrl);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cameraRow(page, name)).toBeVisible();
}

async function editViaUi(page: Page, oldName: string, name: string, description: string) {
  await cameraRow(page, oldName).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Live Camera' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('Description', { exact: true }).fill(description);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cameraRow(page, name)).toBeVisible();
}

async function openPublic(page: Page, mapId: string, embed = false) {
  await page.goto(`${E2E_TOURIST_BASE_URL}/maps/${mapId}${embed ? '?embed=1' : ''}`);
  await expect(page.getByTestId('tourist-map-diagnostics')).toHaveAttribute('data-camera-selection-ready', 'true');
  if (embed) await expect(page.getByTestId('tourist-map-shell')).toHaveAttribute('data-embed', '1');
}

async function diagnosticSelect(page: Page, cameraId: string) {
  await page.getByTestId('tourist-map-diagnostics').evaluate((element, id) => {
    element.dispatchEvent(new CustomEvent('tourist-map-e2e-select-camera', { detail: id }));
  }, cameraId);
  await expect(page.getByTestId('tourist-map-diag-selected-camera')).toHaveText(cameraId);
}

async function expectDetail(page: Page, name: string, description: string) {
  await expect(page.getByTestId('camera-detail-card')).toBeVisible();
  await expect(page.getByTestId('camera-detail-name')).toHaveText(name);
  await expect(page.getByTestId('camera-detail-description')).toHaveText(description);
}

async function expectPreview(page: Page, name: string) {
  await expect(page.getByTestId('camera-preview-card')).toBeVisible();
  await expect(page.getByTestId('camera-preview-name')).toHaveText(name);
}

async function events(page: Page) {
  return page.evaluate(() => {
    const recorded = (window as ObservedWindow).__LIVE_CAMERA_EVENTS__;
    if (!recorded) throw new Error('Playback observer was not installed');
    return recorded;
  });
}

function event(kind: PlaybackEvent['kind'], playback: LiveCameraPlayback, sequence: number): PlaybackEvent {
  return { kind, ...playback, sequence };
}

test('Admin create, persisted edit, enable/disable, playback clear and disposable delete', async ({ page }) => {
  const { mapId } = await setup(page, 'crud');
  await page.goto(`/admin/maps/${mapId}/cameras`);
  await createViaUi(page, 'Harbor Live Camera', 'Initial published camera');
  const draft = await readDraft(page, mapId);
  expect(draft).toHaveLength(1);
  expect(draft[0]).toMatchObject({ name: 'Harbor Live Camera', description: 'Initial published camera',
    location: LOCATION, status: 'ENABLED', playback: HARBOR });
  await editViaUi(page, 'Harbor Live Camera', 'Harbor Live Camera Updated', 'Updated draft camera');
  await page.reload();
  const row = cameraRow(page, 'Harbor Live Camera Updated');
  await expect(row).toBeVisible();
  expect((await readDraft(page, mapId))[0]).toMatchObject({ name: 'Harbor Live Camera Updated', description: 'Updated draft camera' });
  await row.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(row.getByRole('cell', { name: 'Disabled', exact: true })).toBeVisible();
  expect((await readDraft(page, mapId))[0]?.status).toBe('DISABLED');
  await row.getByRole('button', { name: 'Enable', exact: true }).click();
  await expect(row.getByRole('cell', { name: 'Enabled', exact: true })).toBeVisible();
  expect((await readDraft(page, mapId))[0]?.status).toBe('ENABLED');

  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Live Camera' });
  await dialog.getByRole('button', { name: 'Not configured', exact: true }).click();
  const clearResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/cameras/'));
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const cleared = await clearResponse;
  expect(cleared.status()).toBe(200);
  expect(cleared.request().postDataJSON()).toMatchObject({ playback: null });
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole('cell', { name: 'Not configured', exact: true })).toBeVisible();
  expect((await readDraft(page, mapId))[0]).not.toHaveProperty('playback');

  const disposable = await createViaApi(page, mapId, 'Disposable Camera', 'DISABLED');
  await page.reload();
  await cameraRow(page, 'Disposable Camera').getByRole('button', { name: 'Delete Disposable Camera', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(cameraRow(page, 'Disposable Camera')).toHaveCount(0);
  expect((await readDraft(page, mapId)).map((camera) => camera.cameraId)).not.toContain(disposable);
});

test('enabled-only public projection, draft isolation and republish through the same public detail', async ({ page }) => {
  // This flow deliberately includes two publishes and four cross-app navigations.
  test.setTimeout(60_000);
  const { mapId } = await setup(page, 'publication');
  await page.goto(`/admin/maps/${mapId}/cameras`);
  await createViaUi(page, 'Harbor Live Camera', 'Initial published camera');
  const harbor = (await readDraft(page, mapId))[0];
  if (!harbor) throw new Error('Created camera missing from Admin API');
  const disabledId = await createViaApi(page, mapId, 'Disabled Camera', 'DISABLED', HILL);
  await publish(page, mapId);
  const initial = await readPublic(page, mapId);
  // Exact equality is also an allowlist: no admin/private fields or credentials.
  expect(initial.liveCameras).toEqual([{ cameraId: harbor.cameraId, name: 'Harbor Live Camera',
    description: 'Initial published camera', location: LOCATION, playback: HARBOR }]);
  expect(initial.liveCameras.map((camera) => camera.cameraId)).not.toContain(disabledId);
  await openPublic(page, mapId);
  await expect(page.getByTestId('tourist-map-diag-camera-count')).toHaveText('1');
  await diagnosticSelect(page, harbor.cameraId);
  await expectPreview(page, 'Harbor Live Camera');
  // A draft-only ID cannot be selected through this published-data boundary.
  await page.getByTestId('tourist-map-diagnostics').evaluate((element, id) => {
    element.dispatchEvent(new CustomEvent('tourist-map-e2e-select-camera', { detail: id }));
  }, disabledId);
  await expect(page.getByTestId('tourist-map-diag-selected-camera')).toHaveText(harbor.cameraId);

  await page.goto(`${E2E_BASE_URL}/admin/maps/${mapId}/cameras`);
  await editViaUi(page, 'Harbor Live Camera', 'Harbor Live Camera Updated', 'Updated draft camera');
  expect((await readDraft(page, mapId)).find((camera) => camera.cameraId === harbor.cameraId)).toMatchObject({
    name: 'Harbor Live Camera Updated', description: 'Updated draft camera',
  });
  expect(await readPublic(page, mapId)).toEqual(initial);
  await openPublic(page, mapId);
  await diagnosticSelect(page, harbor.cameraId);
  await expectPreview(page, 'Harbor Live Camera');
  await page.getByTestId('camera-preview-footer').click();
  await expectDetail(page, 'Harbor Live Camera', 'Initial published camera');
  await expect(page.getByTestId('camera-detail-card')).not.toContainText('Harbor Live Camera Updated');
  await expect(page.getByTestId('camera-detail-card')).not.toContainText('Updated draft camera');
  await publish(page, mapId);
  const updated = await readPublic(page, mapId);
  expect(updated.publicationId).not.toBe(initial.publicationId);
  expect(updated.version).toBe(initial.version + 1);
  expect(updated.liveCameras).toEqual([{ ...initial.liveCameras[0], name: 'Harbor Live Camera Updated', description: 'Updated draft camera' }]);
  await openPublic(page, mapId);
  await diagnosticSelect(page, harbor.cameraId);
  await expectPreview(page, 'Harbor Live Camera Updated');
});

test('camera menu/preview selection, detail transition, teardown and mobile embed parity', async ({ page, relayRequests }) => {
  test.setTimeout(60_000);
  const { mapId } = await setup(page, 'lifecycle');
  const harbor = await createViaApi(page, mapId, 'Harbor Live Camera', 'ENABLED', HARBOR);
  const hill = await createViaApi(page, mapId, 'Hill Live Camera', 'ENABLED', HILL);
  await createViaApi(page, mapId, 'Disabled Camera', 'DISABLED', HILL);
  await createLiveCamerasMenuItem(page, mapId);
  await publish(page, mapId);
  expect((await readPublic(page, mapId)).liveCameras.map((camera) => camera.cameraId).sort()).toEqual([harbor, hill].sort());

  for (const embed of [false, true]) {
    await page.setViewportSize(embed ? { width: 390, height: 780 } : { width: 1280, height: 900 });
    await openPublic(page, mapId, embed);
    await expect(page.getByTestId('tourist-map-diag-camera-count')).toHaveText('2');
    await expect(page.getByTestId('public-menu-live-cameras')).toHaveCount(1);
    await expect(page.locator('[data-testid^="public-menu-camera-"]')).toHaveCount(0);
    await page.getByTestId('public-menu-live-cameras').click();
    await expect(page.getByTestId('camera-preview-card')).toHaveCount(0);
    expect(await events(page)).toEqual([]);
    await diagnosticSelect(page, harbor);
    await expectPreview(page, 'Harbor Live Camera');
    expect(await events(page)).toEqual([event('connect', HARBOR, 1)]);
    await page.getByTestId('camera-preview-footer').click();
    await expectDetail(page, 'Harbor Live Camera', 'Description for Harbor Live Camera');
    await expect(page.getByTestId('camera-detail-playback')).toHaveAttribute('data-state', 'playing');
    expect(await events(page)).toEqual([event('connect', HARBOR, 1), event('disconnect', HARBOR, 2), event('connect', HARBOR, 3)]);
    await page.getByRole('button', { name: 'Close camera details', exact: true }).click();
    await expect(page.getByTestId('camera-detail-card')).toHaveCount(0);
    const closed = [event('connect', HARBOR, 1), event('disconnect', HARBOR, 2), event('connect', HARBOR, 3), event('disconnect', HARBOR, 4)];
    expect(await events(page)).toEqual(closed);

    await diagnosticSelect(page, harbor);
    await expectPreview(page, 'Harbor Live Camera');
    const harborAgain = [...closed, event('connect', HARBOR, 5)];
    expect(await events(page)).toEqual(harborAgain);
    await diagnosticSelect(page, hill);
    await expectPreview(page, 'Hill Live Camera');
    const switched = [...harborAgain, event('disconnect', HARBOR, 6), event('connect', HILL, 7)];
    expect(await events(page)).toEqual(switched);
    await page.getByTestId('camera-preview-footer').click();
    await expectDetail(page, 'Hill Live Camera', 'Description for Hill Live Camera');
    await expect(page.getByTestId('camera-detail-playback')).toHaveAttribute('data-state', 'playing');
    const hillDetail = [...switched, event('disconnect', HILL, 8), event('connect', HILL, 9)];
    expect(await events(page)).toEqual(hillDetail);
    await page.getByRole('button', { name: 'Close camera details', exact: true }).click();
    await expect(page.getByTestId('camera-detail-card')).toHaveCount(0);
    expect(await events(page)).toEqual([...hillDetail, event('disconnect', HILL, 10)]);
    expect(relayRequests).toEqual([]);
  }
  // Navigation destroys the page's observer. Close and keyed camera switch above
  // prove cleanup behavior without unload instrumentation or arbitrary waits.
});

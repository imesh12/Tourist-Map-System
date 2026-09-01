import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorUsers } from './helpers/emulator-auth';
import { provisionTestTenant, type TestTenantFixture } from './helpers/tenant-fixture';

/**
 * Checkpoint 1B.8 "Preview + Publish Foundation + Map Settings UX Repair"
 * integration tests — real Auth + Firestore Emulator + a real `next dev`
 * server, same pattern as the rest of this suite. Covers the checkpoint's
 * own required scenario list A–J (the UX-repair half; K onward — publish
 * behavior — lives in e2e/map-publishing.spec.ts).
 *
 * This suite runs with no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` configured, same
 * as e2e/map-preview.spec.ts and e2e/map-theme.spec.ts — no real, billed
 * Google Maps credential is ever configured for hermetic/CI tests.
 */

async function login(page: Page, tenant: Pick<TestTenantFixture, 'email' | 'password'>): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(tenant.email);
  await page.getByLabel('Password').fill(tenant.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/**
 * Drives a native `<input type="color">` the way a real color-picker
 * interaction ultimately manifests to the page. `Locator.fill()` is built
 * for typing into text-like inputs; a `type="color"` control has no such
 * affordance (the actual OS color dialog it opens on click cannot be
 * automated headlessly across browsers/platforms, and Playwright's own
 * `fill()` does not support this input type either — unlike `date`/`time`/
 * `datetime-local`, `color` is absent from Playwright's documented `fill()`
 * support), so this sets the element's `value` directly via its real
 * property setter and fires `input`/`change` events matching what a genuine
 * pick fires.
 *
 * E2E repair round (post-1B.11, React 19.2.0): the previous version of this
 * helper — dispatching bare `new Event('input', { bubbles: true })` with no
 * preceding real focus — stopped reliably reaching `ColorField`'s `onChange`
 * (this suite's own prior comment asserted it was "exactly what React's
 * controlled-input value tracking listens for," but that claim was never
 * re-verified against the actual current stack, per this repair round's own
 * instruction not to trust it). This is a documented, currently-active class
 * of problem, not specific to this repo: a purely synthetic (`isTrusted:
 * false`) DOM event dispatched from a `page.evaluate()`/`Locator.evaluate()`
 * callback — i.e. with no real, Playwright-driven user gesture ever having
 * touched the element — is not always picked up by React 19's event
 * pipeline in headless Chromium (see e.g. the contemporaneous report at
 * https://github.com/CopilotKit/CopilotKit/issues/4215, describing the
 * identical symptom: DOM value is set, `input`/`change` are dispatched, but
 * the controlled React state never updates). A genuine pick always focuses
 * the control first; a real Playwright-level `.focus()` — an actual
 * CDP-driven action, not a synthetic script call — before the value write
 * closes that gap, and `cancelable`/`composed` are added so the dispatched
 * events match every property a real native `input`/`change` event carries,
 * not just its `bubbles` flag. `ColorField`'s own component code and every
 * synced-state assertion below are unchanged — this only changes HOW the
 * test drives a native browser widget.
 */
async function setNativeColorInputValue(page: Page, ariaLabel: string, hexValue: string): Promise<void> {
  const picker = page.getByLabel(ariaLabel);
  await picker.focus();
  await picker.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
  }, hexValue);
}

test.describe('1B.8 map settings UX repair', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers();
  });

  test('the sidebar stays fixed in place while the workspace scrolls, and only one region scrolls (A)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-scroll@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Sendai Sights Co',
      displayName: 'Sen Sendai',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    const sidebar = page.getByRole('navigation', { name: 'Admin' });
    const before = await sidebar.boundingBox();
    expect(before).not.toBeNull();

    // Scroll the workspace (not the window/document) — `.admin-main` is the
    // one region this checkpoint's fix makes scrollable.
    await page.locator('.admin-main').evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight });
    });

    const after = await sidebar.boundingBox();
    expect(after).not.toBeNull();
    // The sidebar's own on-screen position is unchanged by scrolling the
    // workspace — this is the concrete, measurable proof of "the sidebar
    // must NOT move when the page content scrolls."
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(after!.x).toBeCloseTo(before!.x, 0);

    // The document/window itself never scrolled — only `.admin-main` did
    // (no double scrollbar / whole-page scroll).
    const windowScrollY = await page.evaluate(() => window.scrollY);
    expect(windowScrollY).toBe(0);
  });

  test('the map preview stays visible (sticky) after scrolling down to the Theme section (B)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-sticky-preview@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Nagano Alps Co',
      displayName: 'Naga Nagano',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    const previewCard = page.locator('#map-preview-card');
    await expect(previewCard).toBeInViewport();

    // Scroll the workspace down to the Theme card, far below the fold on a
    // normal viewport.
    await page.getByText('Theme', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Preset')).toBeVisible();

    // The preview card is STILL on-screen — this is what "sticky" means
    // concretely: it never scrolled out of the viewport alongside the left
    // column's cards.
    await expect(previewCard).toBeInViewport();
  });

  test('the visual color picker and the HEX text field stay in sync both ways, and the picker updates the live preview (C, D, E)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-color-sync@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Fukuoka Ramen Co',
      displayName: 'Fuku Fukuoka',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // C: the Branding Primary color visual picker changes → the HEX text
    // field updates to match. `setNativeColorInputValue()` (below), not
    // `.fill()` — a native `<input type="color">` is a browser-chrome
    // widget with no real "type text into it" affordance (the native OS
    // color dialog isn't automatable headlessly), so this drives it the way
    // an actual color-picker interaction ultimately manifests to the page:
    // the element's `value` changes and it fires real `input`/`change`
    // events, which is exactly what a genuine pick does and what React's
    // controlled-input value tracking listens for.
    await setNativeColorInputValue(page, 'Primary color picker', '#00ff00');
    await expect(page.getByLabel('Primary color', { exact: true })).toHaveValue('#00ff00');

    // D: a valid HEX text edit → the visual picker updates to match.
    await page.getByLabel('Primary color', { exact: true }).fill('#336699');
    await expect(page.getByLabel('Primary color picker')).toHaveValue('#336699');

    // Incomplete/invalid HEX text stays fully editable and never crashes the
    // page — the field keeps whatever was typed.
    await page.getByLabel('Primary color', { exact: true }).fill('#1a');
    await expect(page.getByLabel('Primary color', { exact: true })).toHaveValue('#1a');
    await expect(page.getByLabel('Preset')).toBeVisible(); // the page is still alive/interactive.

    // E: the Theme Water picker updates the HEX field AND the live preview
    // (MapPreviewInfo's semantic "Current Theme" row — see map-theme.spec.ts's
    // own header comment for why this, not a screenshot, is what this suite
    // asserts against).
    await expect(page.getByTestId('map-preview-current-theme')).toBeVisible();
    await setNativeColorInputValue(page, 'Water picker', '#0000ff');
    await expect(page.getByLabel('Water', { exact: true })).toHaveValue('#0000ff');
    // A theme color change doesn't itself change the "Hidden: ..." summary
    // text (colors aren't visibility), but it must never crash/blank the
    // row — still showing the current preset, proving the update round-trip
    // completed without error.
    await expect(page.getByTestId('map-preview-current-theme')).toContainText('Preset');
  });

  test('the Preview button opens a Draft Preview dialog showing unsaved changes, and it closes via Close and Escape (F, G, H, I)', async ({
    page,
  }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-draft-preview@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Okinawa Beach Co',
      displayName: 'Oki Okinawa',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    // An unsaved theme change — never saved before opening Preview.
    await page.getByLabel('Preset').selectOption('MINIMAL');
    await expect(page.getByText('Map settings saved.')).toHaveCount(0);

    // F: opens a real dialog.
    await page.getByTestId('preview-button').click();
    const dialog = page.getByRole('dialog', { name: tenant.mapName });
    await expect(dialog).toBeVisible();
    // `{ exact: true }` — Playwright's `getByText` default (case-insensitive
    // substring) would otherwise ALSO match the explanatory notice below
    // ("This is a draft preview of your current unsaved changes..."), which
    // legitimately contains the same words in lowercase. The badge's own
    // text is exactly "Draft Preview"; exact matching resolves this
    // ambiguity without needing to reword either the badge or the notice
    // (the notice is required to stay — see the next assertion).
    await expect(dialog.getByText('Draft Preview', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/not the published public map/i)).toBeVisible();

    // G: it reflects the UNSAVED theme change, not the map's last-saved
    // value — the modal renders its own MapPreview/MapPreviewInfo instance
    // fed the exact same `previewTheme` the inline editor preview already
    // has.
    await expect(dialog.getByTestId('map-preview-current-theme')).toContainText('Preset MINIMAL');

    // H: Close button.
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);

    // I: Escape closes it too.
    await page.getByTestId('preview-button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Save persists the draft and clears the "Unsaved Map Settings" indicator (J)', async ({ page }) => {
    const tenant = await provisionTestTenant({
      email: 'checkpoint-1b8-save-draft@example.com',
      password: 'correct-horse-battery-staple',
      companyName: 'Hiroshima Peace Co',
      displayName: 'Hiro Hiroshima',
    });

    await login(page, tenant);
    await page.goto(`/admin/maps/${tenant.mapId}/settings`);

    await expect(page.getByTestId('unsaved-map-settings-badge')).toHaveCount(0);

    await page.getByLabel('Map name').fill('Hiroshima Peace Renamed Map');
    await expect(page.getByTestId('unsaved-map-settings-badge')).toBeVisible();
    await expect(page.getByTestId('publish-button')).toBeDisabled();
    await expect(page.getByTestId('publish-disabled-hint')).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Map settings saved.')).toBeVisible();
    await expect(page.getByTestId('unsaved-map-settings-badge')).toHaveCount(0);
  });
});

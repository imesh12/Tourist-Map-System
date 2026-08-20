/**
 * Firebase Auth Emulator REST helpers for e2e test setup — checkpoint 1A.4
 * §11/§17.
 *
 * Talks directly to the Auth Emulator's REST API (never real Firebase
 * Authentication, never a real Google account) to create/clear ordinary
 * test users before each test. This is the standard emulator-only pattern:
 * the emulator accepts any non-empty string as an API key.
 */

import { E2E_AUTH_EMULATOR_HOST, E2E_FIREBASE_PROJECT_ID } from '../constants';
import { getE2eAdminAuth } from './e2e-admin-app';

// Prefer the live env var if set (e.g. `firebase emulators:exec` can assign
// a different port than the default), falling back to the same constant
// `playwright.config.ts` injects via `E2E_APP_ENV` — a single source of
// truth, so these can never silently drift apart and create a mismatch
// between where test users are seeded and what the browser SDK connects to.
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? E2E_AUTH_EMULATOR_HOST;
const EMULATOR_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? E2E_FIREBASE_PROJECT_ID;
const FAKE_API_KEY = 'fake-api-key-for-emulator-only';

export async function createEmulatorUser(email: string, password: string): Promise<void> {
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create emulator test user (${response.status}): ${await response.text()}`);
  }
}

/**
 * Wipes all Auth Emulator users for this project — keeps each test run on
 * fresh, deterministic state rather than accumulating users across runs
 * (same "no hidden local state" policy carried forward from checkpoint
 * 1A.3 §12).
 */
export async function clearEmulatorUsers(): Promise<void> {
  const response = await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear emulator users (${response.status}): ${await response.text()}`);
  }
}

/**
 * Disables an existing emulator test user — checkpoint 1A.7 §5/§11 ("if
 * practical and supported by emulator").
 *
 * The Auth Emulator's own Identity Toolkit REST surface only accepts
 * `disableUser` from a *privileged* (OAuth2-authenticated) caller — plain
 * unauthenticated REST calls (the pattern `createEmulatorUser`/
 * `clearEmulatorUsers` above use) cannot set it. Rather than guess at an
 * emulator-only bearer-token convention for that REST endpoint, this uses
 * the shared `firebase-admin` app from `./e2e-admin-app` — the same,
 * already-proven-in-this-repo mechanism checkpoint 1A.5's provisioning
 * tests use against the Auth+Firestore emulators.
 */
export async function disableEmulatorUser(email: string): Promise<void> {
  const auth = await getE2eAdminAuth();
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { disabled: true });
}

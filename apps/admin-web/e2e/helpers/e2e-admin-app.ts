/**
 * A single shared, explicitly-configured `firebase-admin` app for E2E test
 * setup — checkpoint 1A.7 (`disableEmulatorUser`) and 1A.8 (Firestore tenant
 * fixtures) both need real Admin SDK access to the emulators from within
 * the Playwright *test-runner* process itself (as opposed to the `next dev`
 * server process Playwright spawns with an explicit `webServer.env`).
 *
 * Deliberately does NOT reuse `apps/admin-web/lib/firebase/admin.ts`'s own
 * singleton: that module resolves its project ID from `process.env.
 * FIREBASE_PROJECT_ID`, and checkpoint 1A.5's repair round already
 * established that `firebase emulators:exec` is not proven to set ambient
 * project-ID env vars for every process it wraps. Passing `projectId`
 * explicitly here removes that dependency entirely, and one shared `App`
 * instance (name `'e2e-admin'`) is reused by every e2e helper so a second
 * file importing this one never hits a "default app already exists" error.
 */

import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { E2E_AUTH_EMULATOR_HOST, E2E_FIREBASE_PROJECT_ID, E2E_FIRESTORE_EMULATOR_HOST } from '../constants';

// Prefer the live env var if set, falling back to the same constants
// `playwright.config.ts` injects via `E2E_APP_ENV` — a single source of
// truth shared with the browser-facing config, so these can never silently
// drift apart.
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? E2E_AUTH_EMULATOR_HOST;
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? E2E_FIRESTORE_EMULATOR_HOST;
const EMULATOR_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? E2E_FIREBASE_PROJECT_ID;

let e2eAdminApp: App | undefined;

export async function getE2eAdminApp(): Promise<App> {
  // Idempotent — the Admin SDK reads these at call time, not only at
  // `initializeApp()` time, but setting them explicitly here (rather than
  // assuming they're already present in this process's environment) is
  // what makes this helper self-contained.
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;

  if (!e2eAdminApp) {
    const { initializeApp } = await import('firebase-admin/app');
    e2eAdminApp = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'e2e-admin');
  }
  return e2eAdminApp;
}

export async function getE2eAdminAuth(): Promise<Auth> {
  const app = await getE2eAdminApp();
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(app);
}

export async function getE2eAdminFirestore(): Promise<Firestore> {
  const app = await getE2eAdminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(app);
}

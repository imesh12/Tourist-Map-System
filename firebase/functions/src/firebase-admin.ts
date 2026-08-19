import { getApp, getApps, initializeApp, type App, type AppOptions } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Lazy Admin SDK singleton for Cloud Functions — mirrors the pattern in
 * apps/admin-web/lib/firebase/admin.ts for consistency across the codebase.
 *
 * In a deployed Cloud Functions environment, the runtime itself provides
 * project identity and Application Default Credentials automatically — no
 * key material configured here (see docs/stages/STAGE_1A_TECHNICAL_PLAN.md
 * §5), and `FIREBASE_PROJECT_ID` does not need to be set for that case.
 * `FIREBASE_PROJECT_ID` is read explicitly (rather than relying on ambient
 * ADC/project detection) only so local test runs can pin the project
 * deterministically — see vitest.provisioning.config.ts — using the exact
 * same env var name apps/admin-web/lib/firebase/admin.ts already uses, for
 * consistency. Locally, `firebase emulators:exec`/`emulators:start` set
 * `FIREBASE_AUTH_EMULATOR_HOST`/`FIRESTORE_EMULATOR_HOST` — the Admin SDK
 * auto-detects both env vars on its own; no credential is needed either
 * way, and none is read by this module.
 */
let cachedApp: App | undefined;

function resolveAdminAppOptions(): AppOptions {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  return projectId ? { projectId } : {};
}

function getAdminApp(): App {
  if (cachedApp) {
    return cachedApp;
  }
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(resolveAdminAppOptions());
  return cachedApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

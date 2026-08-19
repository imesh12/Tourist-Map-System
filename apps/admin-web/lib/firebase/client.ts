import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

/**
 * Browser-only Firebase client initialization — checkpoint 1A.4.
 *
 * Scope deliberately minimal: only the Firebase App + Auth SDKs are
 * initialized here. Firestore is NOT initialized in this checkpoint — no
 * client-side Firestore reads/writes are part of the authentication
 * foundation (the dashboard's own Firestore reads arrive in 1A.8).
 *
 * Safety properties:
 * - `assertBrowser()` throws immediately if this module is evaluated on the
 *   server (no Admin SDK usage, no server secrets — see `../firebase/admin`
 *   for the separate, server-only module).
 * - `getApps().length > 0 ? getApp() : initializeApp(...)` is the standard
 *   Firebase-recommended idiom for "initialize exactly once" — safe under
 *   Next.js dev/hot-reload, which can re-evaluate client modules without a
 *   full page reload.
 * - Only `NEXT_PUBLIC_*` values are read. No service-account material, no
 *   server secret, ever touches this file.
 */

function assertBrowser(): void {
  if (typeof window === 'undefined') {
    throw new Error(
      'lib/firebase/client.ts must only be evaluated in the browser. ' +
        'Use lib/firebase/admin.ts for server-side Firebase access.',
    );
  }
}

interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
}

function readFirebaseWebConfig(): FirebaseWebConfig {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    // Configuration errors fail fast and loud rather than misbehaving
    // silently at runtime — docs/stages/STAGE_1A_TECHNICAL_PLAN.md §18
    // ("configuration" error category).
    throw new Error(
      `Missing required Firebase web configuration: ${missing.join(', ')}. ` +
        'Copy apps/admin-web/.env.example to .env.local and fill in the NEXT_PUBLIC_FIREBASE_* values.',
    );
  }

  return config as FirebaseWebConfig;
}

let cachedApp: FirebaseApp | undefined;
let cachedAuth: Auth | undefined;
let authEmulatorConnected = false;

export function getFirebaseApp(): FirebaseApp {
  assertBrowser();
  if (cachedApp) {
    return cachedApp;
  }
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(readFirebaseWebConfig());
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  assertBrowser();
  if (cachedAuth) {
    return cachedAuth;
  }

  const auth = getAuth(getFirebaseApp());

  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && !authEmulatorConnected) {
    const host = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
    // `disableWarnings` only suppresses the emulator's own "do not use in
    // production" console warning banner — it has no effect on behavior.
    connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
    authEmulatorConnected = true;
  }

  cachedAuth = auth;
  return cachedAuth;
}

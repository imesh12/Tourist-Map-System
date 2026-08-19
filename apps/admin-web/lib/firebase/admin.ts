import { cert, getApp, getApps, initializeApp, type App, type AppOptions } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Server-only Firebase Admin initialization — checkpoint 1A.4.
 *
 * Production credential strategy (documented here, not implemented beyond
 * what local development needs — see docs/stages/STAGE_1A_TECHNICAL_PLAN.md
 * §5):
 * - Deployed environments should rely on Application Default Credentials —
 *   no key material configured in this repository. Omitting `credential`
 *   from the options passed to `initializeApp()` lets the Admin SDK resolve
 *   ADC automatically on a GCP-hosted runtime.
 * - Local development against the Auth Emulator needs no real credential at
 *   all — the Admin SDK routes Auth calls to the emulator once the
 *   `FIREBASE_AUTH_EMULATOR_HOST` environment variable is set (this is a
 *   Firebase Admin SDK convention read automatically; no code here needs to
 *   check for it explicitly). See apps/admin-web/.env.example.
 * - If a real service-account key is ever genuinely required locally (a
 *   non-GCP deploy target, for instance), it is supplied only via the
 *   `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` environment variables —
 *   never a committed JSON key file (see the root `.gitignore`).
 *
 * This module does not implement tenant provisioning and does not load
 * customer/map ownership data — see `lib/auth/verify-session.ts` for the
 * only thing this checkpoint actually needs the Admin SDK for (verifying a
 * Firebase ID token / session cookie).
 */

function assertServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'lib/firebase/admin.ts must only be evaluated on the server. ' +
        'Use lib/firebase/client.ts for browser-side Firebase access.',
    );
  }
}

/**
 * Pure, side-effect-free credential resolution — exported separately from
 * `getFirebaseAdminApp()` so it can be unit tested without actually calling
 * Firebase's `initializeApp()` (which has real side effects and would
 * require a live emulator/ADC environment to succeed in a test).
 */
export function resolveFirebaseAdminAppOptions(
  env: Readonly<Partial<Record<'FIREBASE_PROJECT_ID' | 'FIREBASE_CLIENT_EMAIL' | 'FIREBASE_PRIVATE_KEY', string>>>,
): AppOptions {
  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  // Service-account private keys are commonly stored in env vars with
  // literal `\n` escape sequences (since real newlines are awkward in most
  // env-var storage mechanisms) — normalize back to real newlines.
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return { projectId, credential: cert({ projectId, clientEmail, privateKey }) };
  }

  // No explicit service-account values supplied: let the Admin SDK fall
  // back to Application Default Credentials (deployed environments) or
  // emulator-only operation (local dev with FIREBASE_AUTH_EMULATOR_HOST
  // set — no real credential needed at all). Passing `projectId` alone
  // when we have it avoids relying on ADC's own project-id inference.
  return projectId ? { projectId } : {};
}

let cachedApp: App | undefined;
let cachedAuth: Auth | undefined;

export function getFirebaseAdminApp(): App {
  assertServer();
  if (cachedApp) {
    return cachedApp;
  }

  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  const options = resolveFirebaseAdminAppOptions({
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  });

  // One-time, first-initialization-only diagnostic — checkpoint 1A.4 E2E
  // repair round 3. Every value logged here is either a boolean, a project
  // ID, or a host:port string; none is a credential, token, or cookie. This
  // exists because prior repair rounds proved the BROWSER's connection to
  // the Auth Emulator works (wrong-password reaches Firebase and returns
  // `auth/wrong-password`), but nothing has yet proven or disproven that
  // *this* module — evaluated inside the separate `next dev` server
  // process — actually sees `FIREBASE_AUTH_EMULATOR_HOST`/
  // `FIREBASE_PROJECT_ID` at the moment it initializes the Admin SDK. If
  // `emulatorHostConfigured` logs `false` here during `pnpm test:e2e`, that
  // is direct proof the env values `playwright.config.ts`'s `webServer.env`
  // injects are not reaching this process, which would explain
  // `verifyIdToken`/`createSessionCookie` failing without needing to guess.
  console.info(
    JSON.stringify({
      event: 'firebase.admin.init',
      projectId: options.projectId ?? null,
      hasCredential: 'credential' in options,
      emulatorHostConfigured: Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST),
      emulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? null,
    }),
  );

  cachedApp = initializeApp(options);
  return cachedApp;
}

export function getFirebaseAdminAuth(): Auth {
  assertServer();
  if (cachedAuth) {
    return cachedAuth;
  }
  cachedAuth = getAuth(getFirebaseAdminApp());
  return cachedAuth;
}

/**
 * `provisionClient` provisioning tests — checkpoint 1A.5.
 *
 * Runs the REAL core provisioning logic against REAL Auth + Firestore
 * emulators via the Admin SDK (the exact same `getAdminAuth()`/
 * `getAdminFirestore()` singletons `register-client.ts` uses in
 * production) — never mocked. Deliberately does NOT go through the
 * Callable HTTPS transport (the `onCall` wrapper in register-client.ts);
 * that wrapper is a thin, well-trodden Firebase SDK layer (input parsing +
 * error translation only), while everything security/idempotency/
 * compensation-relevant lives in `provisionClient` itself, which this suite
 * exercises directly and exhaustively.
 *
 * Must run with Auth + Firestore emulators active — see
 * package.json's `test:provisioning` script, which wraps this in
 * `firebase emulators:exec --only auth,firestore` so
 * FIREBASE_AUTH_EMULATOR_HOST/FIRESTORE_EMULATOR_HOST are set automatically
 * for the duration of the run (same pattern as
 * test/security-rules/firestore.rules.test.ts from checkpoint 1A.3).
 *
 * Covers every scenario docs/stages/STAGE_1A_TECHNICAL_PLAN.md §20's
 * "Provisioning" row requires: normal success path; duplicate/double-
 * submitted registration (idempotency); retry after a simulated partial
 * failure; simulated failure after the Firestore batch (compensation runs,
 * no orphaned Auth user, no orphaned Firestore docs). Scheduled-
 * reconciliation testing is out of scope (Amendment 2 — that function is
 * deferred, not implemented).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getAdminAuth, getAdminFirestore } from '../../src/firebase-admin.js';
import { generateCustomerId, generateMapId } from '../../src/ids.js';
import { provisionClient } from '../../src/provisioning/provision-client.js';

const PROJECT_ID = 'touristmap-local';
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

async function clearAuthEmulator(): Promise<void> {
  const response = await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to clear Auth emulator users (${response.status}): ${await response.text()}`);
  }
}

async function clearFirestoreEmulator(): Promise<void> {
  const response = await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`Failed to clear Firestore emulator data (${response.status}): ${await response.text()}`);
  }
}

let uniqueCounter = 0;
function uniqueEmail(): string {
  uniqueCounter += 1;
  return `provision-test-${uniqueCounter}-${Date.now()}@example.com`;
}

function baseInput(email: string) {
  return {
    companyName: 'JR West',
    clientType: 'RAILWAY' as const,
    contactName: 'Taro Yamada',
    email,
    password: 'correct-horse-battery-staple',
  };
}

beforeEach(async () => {
  await clearAuthEmulator();
  await clearFirestoreEmulator();
});

describe('provisionClient — checkpoint 1A.5', () => {
  it('provisions a brand-new tenant end to end (normal success path)', async () => {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const email = uniqueEmail();

    const result = await provisionClient(baseInput(email), { auth, firestore, generateCustomerId, generateMapId });

    expect(result.customerId).toMatch(/^cust_/);
    expect(result.mapId).toMatch(/^map_/);

    const userRecord = await auth.getUserByEmail(email);
    expect(userRecord.customClaims).toEqual({ customerId: result.customerId, role: 'CLIENT_ADMIN' });

    const customerDoc = await firestore.doc(`customers/${result.customerId}`).get();
    expect(customerDoc.exists).toBe(true);
    const customerData = customerDoc.data()!;
    expect(customerData.companyName).toBe('JR West');
    expect(customerData.clientType).toBe('RAILWAY');
    expect(customerData.status).toBe('ACTIVE');
    expect(customerData.provisioning.status).toBe('COMPLETE');
    expect(customerData.provisioning.startedAt).toBeTruthy();
    expect(customerData.provisioning.completedAt).toBeTruthy();

    const userDoc = await firestore.doc(`users/${userRecord.uid}`).get();
    expect(userDoc.exists).toBe(true);
    const userData = userDoc.data()!;
    expect(userData.customerId).toBe(result.customerId);
    expect(userData.role).toBe('CLIENT_ADMIN');
    expect(userData.email).toBe(email);
    expect(userData.status).toBe('ACTIVE');

    const mapDoc = await firestore.doc(`maps/${result.mapId}`).get();
    expect(mapDoc.exists).toBe(true);
    const mapData = mapDoc.data()!;
    expect(mapData.customerId).toBe(result.customerId);
    expect(mapData.name).toBe('JR West Tourist Map');
    expect(mapData.status).toBe('DRAFT');
    // checkpoint 1B.17A — `provisionClient()` now stamps the
    // `PublicContentLanguage` registry's own default ('en'), not the retired
    // `Language`/`LANGUAGES` enum's `'EN'`; see provision-client.ts's own
    // updated doc comment.
    expect(mapData.defaultLanguage).toBe('en');
    expect(mapData.enabledLanguages).toEqual(['en']);
    // checkpoint 1B.16 — a tenant's first map is created with the clean
    // default theme (the `TOURISM` preset) already persisted.
    expect(mapData.theme.preset).toBe('TOURISM');
    expect(mapData.theme.visibility).toMatchObject({ businessPois: false, roadLabels: false, buildings: false, placeLabels: false, roads: true });
  });

  it('honors an explicit initialMapName instead of the derived default', async () => {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const email = uniqueEmail();

    const result = await provisionClient(
      { ...baseInput(email), initialMapName: 'Kyoto Station Map' },
      { auth, firestore, generateCustomerId, generateMapId },
    );

    const mapDoc = await firestore.doc(`maps/${result.mapId}`).get();
    expect(mapDoc.data()!.name).toBe('Kyoto Station Map');
  });

  it('rejects a genuine duplicate registration for an already-fully-provisioned email, without creating a second tenant', async () => {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const email = uniqueEmail();
    const input = baseInput(email);

    const first = await provisionClient(input, { auth, firestore, generateCustomerId, generateMapId });

    await expect(provisionClient(input, { auth, firestore, generateCustomerId, generateMapId })).rejects.toMatchObject({
      code: 'provisioning/duplicate-email',
    });

    // Only one Auth user, one customer, one map — the duplicate attempt
    // must not have created anything new.
    expect((await firestore.collection('users').get()).size).toBe(1);
    expect((await firestore.collection('customers').get()).size).toBe(1);
    expect((await firestore.collection('maps').get()).size).toBe(1);

    const customerDoc = await firestore.doc(`customers/${first.customerId}`).get();
    expect(customerDoc.data()!.provisioning.status).toBe('COMPLETE');
  });

  it('resumes an interrupted registration (Auth user exists, no Firestore docs yet) instead of creating a duplicate Auth account', async () => {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const email = uniqueEmail();
    const input = baseInput(email);

    // Simulate the "process killed between createUser and the batched
    // write" gap described in docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10:
    // an Auth user exists, but no users/{uid} doc does yet.
    const orphanedAuthUser = await auth.createUser({ email, password: input.password, displayName: input.contactName });

    const result = await provisionClient(input, { auth, firestore, generateCustomerId, generateMapId });

    // Same uid reused — no second Auth account created for this email.
    const userRecord = await auth.getUserByEmail(email);
    expect(userRecord.uid).toBe(orphanedAuthUser.uid);

    const customerDoc = await firestore.doc(`customers/${result.customerId}`).get();
    expect(customerDoc.data()!.provisioning.status).toBe('COMPLETE');
    const userDoc = await firestore.doc(`users/${orphanedAuthUser.uid}`).get();
    expect(userDoc.exists).toBe(true);
    expect(userDoc.data()!.customerId).toBe(result.customerId);
  });

  it('runs compensation on a later failure: deletes a freshly-created Auth user and rolls back the Firestore docs it just wrote', async () => {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const email = uniqueEmail();
    const input = baseInput(email);

    await expect(
      provisionClient(input, {
        auth,
        firestore,
        generateCustomerId,
        generateMapId,
        // Inject a failure at the one step that runs AFTER the Firestore
        // batch has already committed, to prove compensation covers more
        // than just "the batch commit itself threw".
        setCustomClaims: async () => {
          throw new Error('simulated setCustomUserClaims failure');
        },
      }),
    ).rejects.toMatchObject({ code: 'provisioning/failed' });

    // The Auth user THIS invocation created must not survive the failure.
    await expect(auth.getUserByEmail(email)).rejects.toMatchObject({ code: 'auth/user-not-found' });

    // No orphaned Firestore docs left behind either.
    expect((await firestore.collection('customers').get()).size).toBe(0);
    expect((await firestore.collection('users').get()).size).toBe(0);
    expect((await firestore.collection('maps').get()).size).toBe(0);
  });

  it('does not delete a REUSED (retry) Auth user when a later step fails again', async () => {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const email = uniqueEmail();
    const input = baseInput(email);

    const orphanedAuthUser = await auth.createUser({ email, password: input.password, displayName: input.contactName });

    await expect(
      provisionClient(input, {
        auth,
        firestore,
        generateCustomerId,
        generateMapId,
        setCustomClaims: async () => {
          throw new Error('simulated setCustomUserClaims failure');
        },
      }),
    ).rejects.toMatchObject({ code: 'provisioning/failed' });

    // The pre-existing Auth user (not created by this invocation) must
    // survive — it wasn't this call's to delete, and a future retry needs
    // it to still be findable by email.
    const userRecord = await auth.getUserByEmail(email);
    expect(userRecord.uid).toBe(orphanedAuthUser.uid);
  });
});

/**
 * Firestore tenant-isolation rules suite — checkpoint 1A.6.
 *
 * Supersedes the 1A.3 deny-by-default smoke test now that
 * `firebase/firestore.rules` contains real claims-based tenant logic (see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §12/§20). Proves the full
 * acceptance matrix: same-tenant reads allowed, cross-tenant reads denied,
 * unauthenticated denied, missing/wrong claims denied, ownership/role
 * fields immutable from the client, privilege escalation impossible, and
 * an unknown collection stays denied by the fallback rule.
 *
 * Fixture documents are seeded via `testEnv.withSecurityRulesDisabled()`
 * (an Admin-SDK-equivalent, rules-bypassing context) rather than through
 * normal client writes — the rules under test intentionally deny every
 * client write to `customers`/`users`/`maps`, so client writes could never
 * seed fixtures in the first place. This exactly mirrors how the real
 * `registerClient` Callable Function (checkpoint 1A.5) writes these
 * documents in production: via the privileged Admin SDK, which bypasses
 * security rules by design.
 *
 * Must run against the Firestore emulator (never mocked, never against
 * production) — see package.json's `test:rules` script, which only ever
 * runs this file through `firebase emulators:exec` (so
 * FIRESTORE_EMULATOR_HOST is set automatically for the duration of the
 * run).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Matches the "default" project alias in firebase/.firebaserc — an
// obviously local-only identity, never a real Firebase project.
const LOCAL_PROJECT_ID = 'touristmap-local';

// --- Fixture identities -----------------------------------------------
// Two independent tenants ("A" and "B"), each with a customer, a map, and
// at least one user — enough to exercise every same-tenant/cross-tenant/
// self/teammate combination the acceptance matrix requires.
const TENANT_A = 'cust_tenant_a';
const TENANT_B = 'cust_tenant_b';
const MAP_A = 'map_tenant_a_1';
const MAP_B = 'map_tenant_b_1';
const UID_A_ADMIN = 'uid_a_admin';
const UID_A_EDITOR = 'uid_a_editor';
const UID_B_ADMIN = 'uid_b_admin';
// A user with no Firestore doc at all and no useful claims — used for the
// "missing claim" scenario.
const UID_NO_CLAIM = 'uid_no_claim';
// A real Auth uid whose (hypothetically forged/stale) claim points at a
// customerId that doesn't correspond to any tenant this uid actually
// belongs to — used for the "wrong claim" scenario.
const UID_WRONG_CLAIM = 'uid_wrong_claim';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: LOCAL_PROJECT_ID,
    firestore: {
      rules: readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

/**
 * Seeds the two-tenant fixture set via a rules-bypassing context — see the
 * file-level doc comment for why this, not a client write, is how fixtures
 * are created. Field names/shapes mirror packages/shared-types exactly
 * (Customer/User/TouristMap), so these fixtures are exactly what
 * `registerClient` (checkpoint 1A.5) would actually persist.
 */
async function seedFixtures(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, `customers/${TENANT_A}`), {
      customerId: TENANT_A,
      companyName: 'Tenant A Railways',
      clientType: 'RAILWAY',
      status: 'ACTIVE',
      primaryContactName: 'Tenant A Admin',
      primaryContactEmail: 'admin@tenant-a.example.com',
      provisioning: { status: 'COMPLETE', startedAt: serverTimestamp(), completedAt: serverTimestamp() },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, `customers/${TENANT_B}`), {
      customerId: TENANT_B,
      companyName: 'Tenant B Hotels',
      clientType: 'HOTEL',
      status: 'ACTIVE',
      primaryContactName: 'Tenant B Admin',
      primaryContactEmail: 'admin@tenant-b.example.com',
      provisioning: { status: 'COMPLETE', startedAt: serverTimestamp(), completedAt: serverTimestamp() },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, `users/${UID_A_ADMIN}`), {
      uid: UID_A_ADMIN,
      customerId: TENANT_A,
      role: 'CLIENT_ADMIN',
      email: 'a-admin@tenant-a.example.com',
      displayName: 'A Admin',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, `users/${UID_A_EDITOR}`), {
      uid: UID_A_EDITOR,
      customerId: TENANT_A,
      role: 'CLIENT_EDITOR',
      email: 'a-editor@tenant-a.example.com',
      displayName: 'A Editor',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, `users/${UID_B_ADMIN}`), {
      uid: UID_B_ADMIN,
      customerId: TENANT_B,
      role: 'CLIENT_ADMIN',
      email: 'b-admin@tenant-b.example.com',
      displayName: 'B Admin',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, `maps/${MAP_A}`), {
      mapId: MAP_A,
      customerId: TENANT_A,
      name: 'Tenant A Railways Tourist Map',
      status: 'DRAFT',
      defaultLanguage: 'EN',
      enabledLanguages: ['EN'],
      mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
      area: { type: 'UNBOUNDED' },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, `maps/${MAP_B}`), {
      mapId: MAP_B,
      customerId: TENANT_B,
      name: 'Tenant B Hotels Tourist Map',
      status: 'DRAFT',
      defaultLanguage: 'EN',
      enabledLanguages: ['EN'],
      mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
      area: { type: 'UNBOUNDED' },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

function unauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function aAdminDb() {
  return testEnv.authenticatedContext(UID_A_ADMIN, { customerId: TENANT_A, role: 'CLIENT_ADMIN' }).firestore();
}

function aEditorDb() {
  return testEnv.authenticatedContext(UID_A_EDITOR, { customerId: TENANT_A, role: 'CLIENT_EDITOR' }).firestore();
}

function bAdminDb() {
  return testEnv.authenticatedContext(UID_B_ADMIN, { customerId: TENANT_B, role: 'CLIENT_ADMIN' }).firestore();
}

/** Authenticated, but with no customerId/role claims at all. */
function noClaimDb() {
  return testEnv.authenticatedContext(UID_NO_CLAIM).firestore();
}

/** Authenticated, with a customerId claim that matches no real tenant. */
function wrongClaimDb() {
  return testEnv.authenticatedContext(UID_WRONG_CLAIM, { customerId: 'cust_does_not_exist', role: 'CLIENT_ADMIN' }).firestore();
}

describe('firestore.rules — checkpoint 1A.6 tenant isolation', () => {
  describe('unauthenticated', () => {
    it('denies a customer read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(unauthedDb(), `customers/${TENANT_A}`)));
    });

    it('denies a user read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(unauthedDb(), `users/${UID_A_ADMIN}`)));
    });

    it('denies a map read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(unauthedDb(), `maps/${MAP_A}`)));
    });

    it('denies every write (customer, user, map)', async () => {
      await seedFixtures();
      await assertFails(setDoc(doc(unauthedDb(), 'customers/cust_forged'), { probe: true }));
      await assertFails(updateDoc(doc(unauthedDb(), `users/${UID_A_ADMIN}`), { displayName: 'Hacked' }));
      await assertFails(setDoc(doc(unauthedDb(), 'maps/map_forged'), { probe: true }));
    });
  });

  describe('same tenant', () => {
    it('allows reading own customer', async () => {
      await seedFixtures();
      await assertSucceeds(getDoc(doc(aAdminDb(), `customers/${TENANT_A}`)));
    });

    it('allows reading a same-tenant map', async () => {
      await seedFixtures();
      await assertSucceeds(getDoc(doc(aAdminDb(), `maps/${MAP_A}`)));
    });

    it('allows reading own user doc', async () => {
      await seedFixtures();
      await assertSucceeds(getDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`)));
    });

    it('allows reading a same-customer teammate user doc', async () => {
      await seedFixtures();
      await assertSucceeds(getDoc(doc(aAdminDb(), `users/${UID_A_EDITOR}`)));
    });
  });

  describe('cross tenant', () => {
    it('denies reading another customer', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(aAdminDb(), `customers/${TENANT_B}`)));
    });

    it('denies reading another tenant map', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_B}`)));
    });

    it('denies reading another tenant user', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(aAdminDb(), `users/${UID_B_ADMIN}`)));
    });
  });

  describe('claims', () => {
    it('denies access when the customerId claim is missing entirely', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(noClaimDb(), `customers/${TENANT_A}`)));
    });

    it('denies access when the customerId claim does not match any real tenant', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(wrongClaimDb(), `customers/${TENANT_A}`)));
    });
  });

  describe('customer writes', () => {
    it('denies create', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), 'customers/cust_forged'), {
          customerId: 'cust_forged',
          companyName: 'Forged',
          clientType: 'OTHER',
          status: 'ACTIVE',
        }),
      );
    });

    it('denies update', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `customers/${TENANT_A}`), { companyName: 'Renamed' }));
    });

    it('denies delete', async () => {
      await seedFixtures();
      await assertFails(deleteDoc(doc(aAdminDb(), `customers/${TENANT_A}`)));
    });
  });

  describe('map writes', () => {
    it('denies create', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), 'maps/map_forged'), {
          mapId: 'map_forged',
          customerId: TENANT_A,
          name: 'Forged Map',
          status: 'DRAFT',
        }),
      );
    });

    it('denies update, even to an own-tenant map', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `maps/${MAP_A}`), { name: 'Renamed' }));
    });

    it('denies delete', async () => {
      await seedFixtures();
      await assertFails(deleteDoc(doc(aAdminDb(), `maps/${MAP_A}`)));
    });
  });

  describe('user writes', () => {
    it('allows a self-service displayName-only update', async () => {
      await seedFixtures();
      await assertSucceeds(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { displayName: 'New Name' }));
    });

    it('allows a self-service displayName + updatedAt update', async () => {
      await seedFixtures();
      await assertSucceeds(
        updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { displayName: 'New Name', updatedAt: serverTimestamp() }),
      );
    });

    it('denies a role mutation, even alongside an otherwise-allowed field', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { displayName: 'New Name', role: 'SUPER_ADMIN' }));
    });

    it('denies a customerId mutation', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { customerId: TENANT_B }));
    });

    it('denies a status mutation', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { status: 'DISABLED' }));
    });

    it('denies an email mutation', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { email: 'new@example.com' }));
    });

    it('denies a uid mutation', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { uid: 'someone-else' }));
    });

    it('denies a createdAt mutation', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { createdAt: serverTimestamp() }));
    });

    it('denies updating another user\'s displayName', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_EDITOR}`), { displayName: 'Hacked' }));
    });

    it('denies create', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), 'users/uid_forged'), {
          uid: 'uid_forged',
          customerId: TENANT_A,
          role: 'CLIENT_ADMIN',
          email: 'forged@example.com',
          displayName: 'Forged',
          status: 'ACTIVE',
        }),
      );
    });

    it('denies delete', async () => {
      await seedFixtures();
      await assertFails(deleteDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`)));
    });
  });

  describe('privilege escalation', () => {
    it('CLIENT_ADMIN cannot change their own role', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { role: 'SUPER_ADMIN' }));
    });

    it('CLIENT_ADMIN cannot move their own user doc to another customer', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `users/${UID_A_ADMIN}`), { customerId: TENANT_B }));
    });

    it('CLIENT_EDITOR cannot modify the protected role field', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aEditorDb(), `users/${UID_A_EDITOR}`), { role: 'CLIENT_ADMIN' }));
    });

    it('CLIENT_EDITOR cannot modify the protected customerId field', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aEditorDb(), `users/${UID_A_EDITOR}`), { customerId: TENANT_B }));
    });

    it('a forged query filter for another tenant cannot bypass the tenant boundary (tenant-scoped query)', async () => {
      await seedFixtures();
      // Tenant B's admin queries `maps` filtered for TENANT_A — the query
      // filter is entirely client-controlled and proves nothing on its
      // own; the rules engine still evaluates every candidate document's
      // REAL `customerId` field against the caller's REAL token claim, so
      // this must be denied exactly like a direct getDoc would be.
      const forgedQuery = query(collection(bAdminDb(), 'maps'), where('customerId', '==', TENANT_A));
      await assertFails(getDocs(forgedQuery));
    });

    it('a legitimate tenant-scoped query returns only that tenant\'s documents', async () => {
      await seedFixtures();
      const ownQuery = query(collection(aAdminDb(), 'maps'), where('customerId', '==', TENANT_A));
      const snapshot = await assertSucceeds(getDocs(ownQuery));
      expect(snapshot.docs.map((d) => d.id)).toEqual([MAP_A]);
    });
  });

  describe('unknown collection', () => {
    it('denies authenticated access to a collection with no explicit rule', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(aAdminDb(), 'unknownCollection/doc1')));
    });
  });
});

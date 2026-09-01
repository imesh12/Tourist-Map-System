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
// A SECOND map owned by TENANT_A — checkpoint 1B.6's "customer → N maps"
// model. The rules under test (`match /maps/{mapId}`) were already written
// with no per-tenant-map-count assumption baked in (ownership is purely
// "does this map's own `customerId` match the caller's claim", evaluated
// per-document) — this fixture and the 1B.6 describe block below near the
// end of this file are what actually PROVES that, rather than merely
// asserting it from reading the rule text.
const MAP_A2 = 'map_tenant_a_2';
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

    // Checkpoint 1B.6 — a SECOND map sharing TENANT_A's own `customerId`,
    // same document shape as MAP_A. Nothing else about TENANT_A's fixtures
    // changes; this is purely additive.
    await setDoc(doc(db, `maps/${MAP_A2}`), {
      mapId: MAP_A2,
      customerId: TENANT_A,
      name: 'Tenant A Railways Second Map',
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
      // Checkpoint 1B.6: TENANT_A now owns TWO maps (MAP_A, MAP_A2) — both
      // must come back, and MAP_B (tenant B's) must not, proving the query
      // is scoped by the real per-document `customerId` field, not merely
      // "the first map this tenant happens to own".
      const ownQuery = query(collection(aAdminDb(), 'maps'), where('customerId', '==', TENANT_A));
      const snapshot = await assertSucceeds(getDocs(ownQuery));
      expect(snapshot.docs.map((d) => d.id).sort()).toEqual([MAP_A, MAP_A2].sort());
    });
  });

  describe('multi-map tenant foundation — checkpoint 1B.6', () => {
    // The rules file itself needed NO changes for "customer → N maps"
    // (`match /maps/{mapId}` already evaluates ownership per-document, with
    // no assumption that a tenant owns at most one) — this block is the
    // proof, not merely a restatement of that claim.
    it('the owning tenant can read BOTH of their own maps', async () => {
      await seedFixtures();
      await assertSucceeds(getDoc(doc(aAdminDb(), `maps/${MAP_A}`)));
      await assertSucceeds(getDoc(doc(aAdminDb(), `maps/${MAP_A2}`)));
    });

    it('a different tenant cannot read either of the owning tenant\'s maps', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(bAdminDb(), `maps/${MAP_A}`)));
      await assertFails(getDoc(doc(bAdminDb(), `maps/${MAP_A2}`)));
    });

    it('client writes remain denied for a second/additional map too, not just the first', async () => {
      await seedFixtures();
      await assertFails(updateDoc(doc(aAdminDb(), `maps/${MAP_A2}`), { name: 'Renamed' }));
      await assertFails(deleteDoc(doc(aAdminDb(), `maps/${MAP_A2}`)));
      await assertFails(setDoc(doc(unauthedDb(), `maps/${MAP_A2}`), { probe: true }));
    });

    it('an unauthenticated caller is denied reading the second map exactly like the first', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(unauthedDb(), `maps/${MAP_A2}`)));
    });
  });

  describe('unknown collection', () => {
    it('denies authenticated access to a collection with no explicit rule', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(aAdminDb(), 'unknownCollection/doc1')));
    });
  });

  describe('maps/{mapId}/categories subcollection — checkpoint 1B.2', () => {
    // Category CMS data is server-only (docs/stages/STAGE_1B_TECHNICAL_PLAN.md
    // 1B.2): all reads/writes go through the trusted `/api/map/categories`
    // Route Handler (Admin SDK, which bypasses rules by design), never the
    // browser's own Firestore client. No explicit `match` block exists for
    // this nested collection, so the deny-by-default `match /{document=**}`
    // fallback already covers it — these tests prove that remains true,
    // rather than assuming it, exactly like `unknown collection` above does
    // for a bare top-level example.
    it('denies an own-tenant category read, even for the map owner', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/categories/cat_seed`), {
          categoryId: 'cat_seed',
          customerId: TENANT_A,
          mapId: MAP_A,
          name: 'Restaurants',
          icon: 'FOOD',
          enabled: true,
          order: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_A}/categories/cat_seed`)));
    });

    it('denies an own-tenant category write', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), `maps/${MAP_A}/categories/cat_forged`), {
          categoryId: 'cat_forged',
          customerId: TENANT_A,
          mapId: MAP_A,
          name: 'Forged',
          icon: 'OTHER',
          enabled: true,
          order: 0,
        }),
      );
    });

    it('denies an unauthenticated category read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(unauthedDb(), `maps/${MAP_A}/categories/cat_seed`)));
    });
  });

  describe('maps/{mapId}/pages subcollection — checkpoint 1B.11', () => {
    // Same "server-only, deny-by-default fallback" shape as the categories
    // block above: Pages CMS data goes exclusively through the trusted
    // `/api/maps/{mapId}/pages` Route Handlers (Admin SDK, which bypasses
    // rules by design), never the browser's own Firestore client. No
    // explicit `match` block exists for this nested collection either, so
    // the deny-by-default `match /{document=**}` fallback already covers
    // it — these tests prove that remains true for Pages specifically,
    // rather than assuming the categories proof generalizes (§15 of the
    // checkpoint: "update rules/tests as necessary... do not weaken existing
    // rules to make tests easier" — this block proves no weakening was
    // needed at all).
    it('denies an own-tenant page read, even for the map owner', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/pages/page_seed`), {
          pageId: 'page_seed',
          customerId: TENANT_A,
          mapId: MAP_A,
          title: 'Wi-Fi Guide',
          content: 'Network: Guest\nPassword: welcome',
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_A}/pages/page_seed`)));
    });

    it('denies an own-tenant page write', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), `maps/${MAP_A}/pages/page_forged`), {
          pageId: 'page_forged',
          customerId: TENANT_A,
          mapId: MAP_A,
          title: 'Forged',
          content: 'Forged content',
          status: 'ENABLED',
        }),
      );
    });

    it('denies an unauthenticated page read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(unauthedDb(), `maps/${MAP_A}/pages/page_seed`)));
    });
  });

  describe('maps/{mapId}/pois subcollection — checkpoint 1B.3', () => {
    // Same "server-only, deny-by-default fallback" shape as the categories
    // block immediately above: POI data goes exclusively through the
    // trusted `/api/map/pois` Route Handlers (Admin SDK, which bypasses
    // rules by design), never the browser's own Firestore client. No
    // explicit `match` block exists for this nested collection either, so
    // the deny-by-default `match /{document=**}` fallback already covers
    // it — these tests prove that remains true for POIs specifically,
    // rather than assuming the categories proof generalizes.
    it('denies an own-tenant POI read, even for the map owner', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/pois/poi_seed`), {
          poiId: 'poi_seed',
          customerId: TENANT_A,
          mapId: MAP_A,
          categoryId: 'cat_seed',
          name: 'Sakura Restaurant',
          location: { latitude: 35.6812, longitude: 139.7671 },
          sourceType: 'CLIENT_CUSTOM',
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_A}/pois/poi_seed`)));
    });

    it('denies an own-tenant POI write', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), `maps/${MAP_A}/pois/poi_forged`), {
          poiId: 'poi_forged',
          customerId: TENANT_A,
          mapId: MAP_A,
          categoryId: 'cat_seed',
          name: 'Forged',
          location: { latitude: 0, longitude: 0 },
          sourceType: 'CLIENT_CUSTOM',
          status: 'ENABLED',
        }),
      );
    });

    it('denies an own-tenant POI update and delete', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/pois/poi_seed_2`), {
          poiId: 'poi_seed_2',
          customerId: TENANT_A,
          mapId: MAP_A,
          categoryId: 'cat_seed',
          name: 'Sakura Restaurant',
          location: { latitude: 35.6812, longitude: 139.7671 },
          sourceType: 'CLIENT_CUSTOM',
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(updateDoc(doc(aAdminDb(), `maps/${MAP_A}/pois/poi_seed_2`), { status: 'DISABLED' }));
      await assertFails(deleteDoc(doc(aAdminDb(), `maps/${MAP_A}/pois/poi_seed_2`)));
    });

    it('denies an unauthenticated POI read', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/pois/poi_seed`), {
          poiId: 'poi_seed',
          customerId: TENANT_A,
          mapId: MAP_A,
          categoryId: 'cat_seed',
          name: 'Sakura Restaurant',
          location: { latitude: 35.6812, longitude: 139.7671 },
          sourceType: 'CLIENT_CUSTOM',
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(getDoc(doc(unauthedDb(), `maps/${MAP_A}/pois/poi_seed`)));
    });

    it('denies a cross-tenant POI read even with a well-formed but wrong-tenant path', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_B}/pois/poi_tenant_b`), {
          poiId: 'poi_tenant_b',
          customerId: TENANT_B,
          mapId: MAP_B,
          categoryId: 'cat_seed_b',
          name: 'Tenant B Cafe',
          location: { latitude: 1, longitude: 1 },
          sourceType: 'CLIENT_CUSTOM',
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      // Tenant A's own authenticated client, reading tenant B's POI path —
      // denied the same way the top-level cross-tenant map/category tests
      // above are, and for the same reason (deny-by-default fallback, no
      // rule exists to even consider `request.auth.token.customerId` here).
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_B}/pois/poi_tenant_b`)));
    });

    it('denies a read/write of a Google Places-imported POI (checkpoint 1B.4 — no new Firestore path)', async () => {
      // Checkpoint 1B.4 adds `provider`/`providerPlaceId` fields and a
      // `sourceType: 'GOOGLE_PLACES'` value, but writes them through this
      // EXACT SAME `maps/{mapId}/pois/{poiId}` path via the Admin SDK
      // (`POST /api/map/pois/import`) — no new collection, no rules change.
      // This proves the existing deny-by-default fallback already covers an
      // imported POI's document shape too, not just a manual one.
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/pois/poi_imported`), {
          poiId: 'poi_imported',
          customerId: TENANT_A,
          mapId: MAP_A,
          categoryId: 'cat_seed',
          name: 'Sakura Sushi Bar',
          location: { latitude: 35.6812, longitude: 139.7671 },
          sourceType: 'GOOGLE_PLACES',
          provider: 'GOOGLE',
          providerPlaceId: 'places/fake-restaurant-1',
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_A}/pois/poi_imported`)));
      await assertFails(updateDoc(doc(aAdminDb(), `maps/${MAP_A}/pois/poi_imported`), { status: 'DISABLED' }));
    });
  });

  describe('maps/{mapId}/menuItems subcollection — checkpoint 1B.5', () => {
    // Same "server-only, deny-by-default fallback" shape as the
    // categories/POIs blocks above: Menu Builder data goes exclusively
    // through the trusted `/api/map/menu-items` Route Handlers (Admin SDK,
    // which bypasses rules by design), never the browser's own Firestore
    // client. No explicit `match` block exists for this nested collection
    // either, so the deny-by-default `match /{document=**}` fallback
    // already covers it — these tests prove that remains true for menu
    // items specifically, rather than assuming the categories/POIs proofs
    // generalize.
    it('denies an own-tenant CATEGORY menu item read, even for the map owner', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/menuItems/menu_seed`), {
          menuItemId: 'menu_seed',
          customerId: TENANT_A,
          mapId: MAP_A,
          type: 'CATEGORY',
          label: 'Gourmet',
          categoryId: 'cat_seed',
          order: 0,
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_A}/menuItems/menu_seed`)));
    });

    it('denies an own-tenant FEATURE menu item read, write, and delete', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/menuItems/menu_seed_feature`), {
          menuItemId: 'menu_seed_feature',
          customerId: TENANT_A,
          mapId: MAP_A,
          type: 'FEATURE',
          label: 'Search',
          featureKey: 'SEARCH',
          order: 1,
          status: 'ENABLED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_A}/menuItems/menu_seed_feature`)));
      await assertFails(updateDoc(doc(aAdminDb(), `maps/${MAP_A}/menuItems/menu_seed_feature`), { status: 'DISABLED' }));
      await assertFails(deleteDoc(doc(aAdminDb(), `maps/${MAP_A}/menuItems/menu_seed_feature`)));
    });

    it('denies an own-tenant menu item write', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), `maps/${MAP_A}/menuItems/menu_forged`), {
          menuItemId: 'menu_forged',
          customerId: TENANT_A,
          mapId: MAP_A,
          type: 'FEATURE',
          label: 'Forged',
          featureKey: 'SEARCH',
          order: 0,
          status: 'ENABLED',
        }),
      );
    });

    it('denies an unauthenticated menu item read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(unauthedDb(), `maps/${MAP_A}/menuItems/menu_seed`)));
    });
  });

  describe('maps/{mapId}/publications subcollection — checkpoint 1B.8', () => {
    // Same "server-only, deny-by-default fallback" shape as the categories/
    // pois/menuItems blocks above: a publication is created exclusively by
    // `POST /api/maps/{mapId}/publish` (Admin SDK, which bypasses rules by
    // design — see that route's own doc comment), never by the browser's
    // own Firestore client. No explicit `match` block exists for this
    // nested collection either, so the deny-by-default `match /{document=**}`
    // fallback already covers it — these tests prove that remains true for
    // publications specifically, including for the map's OWN admin (the one
    // tenant who might plausibly expect read/write access to their own
    // map's data), not merely assumed by generalizing from the other
    // subcollections' proofs.
    it('denies an own-tenant publication read, even for the map owner', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/publications/pub_seed`), {
          schemaVersion: 1,
          publicationId: 'pub_seed',
          mapId: MAP_A,
          customerId: TENANT_A,
          version: 1,
          publishedAt: serverTimestamp(),
          publishedByUid: UID_A_ADMIN,
          map: {
            name: 'Tenant A Map',
            mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
            area: { type: 'UNBOUNDED' },
            theme: { preset: 'DEFAULT', markerStyle: 'PIN', visibility: {} },
          },
          menu: [],
          categories: [],
          pois: [],
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_A}/publications/pub_seed`)));
    });

    it('denies a client from creating a publication directly, even a well-formed own-tenant one', async () => {
      await seedFixtures();
      await assertFails(
        setDoc(doc(aAdminDb(), `maps/${MAP_A}/publications/pub_forged`), {
          schemaVersion: 1,
          publicationId: 'pub_forged',
          mapId: MAP_A,
          customerId: TENANT_A,
          version: 1,
          publishedAt: serverTimestamp(),
          publishedByUid: UID_A_ADMIN,
          map: {
            name: 'Forged Publish',
            mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
            area: { type: 'UNBOUNDED' },
            theme: { preset: 'DEFAULT', markerStyle: 'PIN', visibility: {} },
          },
          menu: [],
          categories: [],
          pois: [],
        }),
      );
    });

    it('denies a client from updating or deleting an existing publication', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/publications/pub_seed_2`), {
          schemaVersion: 1,
          publicationId: 'pub_seed_2',
          mapId: MAP_A,
          customerId: TENANT_A,
          version: 1,
          publishedAt: serverTimestamp(),
          publishedByUid: UID_A_ADMIN,
          map: {
            name: 'Tenant A Map',
            mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
            area: { type: 'UNBOUNDED' },
            theme: { preset: 'DEFAULT', markerStyle: 'PIN', visibility: {} },
          },
          menu: [],
          categories: [],
          pois: [],
        });
      });
      await assertFails(updateDoc(doc(aAdminDb(), `maps/${MAP_A}/publications/pub_seed_2`), { version: 2 }));
      await assertFails(deleteDoc(doc(aAdminDb(), `maps/${MAP_A}/publications/pub_seed_2`)));
    });

    it('denies an unauthenticated publication read', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_A}/publications/pub_seed_3`), {
          schemaVersion: 1,
          publicationId: 'pub_seed_3',
          mapId: MAP_A,
          customerId: TENANT_A,
          version: 1,
          publishedAt: serverTimestamp(),
          publishedByUid: UID_A_ADMIN,
          map: {
            name: 'Tenant A Map',
            mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
            area: { type: 'UNBOUNDED' },
            theme: { preset: 'DEFAULT', markerStyle: 'PIN', visibility: {} },
          },
          menu: [],
          categories: [],
          pois: [],
        });
      });
      await assertFails(getDoc(doc(unauthedDb(), `maps/${MAP_A}/publications/pub_seed_3`)));
    });

    it('denies a cross-tenant publication read even with a well-formed but wrong-tenant path', async () => {
      await seedFixtures();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `maps/${MAP_B}/publications/pub_tenant_b`), {
          schemaVersion: 1,
          publicationId: 'pub_tenant_b',
          mapId: MAP_B,
          customerId: TENANT_B,
          version: 1,
          publishedAt: serverTimestamp(),
          publishedByUid: UID_B_ADMIN,
          map: {
            name: 'Tenant B Map',
            mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
            area: { type: 'UNBOUNDED' },
            theme: { preset: 'DEFAULT', markerStyle: 'PIN', visibility: {} },
          },
          menu: [],
          categories: [],
          pois: [],
        });
      });
      await assertFails(getDoc(doc(aAdminDb(), `maps/${MAP_B}/publications/pub_tenant_b`)));
    });

    it('denies a client write to the map document\'s own publication pointer field', async () => {
      await seedFixtures();
      // `maps/{mapId}` already denies ALL client writes outright (`allow
      // write: if false` — see firestore.rules), so a client can never set
      // even a single field, `publication` included. This test targets the
      // `publication` pointer specifically (rather than re-proving the
      // already-covered "map writes" describe block above) because it is
      // the exact field `POST /api/maps/{mapId}/publish` itself updates —
      // proving a client cannot forge that same field directly is the
      // publishing feature's own security-relevant claim, not merely an
      // instance of a more generic rule.
      await assertFails(
        updateDoc(doc(aAdminDb(), `maps/${MAP_A}`), {
          publication: { currentPublicationId: 'pub_forged', version: 999, publishedAt: serverTimestamp(), publishedByUid: UID_A_ADMIN },
        }),
      );
    });
  });
});

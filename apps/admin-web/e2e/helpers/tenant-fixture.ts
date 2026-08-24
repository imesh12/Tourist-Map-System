/**
 * Deterministic test-tenant seeding for E2E — checkpoint 1A.8 §10/§11.
 *
 * Produces the same end state checkpoint 1A.5's real `provisionClient()`
 * produces (an Auth user with `customerId`/`role` custom claims, plus
 * `users/{uid}`, `customers/{customerId}`, `maps/{mapId}` Firestore docs —
 * checked with the same shared-types field shapes / ID prefixes the real
 * provisioning function uses) via the Admin SDK directly against the
 * Auth + Firestore emulators, rather than invoking the actual
 * `registerClient` Callable Function over its HTTPS transport.
 *
 * That's a deliberate scope decision, not a shortcut taken without
 * consideration: `firebase/functions` is a separate app (not a published
 * workspace library the way `shared-types`/`validation` are — no `dist`/
 * `exports` a third package can import), and wiring a genuine cross-package
 * import plus starting the Functions emulator (`firebase.json` — not
 * currently part of `pnpm test:e2e`'s `--only auth,firestore`) is
 * meaningfully more moving parts than this checkpoint's own instruction to
 * "not make the E2E setup unnecessarily complex" calls for. What this DOES
 * reuse is the real, shared data model: `CUSTOMER_ID_PREFIX`/`MAP_ID_PREFIX`
 * from `shared-types`, and every field this writes matches
 * `packages/shared-types/src/{customer,user,map}.ts` exactly — a fixture
 * built from the same source of truth the real provisioning path uses, not
 * a parallel invented shape.
 *
 * The browser itself always signs in through the real login UI / session-
 * cookie flow afterward (`lib/auth/complete-login.ts` → `POST
 * /api/auth/session`) — this module only seeds backend state, it never
 * injects a session cookie or otherwise bypasses login.
 */

import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CUSTOMER_ID_PREFIX, MAP_ID_PREFIX } from 'shared-types';
import { getE2eAdminAuth, getE2eAdminFirestore } from './e2e-admin-app';

function generateId(prefix: string): string {
  return `${prefix}${randomBytes(15).toString('base64url')}`;
}

export interface TestTenantFixture {
  readonly email: string;
  readonly password: string;
  readonly uid: string;
  readonly customerId: string;
  readonly mapId: string;
  readonly companyName: string;
  readonly mapName: string;
  readonly displayName: string;
  readonly role: 'CLIENT_ADMIN' | 'CLIENT_EDITOR';
}

export interface ProvisionTestTenantOptions {
  readonly email: string;
  readonly password: string;
  readonly companyName: string;
  readonly displayName: string;
  readonly mapName?: string;
  /** Defaults to `'COMPLETE'` — pass `'PENDING'`/`'FAILED'` to test the §16 gate. */
  readonly provisioningStatus?: 'COMPLETE' | 'PENDING' | 'FAILED';
  readonly role?: 'CLIENT_ADMIN' | 'CLIENT_EDITOR';
}

/**
 * Seeds a full, internally-consistent tenant: Auth user ↔ custom claims ↔
 * `users/{uid}` ↔ `customers/{customerId}` ↔ `maps/{mapId}`. Returns every
 * generated ID so tests can seed a SECOND, independent tenant (for
 * cross-tenant isolation tests) and reference both by their real IDs rather
 * than guessing.
 */
export async function provisionTestTenant(options: ProvisionTestTenantOptions): Promise<TestTenantFixture> {
  const auth = await getE2eAdminAuth();
  const firestore = await getE2eAdminFirestore();

  const userRecord = await auth.createUser({
    email: options.email,
    password: options.password,
    displayName: options.displayName,
  });
  const uid = userRecord.uid;
  const customerId = generateId(CUSTOMER_ID_PREFIX);
  const mapId = generateId(MAP_ID_PREFIX);
  const role = options.role ?? 'CLIENT_ADMIN';
  const provisioningStatus = options.provisioningStatus ?? 'COMPLETE';
  const mapName = options.mapName ?? `${options.companyName} Tourist Map`;

  const batch = firestore.batch();

  batch.set(firestore.doc(`customers/${customerId}`), {
    customerId,
    companyName: options.companyName,
    clientType: 'OTHER',
    status: 'ACTIVE',
    primaryContactName: options.displayName,
    primaryContactEmail: options.email,
    provisioning: {
      status: provisioningStatus,
      startedAt: FieldValue.serverTimestamp(),
      ...(provisioningStatus === 'COMPLETE' ? { completedAt: FieldValue.serverTimestamp() } : {}),
      ...(provisioningStatus === 'FAILED' ? { lastError: 'e2e fixture: simulated provisioning failure' } : {}),
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(firestore.doc(`users/${uid}`), {
    uid,
    customerId,
    role,
    email: options.email,
    displayName: options.displayName,
    status: 'ACTIVE',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(firestore.doc(`maps/${mapId}`), {
    mapId,
    customerId,
    name: mapName,
    status: 'DRAFT',
    defaultLanguage: 'EN',
    enabledLanguages: ['EN'],
    mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
    area: { type: 'UNBOUNDED' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Custom claims are what every server-side authorization check actually
  // trusts (§6/§12) — set only after the Firestore docs they describe
  // already exist, matching the real provisioning function's own ordering.
  await auth.setCustomUserClaims(uid, { customerId, role });

  return {
    email: options.email,
    password: options.password,
    uid,
    customerId,
    mapId,
    companyName: options.companyName,
    mapName,
    displayName: options.displayName,
    role,
  };
}

/**
 * Direct Firestore access for tests that need to deliberately break a
 * consistency invariant (checkpoint 1A.8 §12 items I/J/K — a missing
 * customer doc, `users/{uid}.customerId` disagreeing with the token, a
 * `maps/{mapId}.customerId` disagreeing with the authenticated tenant) to
 * prove `getCurrentClientContext()` fails closed. Deliberately a thin,
 * general accessor rather than one bespoke helper function per broken-state
 * scenario — the fixture surface stays small; the specific mutation is each
 * test's own concern.
 */
export async function getE2eFirestore() {
  return getE2eAdminFirestore();
}

export interface ProvisionAdditionalMapOptions {
  /** The already-provisioned tenant's `customerId` — same value `provisionTestTenant()` returned. */
  readonly customerId: string;
  readonly mapName: string;
  /**
   * Defaults to `{ type: 'UNBOUNDED' }`, matching `POST /api/maps`'s own
   * server-defaults. Deliberately always `type: 'UNBOUNDED'` even when a
   * `center` is supplied — `mapAreaSchema` (packages/validation/src/map.ts)
   * requires `center` AND `defaultZoom` AND `bounds` together for
   * `type: 'BOUNDED'`, but explicitly allows `UNBOUNDED` to still carry a
   * `center` as "an initial viewport" — the exact shape needed to test
   * checkpoint 1B.6 §9's per-map discovery geography without also having to
   * fabricate a full bounds rectangle.
   */
  readonly area?: { readonly type: 'UNBOUNDED'; readonly center?: { readonly lat: number; readonly lng: number } };
}

export interface AdditionalMapFixture {
  readonly mapId: string;
  readonly mapName: string;
}

/**
 * Seeds a SECOND (or third, ...) `maps/{mapId}` document for an already-
 * provisioned tenant — checkpoint 1B.6's multi-map isolation tests
 * (`e2e/maps.spec.ts`) need two owned maps under the same `customerId` to
 * prove same-tenant map isolation (settings/categories/POIs/menu items/
 * discovery geography), which `provisionTestTenant()` alone can't produce
 * (it always creates exactly one map, matching real registration
 * provisioning). Writes the exact same document shape `POST /api/maps`
 * itself writes (checkpoint 1B.6 §6) — a fixture built from the real target
 * shape, not a parallel invented one — via the Admin SDK directly, the same
 * "seed backend state, never bypass the browser's own login" discipline
 * `provisionTestTenant()`'s own doc comment establishes.
 */
export async function provisionAdditionalMap(options: ProvisionAdditionalMapOptions): Promise<AdditionalMapFixture> {
  const firestore = await getE2eAdminFirestore();
  const mapId = generateId(MAP_ID_PREFIX);

  await firestore.doc(`maps/${mapId}`).set({
    mapId,
    customerId: options.customerId,
    name: options.mapName,
    status: 'DRAFT',
    defaultLanguage: 'EN',
    enabledLanguages: ['EN'],
    mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
    area: options.area ?? { type: 'UNBOUNDED' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { mapId, mapName: options.mapName };
}

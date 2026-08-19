/**
 * Firestore security-rules smoke test — checkpoint 1A.3.
 *
 * Scope: this is deliberately NOT the full tenant-isolation rules suite
 * (own-customer read allowed, cross-tenant read denied, ownership-field
 * mutation denied, etc.) — that real rules implementation and its full test
 * matrix belong to checkpoints 1A.6 / 1A.9 per
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §12/§20, once `firestore.rules`
 * actually contains claims-based tenant logic.
 *
 * All this checkpoint proves is that the deny-by-default baseline in
 * `firebase/firestore.rules` is real and enforced by the emulator — i.e.
 * that an unauthenticated client cannot read or write anything at all. This
 * is the security property the 1A.3 baseline rules file exists to guarantee
 * before any real data model is layered on top of it.
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
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Matches the "default" project alias in firebase/.firebaserc — an
// obviously local-only identity, never a real Firebase project.
const LOCAL_PROJECT_ID = 'touristmap-local';

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

describe('firestore.rules — Phase 1A.3 deny-by-default baseline', () => {
  it('denies an unauthenticated read of an arbitrary document', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, 'customers/does-not-matter')));
  });

  it('denies an unauthenticated write to an arbitrary document', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(unauthedDb, 'customers/does-not-matter'), { probe: true }));
  });
});

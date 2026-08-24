import { describe, expect, it } from 'vitest';
import { describeMapContextDenial, type OwnedMapContextResult } from './map-context';

/**
 * Unit coverage for the pure, easily-isolated piece of
 * `lib/tenant/map-context.ts` — `describeMapContextDenial()`. The resolver
 * itself (`getOwnedMapContext()`) talks directly to the Admin SDK /
 * Firestore and is exercised end-to-end instead, against the real
 * emulators, via `e2e/maps.spec.ts`'s forged-mapId / cross-tenant-mapId /
 * nonexistent-mapId cases — same reasoning `tenant-identity.test.ts` (and
 * the old `client-context.test.ts` before it) documents.
 */
describe('describeMapContextDenial', () => {
  it('gives an unowned/nonexistent map a distinct, non-leaking "not found" message', () => {
    const result: OwnedMapContextResult = { ok: false, reason: 'map_not_found' };
    const { heading, message } = describeMapContextDenial(result);
    expect(heading).toBe('Map not found');
    // Deliberately does not confirm or deny whether a map with that ID
    // exists for someone else — §14's "must not leak ... through error
    // differences" requirement.
    expect(message).not.toMatch(/belongs to|owned by|another (tenant|customer|account)/i);
  });

  it('gives PENDING provisioning a distinct "finishing setup" message', () => {
    const result: OwnedMapContextResult = { ok: false, reason: 'provisioning_incomplete', provisioningStatus: 'PENDING' };
    const { heading } = describeMapContextDenial(result);
    expect(heading).toBe('Finishing setup');
  });

  it('gives FAILED provisioning a distinct "setup did not complete" message', () => {
    const result: OwnedMapContextResult = { ok: false, reason: 'provisioning_incomplete', provisioningStatus: 'FAILED' };
    const { heading } = describeMapContextDenial(result);
    expect(heading).toBe('Setup did not complete');
  });

  it('collapses every other identity denial reason to one generic, safe message', () => {
    const reasons: Array<Extract<OwnedMapContextResult, { ok: false }>> = [
      { ok: false, reason: 'no_session' },
      { ok: false, reason: 'missing_claims' },
      { ok: false, reason: 'invalid_role' },
      { ok: false, reason: 'user_doc_missing' },
      { ok: false, reason: 'user_doc_invalid' },
      { ok: false, reason: 'user_mismatch' },
      { ok: false, reason: 'customer_doc_missing' },
      { ok: false, reason: 'customer_doc_invalid' },
      { ok: false, reason: 'customer_mismatch' },
    ];

    const messages = reasons.map((result) => describeMapContextDenial(result));
    for (const { heading, message } of messages) {
      expect(heading).toBe('Account unavailable');
      expect(message).not.toMatch(/firebase|firestore|exception|stack/i);
    }
  });
});

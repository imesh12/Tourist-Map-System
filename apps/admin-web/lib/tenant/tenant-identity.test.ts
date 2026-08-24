import { describe, expect, it } from 'vitest';
import { describeTenantIdentityDenial, type TenantIdentityResult } from './tenant-identity';

/**
 * Unit coverage for the one pure, easily-isolated piece of
 * `lib/tenant/tenant-identity.ts` — `describeTenantIdentityDenial()`. The
 * rest of the module (`getCurrentTenantIdentity()`) talks directly to the
 * Admin SDK / Firestore and is exercised end-to-end instead, against the
 * real emulators, via `e2e/dashboard.spec.ts` and `e2e/maps.spec.ts` — same
 * "emulator-backed integration test over a parallel Firestore-mocking
 * harness" reasoning the old `client-context.test.ts` documented.
 */
describe('describeTenantIdentityDenial', () => {
  it('gives PENDING provisioning a distinct "finishing setup" message', () => {
    const result: TenantIdentityResult = { ok: false, reason: 'provisioning_incomplete', provisioningStatus: 'PENDING' };
    const { heading, message } = describeTenantIdentityDenial(result);
    expect(heading).toBe('Finishing setup');
    expect(message.length).toBeGreaterThan(0);
  });

  it('gives FAILED provisioning a distinct "setup did not complete" message', () => {
    const result: TenantIdentityResult = { ok: false, reason: 'provisioning_incomplete', provisioningStatus: 'FAILED' };
    const { heading } = describeTenantIdentityDenial(result);
    expect(heading).toBe('Setup did not complete');
  });

  it('collapses every non-provisioning denial reason to one generic, safe message', () => {
    // See the old client-context.test.ts for why this is annotated as
    // `Array<Extract<...>>` rather than the full result union.
    const reasons: Array<Extract<TenantIdentityResult, { ok: false }>> = [
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

    const messages = reasons.map((result) => describeTenantIdentityDenial(result));
    for (const { heading, message } of messages) {
      expect(heading).toBe('Account unavailable');
      expect(message).not.toMatch(/firebase|firestore|exception|stack/i);
    }
  });
});

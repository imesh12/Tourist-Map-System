import { describe, expect, it } from 'vitest';
import { describeClientContextDenial, type ClientContextResult } from './client-context';

/**
 * Unit coverage for the one pure, easily-isolated piece of
 * `lib/tenant/client-context.ts` — `describeClientContextDenial()`. The
 * rest of the module (`getCurrentClientContext()`) talks directly to the
 * Admin SDK / Firestore and is exercised end-to-end instead, against the
 * real emulators, via `e2e/dashboard.spec.ts` — see that file's own doc
 * comment for why an emulator-backed integration test was judged more
 * efficient here than building a parallel Firestore-mocking harness for a
 * single module.
 */
describe('describeClientContextDenial', () => {
  it('gives PENDING provisioning a distinct "finishing setup" message', () => {
    const result: ClientContextResult = { ok: false, reason: 'provisioning_incomplete', provisioningStatus: 'PENDING' };
    const { heading, message } = describeClientContextDenial(result);
    expect(heading).toBe('Finishing setup');
    expect(message.length).toBeGreaterThan(0);
  });

  it('gives FAILED provisioning a distinct "setup did not complete" message', () => {
    const result: ClientContextResult = { ok: false, reason: 'provisioning_incomplete', provisioningStatus: 'FAILED' };
    const { heading } = describeClientContextDenial(result);
    expect(heading).toBe('Setup did not complete');
  });

  it('collapses every non-provisioning denial reason to one generic, safe message', () => {
    // Deliberately `Array<Extract<ClientContextResult, { ok: false }>>`, not
    // `ClientContextResult[]`: annotating the array with the FULL union type
    // widens every element back to that full union when read out via
    // `.map()` (TypeScript's control-flow narrowing that lets an
    // individually-assigned `const` keep its literal's narrower type does
    // NOT carry through array element access/iteration) — `describeClientContextDenial`
    // then correctly refuses a value that could statically be the `ok: true`
    // branch (no `reason` field). Narrowing the annotation itself, rather
    // than the call site, keeps every element checked against the real
    // denial shape with no `as`/`as any` anywhere.
    const reasons: Array<Extract<ClientContextResult, { ok: false }>> = [
      { ok: false, reason: 'no_session' },
      { ok: false, reason: 'missing_claims' },
      { ok: false, reason: 'invalid_role' },
      { ok: false, reason: 'user_doc_missing' },
      { ok: false, reason: 'user_doc_invalid' },
      { ok: false, reason: 'user_mismatch' },
      { ok: false, reason: 'customer_doc_missing' },
      { ok: false, reason: 'customer_doc_invalid' },
      { ok: false, reason: 'customer_mismatch' },
      { ok: false, reason: 'map_doc_missing' },
      { ok: false, reason: 'map_doc_invalid' },
      { ok: false, reason: 'map_mismatch' },
    ];

    const messages = reasons.map((result) => describeClientContextDenial(result));
    for (const { heading, message } of messages) {
      expect(heading).toBe('Account unavailable');
      expect(message).not.toMatch(/firebase|firestore|exception|stack/i);
    }
  });
});

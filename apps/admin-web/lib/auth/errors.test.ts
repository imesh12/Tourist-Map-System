import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ERROR_CODES, AuthAppError, mapFirebaseAuthError, mapRegistrationError } from './errors';

describe('mapFirebaseAuthError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps wrong-password/user-not-found/invalid-email to INVALID_CREDENTIALS with a safe message', () => {
    for (const code of ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/invalid-credential']) {
      const result = mapFirebaseAuthError({ code, message: 'raw Firebase internal detail should never leak' });
      expect(result.code).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
      expect(result.message).not.toContain('raw Firebase internal detail');
    }
  });

  it('maps user-disabled to AUTH_DISABLED', () => {
    const result = mapFirebaseAuthError({ code: 'auth/user-disabled' });
    expect(result.code).toBe(AUTH_ERROR_CODES.AUTH_DISABLED);
  });

  it('maps popup-closed-by-user and cancelled-popup-request to AUTH_CANCELLED', () => {
    expect(mapFirebaseAuthError({ code: 'auth/popup-closed-by-user' }).code).toBe(AUTH_ERROR_CODES.AUTH_CANCELLED);
    expect(mapFirebaseAuthError({ code: 'auth/cancelled-popup-request' }).code).toBe(AUTH_ERROR_CODES.AUTH_CANCELLED);
  });

  it('maps popup-blocked to AUTH_POPUP_BLOCKED', () => {
    const result = mapFirebaseAuthError({ code: 'auth/popup-blocked' });
    expect(result.code).toBe(AUTH_ERROR_CODES.AUTH_POPUP_BLOCKED);
  });

  it('maps unauthorized-domain and operation-not-allowed to AUTH_PROVIDER_ERROR', () => {
    expect(mapFirebaseAuthError({ code: 'auth/unauthorized-domain' }).code).toBe(AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR);
    expect(mapFirebaseAuthError({ code: 'auth/operation-not-allowed' }).code).toBe(AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR);
  });

  it('maps account-exists-with-different-credential to AUTH_PROVIDER_ERROR', () => {
    const result = mapFirebaseAuthError({ code: 'auth/account-exists-with-different-credential' });
    expect(result.code).toBe(AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR);
  });

  it('falls back to a safe AUTH_PROVIDER_ERROR for an unrecognized/unknown error shape', () => {
    const result = mapFirebaseAuthError(new Error('some unrelated failure'));
    expect(result.code).toBe(AUTH_ERROR_CODES.AUTH_PROVIDER_ERROR);
    expect(result.message).not.toContain('some unrelated failure');
  });

  it('never includes the raw error message/stack in the returned AppError message or details', () => {
    const rawSecret = 'super-secret-internal-firebase-detail';
    const result = mapFirebaseAuthError({ code: 'auth/wrong-password', message: rawSecret, stack: rawSecret });
    expect(result.message).not.toContain(rawSecret);
    expect(result.details).toBeUndefined();
  });

  it('returns an AuthAppError instance', () => {
    expect(mapFirebaseAuthError({ code: 'auth/wrong-password' })).toBeInstanceOf(AuthAppError);
  });
});

describe('mapRegistrationError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a validation/invalid-input details.code to REGISTRATION_INVALID_INPUT', () => {
    const result = mapRegistrationError({
      code: 'functions/invalid-argument',
      message: 'raw functions transport detail should never leak',
      details: { code: 'validation/invalid-input' },
    });
    expect(result.code).toBe(AUTH_ERROR_CODES.REGISTRATION_INVALID_INPUT);
    expect(result.message).not.toContain('raw functions transport detail');
  });

  it('maps a provisioning/duplicate-email details.code to REGISTRATION_DUPLICATE_EMAIL with a sign-in hint', () => {
    const result = mapRegistrationError({
      code: 'functions/already-exists',
      details: { code: 'provisioning/duplicate-email' },
    });
    expect(result.code).toBe(AUTH_ERROR_CODES.REGISTRATION_DUPLICATE_EMAIL);
    expect(result.message).toContain('sign in');
  });

  it('maps a provisioning/failed details.code to the generic REGISTRATION_FAILED', () => {
    const result = mapRegistrationError({ code: 'functions/internal', details: { code: 'provisioning/failed' } });
    expect(result.code).toBe(AUTH_ERROR_CODES.REGISTRATION_FAILED);
  });

  it('falls back to REGISTRATION_FAILED for a transport-level failure with no details at all (e.g. network error)', () => {
    const result = mapRegistrationError(new Error('failed to fetch'));
    expect(result.code).toBe(AUTH_ERROR_CODES.REGISTRATION_FAILED);
    expect(result.message).not.toContain('failed to fetch');
  });

  it('returns an AuthAppError instance', () => {
    expect(mapRegistrationError({ details: { code: 'provisioning/failed' } })).toBeInstanceOf(AuthAppError);
  });
});

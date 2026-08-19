import { describe, expect, it } from 'vitest';
import { loginInputSchema } from './login';

const validInput = {
  email: 'taro@example.com',
  password: 'whatever-their-real-password-is',
};

describe('loginInputSchema', () => {
  it('accepts valid login input', () => {
    expect(loginInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejects an invalid email format', () => {
    const result = loginInputSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('normalizes email casing and surrounding whitespace to lowercase', () => {
    const result = loginInputSchema.safeParse({ ...validInput, email: '  Taro@Example.COM  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('taro@example.com');
    }
  });

  it('preserves the password exactly as typed (no trim, no case change)', () => {
    const result = loginInputSchema.safeParse({ ...validInput, password: '  Spacey-Pass1  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.password).toBe('  Spacey-Pass1  ');
    }
  });

  it('rejects an empty password', () => {
    const result = loginInputSchema.safeParse({ ...validInput, password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing password field entirely', () => {
    const withoutPassword: Record<string, unknown> = { ...validInput };
    delete withoutPassword.password;
    expect(loginInputSchema.safeParse(withoutPassword).success).toBe(false);
  });

  it('does NOT enforce the registration 8-character password minimum', () => {
    // A 6-char password is below registrationInputSchema's 8-char floor but
    // must still be accepted here — login isn't the place to enforce a
    // password-creation policy against an existing, possibly older, account.
    const result = loginInputSchema.safeParse({ ...validInput, password: 'abcdef' });
    expect(result.success).toBe(true);
  });

  describe('security: privileged fields are never accepted', () => {
    it('rejects an injected `role` field', () => {
      const result = loginInputSchema.safeParse({ ...validInput, role: 'SUPER_ADMIN' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `customerId` field', () => {
      const result = loginInputSchema.safeParse({ ...validInput, customerId: 'cust_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `mapId` field', () => {
      const result = loginInputSchema.safeParse({ ...validInput, mapId: 'map_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `status` field', () => {
      const result = loginInputSchema.safeParse({ ...validInput, status: 'ACTIVE' });
      expect(result.success).toBe(false);
    });

    it('rejects any other unrecognized extra field (strict mode)', () => {
      const result = loginInputSchema.safeParse({ ...validInput, isAdmin: true });
      expect(result.success).toBe(false);
    });
  });
});

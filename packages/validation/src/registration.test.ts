import { describe, expect, it } from 'vitest';
import { registrationInputSchema } from './registration';

const validInput = {
  companyName: 'JR West',
  clientType: 'RAILWAY',
  contactName: 'Taro Yamada',
  email: 'taro@example.com',
  password: 'correct-horse-battery-staple',
};

describe('registrationInputSchema', () => {
  it('accepts valid registration input', () => {
    expect(registrationInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('accepts valid registration input with an optional initialMapName', () => {
    const result = registrationInputSchema.safeParse({ ...validInput, initialMapName: 'Kyoto Station Map' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email format', () => {
    const result = registrationInputSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than the baseline minimum', () => {
    const result = registrationInputSchema.safeParse({ ...validInput, password: 'short1' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing required field (companyName)', () => {
    const withoutCompanyName: Record<string, unknown> = { ...validInput };
    delete withoutCompanyName.companyName;
    expect(registrationInputSchema.safeParse(withoutCompanyName).success).toBe(false);
  });

  it('rejects an unrecognized clientType', () => {
    const result = registrationInputSchema.safeParse({ ...validInput, clientType: 'AIRLINE' });
    expect(result.success).toBe(false);
  });

  it('normalizes whitespace: trims companyName/contactName and the map name', () => {
    const result = registrationInputSchema.safeParse({
      ...validInput,
      companyName: '  JR West  ',
      contactName: '  Taro Yamada  ',
      initialMapName: '  Kyoto Station Map  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyName).toBe('JR West');
      expect(result.data.contactName).toBe('Taro Yamada');
      expect(result.data.initialMapName).toBe('Kyoto Station Map');
    }
  });

  it('normalizes email casing and surrounding whitespace to lowercase', () => {
    const result = registrationInputSchema.safeParse({ ...validInput, email: '  Taro@Example.COM  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('taro@example.com');
    }
  });

  it('does NOT trim the password (whitespace in a password must be preserved as typed)', () => {
    const result = registrationInputSchema.safeParse({ ...validInput, password: '  spacey-password-1  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.password).toBe('  spacey-password-1  ');
    }
  });

  it('rejects a rejection of whitespace-only required fields (trim then min-length)', () => {
    const result = registrationInputSchema.safeParse({ ...validInput, companyName: '   ' });
    expect(result.success).toBe(false);
  });

  describe('security: role/customerId/mapId are never client-suppliable', () => {
    it('rejects an injected `role` field (SUPER_ADMIN privilege-escalation attempt)', () => {
      const result = registrationInputSchema.safeParse({ ...validInput, role: 'SUPER_ADMIN' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `customerId` field (ownership-spoofing attempt)', () => {
      const result = registrationInputSchema.safeParse({ ...validInput, customerId: 'cust_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `mapId` field', () => {
      const result = registrationInputSchema.safeParse({ ...validInput, mapId: 'map_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects any other unrecognized extra field (strict mode)', () => {
      const result = registrationInputSchema.safeParse({ ...validInput, isAdmin: true });
      expect(result.success).toBe(false);
    });
  });
});

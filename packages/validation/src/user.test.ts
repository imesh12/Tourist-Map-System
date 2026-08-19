import { describe, expect, it } from 'vitest';
import { userSchema } from './user';

const validUser = {
  uid: 'aB3dEf6gH9jKlMn0pQrStUvWxYz1',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  role: 'CLIENT_ADMIN',
  email: 'taro@example.com',
  displayName: 'Taro Yamada',
  status: 'ACTIVE',
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

describe('userSchema', () => {
  it('accepts a valid User document', () => {
    expect(userSchema.safeParse(validUser).success).toBe(true);
  });

  it('accepts SUPER_ADMIN as a stored role (a valid document may be a Super Admin)', () => {
    expect(userSchema.safeParse({ ...validUser, role: 'SUPER_ADMIN' }).success).toBe(true);
  });

  it('rejects an unrecognized role', () => {
    expect(userSchema.safeParse({ ...validUser, role: 'HACKER' }).success).toBe(false);
  });

  it('rejects lowercase role values (enum values are case-sensitive)', () => {
    expect(userSchema.safeParse({ ...validUser, role: 'client_admin' }).success).toBe(false);
  });

  it('rejects an unrecognized status', () => {
    expect(userSchema.safeParse({ ...validUser, status: 'DELETED' }).success).toBe(false);
  });

  it('rejects a malformed customerId on the ownership field', () => {
    expect(userSchema.safeParse({ ...validUser, customerId: 'not-a-customer-id' }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { customerSchema } from './customer';

const validCustomer = {
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  companyName: 'JR West',
  clientType: 'RAILWAY',
  status: 'ACTIVE',
  primaryContactName: 'Taro Yamada',
  primaryContactEmail: 'taro@example.com',
  provisioning: {
    status: 'COMPLETE',
    startedAt: { seconds: 1700000000, nanoseconds: 0 },
    completedAt: { seconds: 1700000001, nanoseconds: 0 },
  },
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

describe('customerSchema', () => {
  it('accepts a valid Customer document', () => {
    expect(customerSchema.safeParse(validCustomer).success).toBe(true);
  });

  it('rejects a malformed customerId', () => {
    const result = customerSchema.safeParse({ ...validCustomer, customerId: 'not-a-customer-id' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing companyName', () => {
    const withoutCompanyName: Record<string, unknown> = { ...validCustomer };
    delete withoutCompanyName.companyName;
    expect(customerSchema.safeParse(withoutCompanyName).success).toBe(false);
  });

  it('rejects an unrecognized clientType', () => {
    const result = customerSchema.safeParse({ ...validCustomer, clientType: 'AIRLINE' });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized status', () => {
    const result = customerSchema.safeParse({ ...validCustomer, status: 'DELETED' });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized provisioning.status', () => {
    const result = customerSchema.safeParse({
      ...validCustomer,
      provisioning: { ...validCustomer.provisioning, status: 'DONE' },
    });
    expect(result.success).toBe(false);
  });
});

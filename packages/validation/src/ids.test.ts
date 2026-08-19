import { describe, expect, it } from 'vitest';
import { customerIdSchema, mapIdSchema, uidSchema } from './ids';

describe('customerIdSchema', () => {
  it('accepts a well-formed customerId', () => {
    expect(customerIdSchema.safeParse('cust_aB3dEf6gH9jKlMn0pQ').success).toBe(true);
  });

  it('rejects a value missing the cust_ prefix', () => {
    expect(customerIdSchema.safeParse('aB3dEf6gH9jKlMn0pQ').success).toBe(false);
  });

  it('rejects the map_ prefix', () => {
    expect(customerIdSchema.safeParse('map_aB3dEf6gH9jKlMn0pQ').success).toBe(false);
  });

  it('rejects a random suffix that is too short', () => {
    expect(customerIdSchema.safeParse('cust_short').success).toBe(false);
  });

  it('rejects a prefix with no suffix at all', () => {
    expect(customerIdSchema.safeParse('cust_').success).toBe(false);
  });

  it('rejects characters outside the URL-safe set', () => {
    expect(customerIdSchema.safeParse('cust_aB3dEf6gH9jKlMn0p/Q').success).toBe(false);
  });
});

describe('mapIdSchema', () => {
  it('accepts a well-formed mapId', () => {
    expect(mapIdSchema.safeParse('map_aB3dEf6gH9jKlMn0pQ').success).toBe(true);
  });

  it('rejects the cust_ prefix', () => {
    expect(mapIdSchema.safeParse('cust_aB3dEf6gH9jKlMn0pQ').success).toBe(false);
  });

  it('rejects a malformed id', () => {
    expect(mapIdSchema.safeParse('not-a-map-id').success).toBe(false);
  });
});

describe('uidSchema', () => {
  it('accepts a typical default-generated Firebase UID (28 chars)', () => {
    expect(uidSchema.safeParse('aB3dEf6gH9jKlMn0pQrStUvWxYz1').success).toBe(true);
  });

  it('accepts a longer custom/imported UID without assuming one exact length', () => {
    expect(uidSchema.safeParse('a'.repeat(100)).success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(uidSchema.safeParse('').success).toBe(false);
  });

  it('rejects a UID longer than Firebase\'s documented 128-character maximum', () => {
    expect(uidSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });
});

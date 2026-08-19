import { describe, expect, it } from 'vitest';
import { mapSchema } from './map';

const validMap = {
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  name: 'JR West Tourist Map',
  status: 'DRAFT',
  defaultLanguage: 'EN',
  enabledLanguages: ['EN'],
  mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
  area: { type: 'UNBOUNDED' },
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

describe('mapSchema', () => {
  it('accepts a valid Map document', () => {
    expect(mapSchema.safeParse(validMap).success).toBe(true);
  });

  it('rejects a malformed customerId (the ownership field)', () => {
    const result = mapSchema.safeParse({ ...validMap, customerId: 'not-a-customer-id' });
    expect(result.success).toBe(false);
  });

  it('rejects a customerId using the map_ prefix instead of cust_', () => {
    const result = mapSchema.safeParse({ ...validMap, customerId: 'map_aB3dEf6gH9jKlMn0pQ' });
    expect(result.success).toBe(false);
  });

  it('rejects enabledLanguages that does not include defaultLanguage', () => {
    const result = mapSchema.safeParse({ ...validMap, defaultLanguage: 'JA', enabledLanguages: ['EN'] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate entries in enabledLanguages', () => {
    const result = mapSchema.safeParse({ ...validMap, enabledLanguages: ['EN', 'EN'] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty enabledLanguages array', () => {
    const result = mapSchema.safeParse({ ...validMap, enabledLanguages: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized mapStatus', () => {
    const result = mapSchema.safeParse({ ...validMap, status: 'ARCHIVED' });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { mapCreateInputSchema } from './map-create';

describe('mapCreateInputSchema — checkpoint 1B.6', () => {
  it('accepts a valid name', () => {
    expect(mapCreateInputSchema.safeParse({ name: 'Osaka Tourist Map' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(mapCreateInputSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only name (trimmed to empty)', () => {
    expect(mapCreateInputSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an oversized name', () => {
    expect(mapCreateInputSchema.safeParse({ name: 'a'.repeat(201) }).success).toBe(false);
  });

  it('rejects a forged mapId field', () => {
    const result = mapCreateInputSchema.safeParse({ name: 'Osaka Tourist Map', mapId: 'map_forgedforgedforgedforged' });
    expect(result.success).toBe(false);
  });

  it('rejects a forged customerId field — ownership is never client-supplied', () => {
    const result = mapCreateInputSchema.safeParse({ name: 'Osaka Tourist Map', customerId: 'cust_someoneElsesTenant00' });
    expect(result.success).toBe(false);
  });

  it('rejects a forged status field', () => {
    const result = mapCreateInputSchema.safeParse({ name: 'Osaka Tourist Map', status: 'PUBLISHED' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(mapCreateInputSchema.safeParse({}).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { mapAreaSchema, mapSchema } from './map';

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

  it('accepts a valid Map document with basic branding', () => {
    const result = mapSchema.safeParse({
      ...validMap,
      branding: { logoUrl: 'https://example.com/logo.png', primaryColor: '#112233', secondaryColor: '#AABBCC' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid branding color', () => {
    const result = mapSchema.safeParse({ ...validMap, branding: { primaryColor: 'red' } });
    expect(result.success).toBe(false);
  });
});

describe('mapAreaSchema — checkpoint 1B.1', () => {
  it('accepts a bare UNBOUNDED area (Phase 1A provisioning default)', () => {
    expect(mapAreaSchema.safeParse({ type: 'UNBOUNDED' }).success).toBe(true);
  });

  it('accepts an UNBOUNDED area with an initial-viewport center/zoom and no bounds', () => {
    const result = mapAreaSchema.safeParse({ type: 'UNBOUNDED', center: { lat: 35.0, lng: 135.0 }, defaultZoom: 12 });
    expect(result.success).toBe(true);
  });

  it('accepts a fully-specified BOUNDED area', () => {
    const result = mapAreaSchema.safeParse({
      type: 'BOUNDED',
      center: { lat: 35.0, lng: 135.0 },
      defaultZoom: 14,
      bounds: { north: 35.1, south: 34.9, east: 135.1, west: 134.9 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects BOUNDED with no bounds/center/defaultZoom', () => {
    expect(mapAreaSchema.safeParse({ type: 'BOUNDED' }).success).toBe(false);
  });

  it('rejects BOUNDED missing only bounds', () => {
    const result = mapAreaSchema.safeParse({ type: 'BOUNDED', center: { lat: 35.0, lng: 135.0 }, defaultZoom: 14 });
    expect(result.success).toBe(false);
  });

  it('rejects a latitude outside -90..90', () => {
    const result = mapAreaSchema.safeParse({ type: 'UNBOUNDED', center: { lat: 91, lng: 0 } });
    expect(result.success).toBe(false);
  });

  it('rejects a longitude outside -180..180', () => {
    const result = mapAreaSchema.safeParse({ type: 'UNBOUNDED', center: { lat: 0, lng: 181 } });
    expect(result.success).toBe(false);
  });

  it('rejects a zoom outside the supported range', () => {
    expect(mapAreaSchema.safeParse({ type: 'UNBOUNDED', defaultZoom: -1 }).success).toBe(false);
    expect(mapAreaSchema.safeParse({ type: 'UNBOUNDED', defaultZoom: 23 }).success).toBe(false);
  });

  it('rejects bounds where north <= south', () => {
    const result = mapAreaSchema.safeParse({
      type: 'BOUNDED',
      center: { lat: 35.0, lng: 135.0 },
      defaultZoom: 14,
      bounds: { north: 34.9, south: 35.1, east: 135.1, west: 134.9 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects bounds where east <= west', () => {
    const result = mapAreaSchema.safeParse({
      type: 'BOUNDED',
      center: { lat: 35.0, lng: 135.0 },
      defaultZoom: 14,
      bounds: { north: 35.1, south: 34.9, east: 134.9, west: 135.1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid latitude inside bounds', () => {
    const result = mapAreaSchema.safeParse({
      type: 'BOUNDED',
      center: { lat: 35.0, lng: 135.0 },
      defaultZoom: 14,
      bounds: { north: 91, south: 34.9, east: 135.1, west: 134.9 },
    });
    expect(result.success).toBe(false);
  });
});

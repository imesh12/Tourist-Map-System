import { describe, expect, it } from 'vitest';
import { mapSettingsUpdateSchema } from './map-settings';

const validUnboundedInput = {
  name: 'JR West Tourist Map',
  mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
  area: { type: 'UNBOUNDED' },
};

const validBoundedInput = {
  name: 'JR West Tourist Map',
  mapProvider: { provider: 'GOOGLE_MAPS', style: 'ROAD' },
  area: {
    type: 'BOUNDED',
    center: { lat: 34.9858, lng: 135.7588 },
    defaultZoom: 14,
    bounds: { north: 35.05, south: 34.9, east: 135.85, west: 135.65 },
  },
};

describe('mapSettingsUpdateSchema — checkpoint 1B.1', () => {
  it('accepts a valid UNBOUNDED config', () => {
    expect(mapSettingsUpdateSchema.safeParse(validUnboundedInput).success).toBe(true);
  });

  it('accepts a valid BOUNDED config', () => {
    expect(mapSettingsUpdateSchema.safeParse(validBoundedInput).success).toBe(true);
  });

  it('accepts a valid config with basic branding', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validUnboundedInput,
      branding: { logoUrl: 'https://example.com/logo.png', primaryColor: '#112233', secondaryColor: '#445566' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a config with no branding at all (nothing configured yet)', () => {
    expect(mapSettingsUpdateSchema.safeParse(validUnboundedInput).success).toBe(true);
  });

  it('rejects an empty/whitespace-only map name', () => {
    expect(mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, name: '   ' }).success).toBe(false);
  });

  it('rejects a missing map name', () => {
    const withoutName: Record<string, unknown> = { ...validUnboundedInput };
    delete withoutName.name;
    expect(mapSettingsUpdateSchema.safeParse(withoutName).success).toBe(false);
  });

  it('rejects an unrecognized provider', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validUnboundedInput,
      mapProvider: { provider: 'HERE_MAPS', style: 'ROAD' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized style', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validUnboundedInput,
      mapProvider: { provider: 'GOOGLE_MAPS', style: 'NEON' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid center latitude', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validUnboundedInput,
      area: { type: 'UNBOUNDED', center: { lat: 91, lng: 0 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid center longitude', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validUnboundedInput,
      area: { type: 'UNBOUNDED', center: { lat: 0, lng: 181 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range zoom', () => {
    const result = mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, area: { type: 'UNBOUNDED', defaultZoom: 30 } });
    expect(result.success).toBe(false);
  });

  it('rejects BOUNDED bounds where north <= south', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validBoundedInput,
      area: { ...validBoundedInput.area, bounds: { ...validBoundedInput.area.bounds, north: 34.8 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects BOUNDED bounds where east <= west', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validBoundedInput,
      area: { ...validBoundedInput.area, bounds: { ...validBoundedInput.area.bounds, east: 135.6 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects BOUNDED with missing bounds', () => {
    const result = mapSettingsUpdateSchema.safeParse({
      ...validBoundedInput,
      area: { type: 'BOUNDED', center: validBoundedInput.area.center, defaultZoom: validBoundedInput.area.defaultZoom },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid branding color', () => {
    const result = mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, branding: { primaryColor: 'not-a-color' } });
    expect(result.success).toBe(false);
  });

  describe('security: ownership fields are never client-suppliable', () => {
    it('rejects an injected `mapId` field', () => {
      const result = mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, mapId: 'map_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `customerId` field (cross-tenant targeting attempt)', () => {
      const result = mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, customerId: 'cust_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `status` field', () => {
      const result = mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, status: 'PUBLISHED' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `createdAt`/`updatedAt` field', () => {
      expect(mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, createdAt: 'x' }).success).toBe(false);
      expect(mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, updatedAt: 'x' }).success).toBe(false);
    });

    it('rejects any other unrecognized extra field (strict mode)', () => {
      expect(mapSettingsUpdateSchema.safeParse({ ...validUnboundedInput, isAdmin: true }).success).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { mapThemeColorsSchema, mapThemeSchema, mapThemeVisibilitySchema } from './map-theme';

const validTheme = {
  preset: 'TOURIST_CLEAN',
  visibility: {
    businessPois: false,
    transit: true,
    schools: false,
    hospitals: false,
    parks: true,
    roadLabels: true,
    transitLabels: true,
  },
  colors: {
    background: '#F7F8F5',
    road: '#FFFFFF',
    water: '#DDEBF4',
    label: '#4B5563',
  },
  markerStyle: { style: 'PIN', size: 'MEDIUM' },
};

describe('mapThemeSchema — checkpoint 1B.7', () => {
  it('accepts a fully-populated valid theme', () => {
    expect(mapThemeSchema.safeParse(validTheme).success).toBe(true);
  });

  it('accepts a valid theme with no colors at all (every color field is optional)', () => {
    const { preset, visibility, markerStyle } = validTheme;
    expect(mapThemeSchema.safeParse({ preset, visibility, markerStyle }).success).toBe(true);
  });

  it('accepts a valid theme with only some color fields set', () => {
    const result = mapThemeSchema.safeParse({ ...validTheme, colors: { background: '#111111' } });
    expect(result.success).toBe(true);
  });

  it.each(['STANDARD', 'TOURISM', 'TOURIST_CLEAN', 'LIGHT', 'MINIMAL'])('accepts preset %s', (preset) => {
    expect(mapThemeSchema.safeParse({ ...validTheme, preset }).success).toBe(true);
  });

  it('rejects an unrecognized preset', () => {
    const result = mapThemeSchema.safeParse({ ...validTheme, preset: 'CUSTOM' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing preset', () => {
    const { visibility, colors, markerStyle } = validTheme;
    expect(mapThemeSchema.safeParse({ visibility, colors, markerStyle }).success).toBe(false);
  });

  it('rejects a missing visibility object', () => {
    const { preset, colors, markerStyle } = validTheme;
    expect(mapThemeSchema.safeParse({ preset, colors, markerStyle }).success).toBe(false);
  });

  it('rejects a visibility object missing one required flag', () => {
    const { businessPois, transit, schools, hospitals, roadLabels, transitLabels } = validTheme.visibility;
    const result = mapThemeSchema.safeParse({
      ...validTheme,
      visibility: { businessPois, transit, schools, hospitals, roadLabels, transitLabels },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean visibility flag', () => {
    const result = mapThemeSchema.safeParse({ ...validTheme, visibility: { ...validTheme.visibility, parks: 'yes' } });
    expect(result.success).toBe(false);
  });

  describe('checkpoint 1B.16 optional visibility fields', () => {
    it('accepts a theme with the four new fields set', () => {
      const result = mapThemeSchema.safeParse({
        ...validTheme,
        visibility: { ...validTheme.visibility, roads: true, buildings: false, placeLabels: false, landmarkPois: true },
      });
      expect(result.success).toBe(true);
    });

    it('accepts a pre-1B.16 theme that omits all four (backward compatibility)', () => {
      // `validTheme.visibility` already has only the seven original flags.
      expect(mapThemeVisibilitySchema.safeParse(validTheme.visibility).success).toBe(true);
    });

    it.each(['roads', 'buildings', 'placeLabels', 'landmarkPois'])('rejects a non-boolean %s', (field) => {
      const result = mapThemeSchema.safeParse({ ...validTheme, visibility: { ...validTheme.visibility, [field]: 'yes' } });
      expect(result.success).toBe(false);
    });

    it('still rejects a genuinely unknown visibility key (strict mode intact)', () => {
      const result = mapThemeSchema.safeParse({ ...validTheme, visibility: { ...validTheme.visibility, roadz: true } });
      expect(result.success).toBe(false);
    });
  });

  it.each(['#fff', 'blue', 'rgb(0,0,0)', 'javascript:alert(1)'])('rejects an invalid color value: %s', (color) => {
    const result = mapThemeSchema.safeParse({ ...validTheme, colors: { background: color } });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized markerStyle.style value', () => {
    const result = mapThemeSchema.safeParse({ ...validTheme, markerStyle: { style: 'FLAG', size: 'MEDIUM' } });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized markerStyle.size value', () => {
    const result = mapThemeSchema.safeParse({ ...validTheme, markerStyle: { style: 'PIN', size: 'HUGE' } });
    expect(result.success).toBe(false);
  });

  it('rejects a missing markerStyle', () => {
    const { preset, visibility, colors } = validTheme;
    expect(mapThemeSchema.safeParse({ preset, visibility, colors }).success).toBe(false);
  });

  describe('security: raw provider JSON and forged fields are rejected outright, never silently stripped', () => {
    it('rejects an unrecognized top-level field (strict mode)', () => {
      const result = mapThemeSchema.safeParse({ ...validTheme, extra: 'nope' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `customerId` field', () => {
      const result = mapThemeSchema.safeParse({ ...validTheme, customerId: 'cust_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects an injected `mapId` field', () => {
      const result = mapThemeSchema.safeParse({ ...validTheme, mapId: 'map_attackerControlled01' });
      expect(result.success).toBe(false);
    });

    it('rejects a raw Google Maps `styles` array masquerading as the theme itself', () => {
      const rawGoogleStyles = [{ featureType: 'poi.business', elementType: 'labels', stylers: [{ visibility: 'off' }] }];
      const result = mapThemeSchema.safeParse(rawGoogleStyles);
      expect(result.success).toBe(false);
    });

    it('rejects a raw Google Maps `styles` array smuggled in as an extra field', () => {
      const result = mapThemeSchema.safeParse({
        ...validTheme,
        styles: [{ featureType: 'poi.business', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a raw Mapbox-style JSON fragment smuggled in as an extra field', () => {
      const result = mapThemeSchema.safeParse({ ...validTheme, layers: [{ id: 'poi-label', type: 'symbol' }] });
      expect(result.success).toBe(false);
    });

    it('rejects an unrecognized field inside `colors` (strict sub-schema)', () => {
      const result = mapThemeSchema.safeParse({ ...validTheme, colors: { ...validTheme.colors, css: 'body{}' } });
      expect(result.success).toBe(false);
    });

    it('rejects an unrecognized field inside `visibility` (strict sub-schema)', () => {
      const result = mapThemeSchema.safeParse({ ...validTheme, visibility: { ...validTheme.visibility, extraFlag: true } });
      expect(result.success).toBe(false);
    });
  });
});

describe('mapThemeVisibilitySchema', () => {
  it('requires every flag to be present (no partial visibility)', () => {
    expect(mapThemeVisibilitySchema.safeParse({ businessPois: true }).success).toBe(false);
  });
});

describe('mapThemeColorsSchema', () => {
  it('accepts an empty object (every color deferred to provider defaults)', () => {
    expect(mapThemeColorsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts the optional `land` field even though no form UI currently exposes it', () => {
    expect(mapThemeColorsSchema.safeParse({ land: '#00FF00' }).success).toBe(true);
  });
});

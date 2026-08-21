import { describe, expect, it } from 'vitest';
import { mapBrandingSchema } from './branding';

describe('mapBrandingSchema', () => {
  it('accepts an empty branding object (nothing configured yet)', () => {
    expect(mapBrandingSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid #RRGGBB colors and a valid logo URL', () => {
    const result = mapBrandingSchema.safeParse({
      logoUrl: 'https://example.com/logo.png',
      primaryColor: '#112233',
      secondaryColor: '#aabbcc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a named CSS color instead of #RRGGBB', () => {
    expect(mapBrandingSchema.safeParse({ primaryColor: 'red' }).success).toBe(false);
  });

  it('rejects a 3-digit hex shorthand (not #RRGGBB)', () => {
    expect(mapBrandingSchema.safeParse({ primaryColor: '#fff' }).success).toBe(false);
  });

  it('rejects a CSS function value', () => {
    expect(mapBrandingSchema.safeParse({ primaryColor: 'rgb(0,0,0)' }).success).toBe(false);
  });

  it('rejects an attempted script/style injection as a color value', () => {
    expect(mapBrandingSchema.safeParse({ primaryColor: 'red; } body { display: none' }).success).toBe(false);
  });

  it('rejects a non-URL logoUrl', () => {
    expect(mapBrandingSchema.safeParse({ logoUrl: 'not a url' }).success).toBe(false);
  });

  it('rejects a javascript: URL as logoUrl', () => {
    expect(mapBrandingSchema.safeParse({ logoUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('rejects a data: URL as logoUrl (SVG-onload XSS vector via <img src>)', () => {
    expect(mapBrandingSchema.safeParse({ logoUrl: 'data:image/svg+xml,<svg onload=alert(1)>' }).success).toBe(false);
  });

  it('accepts an http (not just https) logoUrl', () => {
    expect(mapBrandingSchema.safeParse({ logoUrl: 'http://example.com/logo.png' }).success).toBe(true);
  });

  it('rejects an unrecognized extra field (strict mode)', () => {
    expect(mapBrandingSchema.safeParse({ primaryColor: '#112233', css: 'body{display:none}' }).success).toBe(false);
  });
});

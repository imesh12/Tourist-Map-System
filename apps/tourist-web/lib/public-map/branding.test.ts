import { describe, expect, it } from 'vitest';
import { brandMonogram, readableTextColor, resolveBrandingVars } from './branding';

describe('resolveBrandingVars — checkpoint 1B.16 §4', () => {
  it('falls back to the app defaults when branding is entirely absent', () => {
    expect(resolveBrandingVars(undefined)).toEqual({
      '--brand-primary': '#111827',
      '--brand-secondary': '#5b6472',
      '--brand-on-primary': '#ffffff',
    });
  });

  it('falls back per-field when only some branding colors are set', () => {
    const vars = resolveBrandingVars({ primaryColor: '#0a7d55' });
    expect(vars['--brand-primary']).toBe('#0a7d55');
    expect(vars['--brand-secondary']).toBe('#5b6472');
  });

  it('ignores a malformed color and uses the fallback instead of emitting it', () => {
    // `packages/validation` should never let this through, but this helper
    // stays defensive rather than trusting its input.
    const vars = resolveBrandingVars({ primaryColor: 'red; } body { display:none', secondaryColor: '#abcdef' });
    expect(vars['--brand-primary']).toBe('#111827');
    expect(vars['--brand-secondary']).toBe('#abcdef');
  });

  it('lower-cases the accepted hex so the emitted value is stable', () => {
    expect(resolveBrandingVars({ primaryColor: '#AABBCC' })['--brand-primary']).toBe('#aabbcc');
  });

  it('is pure: the same input always produces a deep-equal result', () => {
    const input = { logoUrl: 'https://example.com/l.png', primaryColor: '#123456', secondaryColor: '#654321' };
    expect(resolveBrandingVars(input)).toEqual(resolveBrandingVars(input));
  });
});

describe('readableTextColor — WCAG contrast pick', () => {
  it('puts white ink on a dark tenant color', () => {
    expect(readableTextColor('#111827')).toBe('#ffffff');
    expect(readableTextColor('#0a7d55')).toBe('#ffffff');
  });

  it('puts dark ink on a pale tenant color, where white text would be unreadable', () => {
    expect(readableTextColor('#ffd54a')).toBe('#111827');
    expect(readableTextColor('#f4f1ea')).toBe('#111827');
  });
});

describe('brandMonogram — logo fallback', () => {
  it('uses the first letters of the first two words', () => {
    expect(brandMonogram('Nagoya Castle Tourist Map')).toBe('NC');
  });

  it('uses the first two letters of a single-word name', () => {
    expect(brandMonogram('Kyoto')).toBe('KY');
  });

  it('never throws on an empty or whitespace name', () => {
    expect(brandMonogram('   ')).toBe('•');
  });

  it('handles a multi-byte first character without splitting it', () => {
    expect(brandMonogram('京都 観光')).toBe('京観');
  });
});

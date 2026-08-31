import { describe, expect, it } from 'vitest';
import { formatPublishedAt } from './format-timestamp';

/**
 * `formatPublishedAt()` unit tests — checkpoint 1B.8 repair round. The
 * whole point of this function is that it returns the SAME string
 * regardless of the running environment's locale/timezone (the real bug
 * this replaces: `toLocaleString()` disagreeing between Node/SSR and
 * Chromium/hydration) — these tests pin exact expected output for known
 * instants, which would immediately fail if a future change reintroduced
 * any locale- or host-timezone-dependent formatting.
 */

describe('formatPublishedAt', () => {
  it('formats a known instant as a fixed YYYY-MM-DD HH:mm UTC string', () => {
    // 2026-08-25T15:13:56Z — verified via `date -u -d "2026-08-25T15:13:56Z" +%s`
    expect(formatPublishedAt({ seconds: 1787670836, nanoseconds: 0 })).toBe('2026-08-25 15:13 UTC');
  });

  it('zero-pads single-digit month/day/hour/minute', () => {
    // 2026-01-02T03:04:00Z
    expect(formatPublishedAt({ seconds: 1767323040, nanoseconds: 0 })).toBe('2026-01-02 03:04 UTC');
  });

  it('ignores nanoseconds (minute precision only)', () => {
    expect(formatPublishedAt({ seconds: 1787670836, nanoseconds: 999999999 })).toBe('2026-08-25 15:13 UTC');
  });

  it('handles midnight UTC correctly', () => {
    // 2026-03-01T00:00:00Z
    expect(formatPublishedAt({ seconds: 1772323200, nanoseconds: 0 })).toBe('2026-03-01 00:00 UTC');
  });
});

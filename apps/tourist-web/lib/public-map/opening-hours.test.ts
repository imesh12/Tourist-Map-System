import { describe, expect, it } from 'vitest';
import type { PublishedPoiOpeningHours } from 'shared-types';
import { resolveOpeningStatus } from './opening-hours';

// Mon–Fri 11:00–22:00 (day 1..5), closed Sat/Sun. Place is UTC+9 (540).
const MON_FRI_11_22: PublishedPoiOpeningHours = {
  periods: [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 22, minute: 0 } })),
  weekdayDescriptions: ['Monday: 11 AM – 10 PM', 'Saturday: Closed', 'Sunday: Closed'],
};

/** A UTC instant such that the place (offset `offsetMin`) reads `day`/`hour`:`minute` on its own wall clock. */
function utcForPlaceLocal(day: number, hour: number, minute: number, offsetMin: number): Date {
  // 2024-01-07 is a Sunday; add `day` days to hit the desired weekday.
  const base = Date.UTC(2024, 0, 7 + day, hour, minute) - offsetMin * 60_000;
  return new Date(base);
}

describe('resolveOpeningStatus', () => {
  it('returns "unknown" (no badge) when utcOffsetMinutes is missing — never a possibly-wrong guess', () => {
    expect(resolveOpeningStatus(MON_FRI_11_22, undefined, new Date()).state).toBe('unknown');
  });

  it('returns "unknown" when there are no periods', () => {
    expect(resolveOpeningStatus({ periods: [], weekdayDescriptions: ['Open sometimes'] }, 540, new Date()).state).toBe('unknown');
    expect(resolveOpeningStatus(undefined, 540, new Date()).state).toBe('unknown');
  });

  it('is OPEN mid-window and names the closing time', () => {
    const status = resolveOpeningStatus(MON_FRI_11_22, 540, utcForPlaceLocal(3, 15, 0, 540)); // Wed 15:00 place-local
    expect(status.state).toBe('open');
    expect(status.detail).toBe('Closes 10:00 PM');
  });

  it('is CLOSED before opening and names the same-day opening time', () => {
    const status = resolveOpeningStatus(MON_FRI_11_22, 540, utcForPlaceLocal(3, 9, 30, 540)); // Wed 09:30
    expect(status.state).toBe('closed');
    expect(status.detail).toBe('Opens 11:00 AM');
  });

  it('is CLOSED after close and names the NEXT day opening', () => {
    const status = resolveOpeningStatus(MON_FRI_11_22, 540, utcForPlaceLocal(3, 23, 0, 540)); // Wed 23:00
    expect(status.state).toBe('closed');
    expect(status.detail).toBe('Opens Thu 11:00 AM');
  });

  it('is CLOSED on a closed day and points to the next open day', () => {
    const status = resolveOpeningStatus(MON_FRI_11_22, 540, utcForPlaceLocal(6, 12, 0, 540)); // Saturday noon
    expect(status.state).toBe('closed');
    expect(status.detail).toBe('Opens Mon 11:00 AM');
  });

  it('handles a window that crosses midnight (Fri 20:00 → Sat 02:00)', () => {
    const lateNight: PublishedPoiOpeningHours = {
      periods: [{ open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }],
      weekdayDescriptions: [],
    };
    expect(resolveOpeningStatus(lateNight, 0, utcForPlaceLocal(5, 23, 0, 0)).state).toBe('open'); // Fri 23:00
    expect(resolveOpeningStatus(lateNight, 0, utcForPlaceLocal(6, 1, 0, 0)).state).toBe('open'); // Sat 01:00
    expect(resolveOpeningStatus(lateNight, 0, utcForPlaceLocal(6, 3, 0, 0)).state).toBe('closed'); // Sat 03:00
  });

  it('treats a period with no close as open 24h from that point', () => {
    const always: PublishedPoiOpeningHours = {
      periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
      weekdayDescriptions: ['Open 24 hours'],
    };
    expect(resolveOpeningStatus(always, 0, utcForPlaceLocal(3, 3, 15, 0)).state).toBe('open');
  });

  it('respects the PLACE timezone, not the evaluating machine — same UTC instant, opposite verdicts by offset', () => {
    const instant = utcForPlaceLocal(3, 12, 0, 540); // noon in a UTC+9 place
    expect(resolveOpeningStatus(MON_FRI_11_22, 540, instant).state).toBe('open');
    // The same instant is 03:00 in a UTC±0 place → before the 11:00 open.
    expect(resolveOpeningStatus(MON_FRI_11_22, 0, instant).state).toBe('closed');
  });
});

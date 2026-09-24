import type { PublishedPoiOpeningHours, PublishedPoiOpeningPeriod } from 'shared-types';

/**
 * Photo Experience Prototype checkpoint (rich-detail expansion) — a PURE
 * "Open now / Closed / Opens …" resolver for a `PublishedPoi.place`.
 *
 * The publication snapshots only the REGULAR weekly schedule (`periods` +
 * Google's already-localized `weekdayDescriptions`) plus the place's
 * `utcOffsetMinutes` — never Google's time-of-publish `openNow`. This
 * function evaluates that schedule against the visitor's own clock, in the
 * PLACE's timezone (via `utcOffsetMinutes`), so the badge is correct
 * wherever the visitor is.
 *
 * Without `utcOffsetMinutes` there is no safe way to know the place's local
 * time, so the state is `'unknown'` and the caller shows only the weekday
 * list — never a possibly-wrong "Open now".
 */

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type OpeningState = 'open' | 'closed' | 'unknown';

export interface OpeningStatus {
  readonly state: OpeningState;
  /** A short human detail for the badge, e.g. `"Closes 10:00 PM"` / `"Opens Mon 11:00 AM"`. Absent when nothing useful can be said. */
  readonly detail?: string;
}
export interface OpeningHoursLabels { readonly opens: string; readonly closes: string; readonly days: readonly string[]; }

function pointToMinutes(point: { day: number; hour: number; minute: number }): number {
  return point.day * MINUTES_PER_DAY + point.hour * 60 + point.minute;
}

/**
 * `[start, end)` minute-of-week window for a period, with `end` unwrapped
 * past `start` (a period crossing midnight / the week boundary). A period
 * with NO `close` is Google's representation of "open continuously from this
 * point" (a 24/7 place uses `open: {day:0, hour:0, minute:0}` + no close) —
 * modeled here as open for the whole week from `open`.
 */
function periodWindow(period: PublishedPoiOpeningPeriod): { start: number; end: number } {
  const start = pointToMinutes(period.open);
  if (!period.close) {
    return { start, end: start + MINUTES_PER_WEEK };
  }
  let end = pointToMinutes(period.close);
  if (end <= start) {
    end += MINUTES_PER_WEEK;
  }
  return { start, end };
}

function formatClock(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatOpenPoint(minuteOfWeek: number, currentDay: number, labels?: OpeningHoursLabels): string {
  const normalized = ((minuteOfWeek % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  const day = Math.floor(normalized / MINUTES_PER_DAY) % 7;
  const hour = Math.floor((normalized % MINUTES_PER_DAY) / 60);
  const minute = normalized % 60;
  const clock = formatClock(hour, minute);
  const opens = labels?.opens ?? 'Opens';
  const days = labels?.days ?? DAY_LABELS;
  return day === currentDay ? `${opens} ${clock}` : `${opens} ${days[day]} ${clock}`;
}

/**
 * `now` defaults to the real current time; passable for deterministic tests.
 * Returns `'unknown'` (no badge) whenever the schedule can't be evaluated
 * confidently — never a guess.
 */
export function resolveOpeningStatus(
  openingHours: PublishedPoiOpeningHours | undefined,
  utcOffsetMinutes: number | undefined,
  now: Date = new Date(),
  labels?: OpeningHoursLabels,
): OpeningStatus {
  if (!openingHours || openingHours.periods.length === 0 || utcOffsetMinutes === undefined) {
    return { state: 'unknown' };
  }

  // Place-local wall clock: shift the UTC instant by the place's offset,
  // then read the shifted value's UTC parts.
  const placeLocal = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  const currentDay = placeLocal.getUTCDay();
  const nowMinutes = currentDay * MINUTES_PER_DAY + placeLocal.getUTCHours() * 60 + placeLocal.getUTCMinutes();

  const windows = openingHours.periods.map(periodWindow);

  // Open if `now` (or `now + a week`, to catch a window that wrapped) is inside any window.
  for (const { start, end } of windows) {
    if ((nowMinutes >= start && nowMinutes < end) || (nowMinutes + MINUTES_PER_WEEK >= start && nowMinutes + MINUTES_PER_WEEK < end)) {
      const closeMinute = end % MINUTES_PER_WEEK;
      const hour = Math.floor((closeMinute % MINUTES_PER_DAY) / 60);
      const minute = closeMinute % 60;
      return { state: 'open', detail: `${labels?.closes ?? 'Closes'} ${formatClock(hour, minute)}` };
    }
  }

  // Closed — find the soonest upcoming opening within the next week.
  let soonest = Infinity;
  for (const { start } of windows) {
    const delta = (start - nowMinutes + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
    if (delta < soonest) {
      soonest = delta;
    }
  }
  if (soonest === Infinity) {
    return { state: 'closed' };
  }
  return { state: 'closed', detail: formatOpenPoint(nowMinutes + soonest, currentDay, labels) };
}

// Timezone helpers. Day boundaries always follow the user's own timezone so
// "today", the 2-day back-fill window and deadline defaults line up with the
// calendar the user is actually looking at.

export function timezoneOf(timezone?: string | null): string {
  const value = (timezone ?? '').trim();
  return value ? value : 'UTC';
}

const DAY_KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Intl.DateTimeFormat construction is expensive (locale data lookup). Hot paths
// such as the streak endpoint call these helpers once per row, so formatters
// are cached per timezone.
const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function dayKeyFormatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = dayKeyFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayKeyFormatters.set(timezone, formatter);
  }
  return formatter;
}

/** 'YYYY-MM-DD' for a moment, expressed in the given timezone. */
export function dayKeyInTz(date: Date, timezone: string): string {
  return dayKeyFormatterFor(timezone).format(date);
}

export function todayKey(timezone: string, now: Date = new Date()): string {
  return dayKeyInTz(now, timezone);
}

/** Shift a 'YYYY-MM-DD' key by whole days (UTC-safe, no DST involved). */
export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return DAY_KEY_FORMAT.format(date);
}

/** Offset (ms) of `timeZone` relative to UTC at a given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return asUtc - instant.getTime();
}

/** Wall-clock time in a timezone, as the UTC instant it corresponds to. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let timestamp = guess - tzOffsetMs(new Date(guess), timeZone);
  // Second pass: the first guess can land on the other side of a DST switch.
  timestamp = guess - tzOffsetMs(new Date(timestamp), timeZone);
  return new Date(timestamp);
}

/** 23:59 local time on the given day key, as an instant. */
export function endOfDayInstant(dayKey: string, timezone: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return zonedTimeToUtc(year, month, day, 23, 59, timezone);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DeadlineResult =
  | { ok: true; dueAt: Date }
  | { ok: false; error: string };

/**
 * Resolves the raw deadline a client sent into an absolute instant.
 * - missing            -> startAt + 24h
 * - 'YYYY-MM-DD'       -> 23:59 in the user's timezone on that day
 * - full date/time     -> parsed as-is
 * Always enforces dueAt > startAt.
 */
export function resolveDeadline(
  raw: unknown,
  startAt: Date,
  timezone: string
): DeadlineResult {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, dueAt: new Date(startAt.getTime() + 24 * 60 * 60 * 1000) };
  }

  let dueAt: Date | null = null;
  if (typeof raw === 'string') {
    const dateOnly = DATE_ONLY.exec(raw.trim());
    if (dateOnly) dueAt = endOfDayInstant(raw.trim(), timezone);
    else dueAt = new Date(raw);
  } else if (raw instanceof Date) {
    dueAt = new Date(raw.getTime());
  }

  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    return { ok: false, error: 'Invalid deadline' };
  }
  if (dueAt.getTime() <= startAt.getTime()) {
    return { ok: false, error: 'Deadline must be after the task start' };
  }
  return { ok: true, dueAt };
}

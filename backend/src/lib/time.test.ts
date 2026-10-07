import { describe, it, expect } from 'vitest';
import {
  timezoneOf,
  dayKeyInTz,
  todayKey,
  shiftDayKey,
  endOfDayInstant,
  resolveDeadline,
} from './time';

describe('timezoneOf', () => {
  it('falls back to UTC for missing or blank values', () => {
    expect(timezoneOf()).toBe('UTC');
    expect(timezoneOf(null)).toBe('UTC');
    expect(timezoneOf('')).toBe('UTC');
    expect(timezoneOf('   ')).toBe('UTC');
  });

  it('passes through a real timezone', () => {
    expect(timezoneOf('Europe/Tallinn')).toBe('Europe/Tallinn');
  });
});

describe('dayKeyInTz / todayKey', () => {
  it('formats the UTC instant in the requested timezone', () => {
    const instant = new Date('2026-01-01T00:30:00Z');
    expect(dayKeyInTz(instant, 'UTC')).toBe('2026-01-01');
    // UTC+2 in winter: 02:30 local, still Jan 1.
    expect(dayKeyInTz(instant, 'Europe/Tallinn')).toBe('2026-01-01');
    // UTC-5: 19:30 local on Dec 31.
    expect(dayKeyInTz(instant, 'America/New_York')).toBe('2025-12-31');
  });

  it('todayKey uses the provided clock', () => {
    expect(todayKey('UTC', new Date('2026-06-15T23:59:59Z'))).toBe('2026-06-15');
    expect(todayKey('Pacific/Auckland', new Date('2026-06-15T23:59:59Z'))).toBe('2026-06-16');
  });

  it('keeps day keys aligned around UTC+5:30 and UTC-8 midnight', () => {
    expect(todayKey('Asia/Kolkata', new Date('2026-10-07T19:00:00Z'))).toBe('2026-10-08');
    expect(todayKey('Etc/GMT+8', new Date('2026-10-07T07:30:00Z'))).toBe('2026-10-06');
  });
});

describe('shiftDayKey', () => {
  it('shifts across month and year boundaries', () => {
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDayKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('is a no-op for 0 days', () => {
    expect(shiftDayKey('2026-06-15', 0)).toBe('2026-06-15');
  });
});

describe('endOfDayInstant', () => {
  it('resolves 23:59 in the given timezone', () => {
    const utc = endOfDayInstant('2026-06-16', 'UTC');
    expect(utc.toISOString()).toBe('2026-06-16T23:59:00.000Z');
    const tallinn = endOfDayInstant('2026-06-16', 'Europe/Tallinn');
    expect(tallinn.toISOString()).toBe('2026-06-16T20:59:00.000Z');
  });
});

describe('resolveDeadline', () => {
  const start = new Date('2026-06-15T10:00:00Z');

  it('defaults to start + 24h when no deadline is given', () => {
    for (const raw of [undefined, null, '']) {
      const result = resolveDeadline(raw, start, 'UTC');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.dueAt.getTime()).toBe(start.getTime() + 24 * 60 * 60 * 1000);
    }
  });

  it('turns a date-only deadline into 23:59 in the user timezone', () => {
    const result = resolveDeadline('2026-06-16', start, 'UTC');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dueAt.toISOString()).toBe('2026-06-16T23:59:00.000Z');
  });

  it('accepts a full ISO deadline', () => {
    const result = resolveDeadline('2026-06-17T09:30:00.000Z', start, 'UTC');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dueAt.toISOString()).toBe('2026-06-17T09:30:00.000Z');
  });

  it('rejects a deadline at or before the start', () => {
    expect(resolveDeadline('2026-06-15T10:00:00.000Z', start, 'UTC').ok).toBe(false);
    expect(resolveDeadline('2026-06-14T10:00:00.000Z', start, 'UTC').ok).toBe(false);
  });

  it('rejects unparsable deadlines', () => {
    expect(resolveDeadline('not-a-date', start, 'UTC').ok).toBe(false);
    expect(resolveDeadline(42 as unknown as string, start, 'UTC').ok).toBe(false);
  });
});

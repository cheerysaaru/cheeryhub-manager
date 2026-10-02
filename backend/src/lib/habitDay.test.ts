import { describe, it, expect } from 'vitest';
import { BACK_FILL_DAYS, LOCKED_TOOLTIP, resolveHabitDayKey, isHabitDayEditable } from './habitDay';

describe('resolveHabitDayKey (3-day edit window)', () => {
  const TODAY = '2026-10-02';

  it('defaults to today when no day is given', () => {
    expect(resolveHabitDayKey(undefined, TODAY)).toEqual({ ok: true, key: '2026-10-02' });
    expect(resolveHabitDayKey('', TODAY)).toEqual({ ok: true, key: '2026-10-02' });
    expect(resolveHabitDayKey(null, TODAY)).toEqual({ ok: true, key: '2026-10-02' });
  });

  it('allows today', () => {
    expect(resolveHabitDayKey('2026-10-02', TODAY)).toEqual({ ok: true, key: '2026-10-02' });
  });

  it('allows yesterday', () => {
    expect(resolveHabitDayKey('2026-10-01', TODAY)).toEqual({ ok: true, key: '2026-10-01' });
  });

  it('allows the day before yesterday (bottom of the window)', () => {
    expect(resolveHabitDayKey('2026-09-30', TODAY)).toEqual({ ok: true, key: '2026-09-30' });
  });

  it('rejects days older than the window with the locked message', () => {
    expect(resolveHabitDayKey('2026-09-29', TODAY)).toEqual({
      ok: false,
      error: 'Only today and the last 2 days can be updated',
    });
  });

  it('rejects future dates', () => {
    expect(resolveHabitDayKey('2026-10-03', TODAY)).toEqual({
      ok: false,
      error: 'Cannot update a future day',
    });
  });

  it('rejects malformed dates', () => {
    expect(resolveHabitDayKey('2026-10-2', TODAY).ok).toBe(false);
    expect(resolveHabitDayKey('yesterday', TODAY).ok).toBe(false);
    expect(resolveHabitDayKey('10/01/2026', TODAY).ok).toBe(false);
  });

  it('crosses month and year boundaries correctly', () => {
    expect(resolveHabitDayKey('2026-12-31', '2027-01-01')).toEqual({ ok: true, key: '2026-12-31' });
    expect(resolveHabitDayKey('2026-12-30', '2027-01-01')).toEqual({ ok: true, key: '2026-12-30' });
    expect(resolveHabitDayKey('2026-12-29', '2027-01-01').ok).toBe(false);
  });
});

describe('isHabitDayEditable', () => {
  const TODAY = '2026-10-02';

  it('is editable for today and the two previous days only', () => {
    expect(isHabitDayEditable('2026-10-02', TODAY)).toBe(true);
    expect(isHabitDayEditable('2026-10-01', TODAY)).toBe(true);
    expect(isHabitDayEditable('2026-09-30', TODAY)).toBe(true);
    expect(isHabitDayEditable('2026-09-29', TODAY)).toBe(false);
    expect(isHabitDayEditable('2026-10-03', TODAY)).toBe(false);
  });

  it('agrees with resolveHabitDayKey', () => {
    for (const day of ['2026-10-04', '2026-10-02', '2026-10-01', '2026-09-30', '2026-09-29', '2026-09-01']) {
      const resolved = resolveHabitDayKey(day, TODAY);
      expect(isHabitDayEditable(day, TODAY)).toBe(resolved.ok);
    }
  });

  it('exposes a 2-day backfill window and a readable lock tooltip', () => {
    expect(BACK_FILL_DAYS).toBe(2);
    expect(LOCKED_TOOLTIP).toBe('Locked after 2 days');
  });
});


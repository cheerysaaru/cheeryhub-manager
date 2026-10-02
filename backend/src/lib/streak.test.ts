import { describe, it, expect } from 'vitest';
import { streakFromDays } from './streak';

describe('streakFromDays', () => {
  const TODAY = '2026-10-02';

  it('returns zeros for no activity', () => {
    expect(streakFromDays([], TODAY)).toEqual({ current: 0, best: 0, todayActive: false });
  });

  it('counts today as an active streak', () => {
    expect(streakFromDays(['2026-10-02'], TODAY)).toEqual({
      current: 1,
      best: 1,
      todayActive: true,
    });
  });

  it('keeps the current streak alive before today is logged (anchored on yesterday)', () => {
    expect(streakFromDays(['2026-10-01'], TODAY)).toEqual({
      current: 1,
      best: 1,
      todayActive: false,
    });
  });

  it('breaks the current streak when the last activity is older than yesterday', () => {
    const res = streakFromDays(['2026-09-30'], TODAY);
    expect(res.current).toBe(0);
    expect(res.best).toBe(1);
  });

  it('counts consecutive days including today', () => {
    expect(
      streakFromDays(['2026-10-02', '2026-10-01', '2026-09-30'], TODAY)
    ).toEqual({ current: 3, best: 3, todayActive: true });
  });

  it('counts a run ending yesterday as current', () => {
    expect(streakFromDays(['2026-10-01', '2026-09-30'], TODAY)).toEqual({
      current: 2,
      best: 2,
      todayActive: false,
    });
  });

  it('is order-independent and de-duplicates repeated days', () => {
    expect(
      streakFromDays(['2026-09-30', '2026-10-02', '2026-10-01', '2026-10-01'], TODAY)
    ).toEqual({ current: 3, best: 3, todayActive: true });
  });

  it('resets the current streak across a gap but keeps the best run', () => {
    // active 5..4 days ago, then a gap, then today
    const res = streakFromDays(['2026-09-27', '2026-09-28', '2026-10-02'], TODAY);
    expect(res.current).toBe(1);
    expect(res.best).toBe(2);
    expect(res.todayActive).toBe(true);
  });

  it('handles month boundaries', () => {
    expect(streakFromDays(['2026-09-30', '2026-10-01'], TODAY)).toEqual({
      current: 2,
      best: 2,
      todayActive: false,
    });
  });

  it('handles a year boundary', () => {
    expect(streakFromDays(['2025-12-31', '2026-01-01'], '2026-01-01')).toEqual({
      current: 2,
      best: 2,
      todayActive: true,
    });
  });
});

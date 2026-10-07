import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  buildWeekDateKeys,
  buildWeekDays,
  dayStatus,
  habitStartKey,
  isEditableDay,
  monthLabel,
  monthsThrough,
  monthSummary,
  currentStreak,
  bestStreak,
  dayKeyOf,
  weekdayHeaders,
  EDIT_WINDOW_DAYS,
  LOCKED_TOOLTIP,
} from './commitmentCalendar';
import { dateKeyInTimeZone, parseLocalDate, todayISO } from './date';

function assertWellFormedGrid(year: number, month: number) {
  const grid = buildMonthGrid(year, month);
  expect(grid.length % 7).toBe(0);
  // Monday-first: every first column cell is a Monday
  for (let index = 0; index < grid.length; index += 7) {
    expect(parseLocalDate(grid[index].date).getDay()).toBe(1);
  }
  // Every cell carries its real date number and in-month cells sit in the month
  for (const cell of grid) {
    expect(cell.day).toBe(parseLocalDate(cell.date).getDate());
    if (cell.inMonth) {
      const parsed = parseLocalDate(cell.date);
      expect(parsed.getMonth()).toBe(month);
      expect(parsed.getFullYear()).toBe(year);
    }
  }
  // Every day of the month appears exactly once
  const inMonthDays = grid.filter((cell) => cell.inMonth).map((cell) => cell.day);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  expect(inMonthDays).toHaveLength(daysInMonth);
  expect(new Set(inMonthDays).size).toBe(daysInMonth);
  return grid;
}

describe('buildMonthGrid', () => {
  it('lays out a 28-day February on Monday-first weeks', () => {
    const grid = assertWellFormedGrid(2026, 1); // Feb 2026
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(28);
    expect(grid).toHaveLength(35); // 6 leading + 28 = 34 -> 5 weeks
  });

  it('lays out a 29-day leap February', () => {
    const grid = assertWellFormedGrid(2024, 1); // Feb 2024 (leap)
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(29);
    expect(grid.some((cell) => cell.inMonth && cell.day === 29)).toBe(true);
  });

  it('lays out 30- and 31-day months', () => {
    assertWellFormedGrid(2026, 3); // Apr 2026, 30 days
    expect(buildMonthGrid(2026, 3).filter((c) => c.inMonth)).toHaveLength(30);
    assertWellFormedGrid(2026, 0); // Jan 2026, 31 days
    expect(buildMonthGrid(2026, 0).filter((c) => c.inMonth)).toHaveLength(31);
    assertWellFormedGrid(2026, 7); // Aug 2026, 31 days
  });

  it('pads with real neighbouring dates, never blanks', () => {
    const grid = buildMonthGrid(2026, 9); // Oct 2026 starts on a Thursday
    const outside = grid.filter((cell) => !cell.inMonth);
    expect(outside.length).toBeGreaterThan(0);
    for (const cell of outside) {
      expect(cell.day).toBeGreaterThanOrEqual(1);
      expect(cell.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('handles a December-to-January year boundary', () => {
    const grid = assertWellFormedGrid(2026, 11);
    expect(grid.some((cell) => !cell.inMonth && cell.day >= 1)).toBe(true);
  });
});

describe('weekdayHeaders / monthLabel', () => {
  it('starts the week on Monday', () => {
    const headers = weekdayHeaders('en-US');
    expect(headers).toHaveLength(7);
    expect(headers[0].toLowerCase().startsWith('m')).toBe(true);
    expect(headers[6].toLowerCase().startsWith('s')).toBe(true);
  });

  it('labels months with year', () => {
    expect(monthLabel(2026, 9, 'en-US')).toContain('2026');
    expect(monthLabel(2026, 9, 'en-US').toLowerCase()).toContain('october');
  });
});

describe('dayStatus (including not-started days)', () => {
  const habit = {
    completedDates: ['2026-09-25'],
    failedDates: ['2026-09-26'],
    skippedDates: ['2026-09-27'],
    createdAt: '2026-09-20T12:00:00.000Z',
  };
  const today = '2026-10-02';

  it('marks days before the commitment existed as not started', () => {
    expect(dayStatus(habit, '2026-09-19', today)).toBe('NOT_STARTED');
    expect(dayStatus(habit, '2026-09-01', today)).toBe('NOT_STARTED');
  });

  it('marks the future as not started yet', () => {
    expect(dayStatus(habit, '2026-10-03', today)).toBe('FUTURE');
  });

  it('returns recorded statuses', () => {
    expect(dayStatus(habit, '2026-09-25', today)).toBe('COMPLETED');
    expect(dayStatus(habit, '2026-09-26', today)).toBe('FAILED');
    expect(dayStatus(habit, '2026-09-27', today)).toBe('SKIPPED');
  });

  it('returns empty for tracked days with nothing recorded', () => {
    expect(dayStatus(habit, '2026-09-28', today)).toBe('EMPTY');
    expect(dayStatus(habit, '2026-10-02', today)).toBe('EMPTY');
  });
});

describe('isEditableDay (3-day window + lock)', () => {
  const today = '2026-10-02';

  it('allows today and exactly the two previous days', () => {
    expect(EDIT_WINDOW_DAYS).toBe(2);
    expect(LOCKED_TOOLTIP).toBe('Locked after 2 days');
    expect(isEditableDay('2026-10-02', today)).toBe(true);
    expect(isEditableDay('2026-10-01', today)).toBe(true);
    expect(isEditableDay('2026-09-30', today)).toBe(true);
  });

  it('locks older days and the future', () => {
    expect(isEditableDay('2026-09-29', today)).toBe(false);
    expect(isEditableDay('2026-09-01', today)).toBe(false);
    expect(isEditableDay('2026-10-03', today)).toBe(false);
  });

  it('crosses month and year boundaries', () => {
    expect(isEditableDay('2026-12-31', '2027-01-01')).toBe(true);
    expect(isEditableDay('2026-12-30', '2027-01-01')).toBe(true);
    expect(isEditableDay('2026-12-29', '2027-01-01')).toBe(false);
  });
});

describe('commitment week strip', () => {
  it('always creates seven Monday-first cells for commitments of any age', () => {
    const today = '2026-10-07';
    const expected = [
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ];
    const createdToday = {
      completedDates: [],
      failedDates: [],
      skippedDates: [],
      createdAt: '2026-10-07T10:00:00.000Z',
    };
    const createdWeeksAgo = {
      ...createdToday,
      createdAt: '2026-09-16T10:00:00.000Z',
    };

    expect(buildWeekDateKeys(today)).toEqual(expected);
    expect(buildWeekDays(createdToday, today, 'UTC')).toHaveLength(7);
    expect(buildWeekDays(createdWeeksAgo, today, 'UTC')).toHaveLength(7);
    expect(buildWeekDays(createdToday, today, 'UTC')[2]).toMatchObject({
      date: today,
      status: 'EMPTY',
      editable: true,
    });
    expect(buildWeekDays(createdToday, today, 'UTC').slice(0, 2).map((day) => day.status))
      .toEqual(['NOT_STARTED', 'NOT_STARTED']);
  });

  it('shows days before a Wednesday commitment as not started, not failed', () => {
    const days = buildWeekDays({
      completedDates: [],
      failedDates: [],
      skippedDates: [],
      createdAt: '2026-10-07T12:00:00.000Z',
    }, '2026-10-11', 'UTC');

    expect(days).toHaveLength(7);
    expect(days.slice(0, 2).map((day) => day.status)).toEqual(['NOT_STARTED', 'NOT_STARTED']);
    expect(days[0].editable).toBe(false);
    expect(days[2].status).toBe('EMPTY');
  });

  it('locks days outside the edit window and keeps future days disabled', () => {
    const days = buildWeekDays({
      completedDates: [],
      failedDates: [],
      skippedDates: [],
      createdAt: '2026-09-16T10:00:00.000Z',
    }, '2026-10-08', 'UTC');

    expect(days[0]).toMatchObject({ date: '2026-10-05', editable: false });
    expect(days[1]).toMatchObject({ date: '2026-10-06', editable: true });
    expect(days[3]).toMatchObject({ date: '2026-10-08', editable: true });
    expect(days[4]).toMatchObject({ date: '2026-10-09', status: 'FUTURE', editable: false });
  });

  it('uses the user timezone when an instant crosses local midnight', () => {
    const afterUtcMidnightInIndia = new Date('2026-10-07T19:00:00.000Z');
    const beforeLocalMidnightAtUtcMinusEight = new Date('2026-10-07T07:30:00.000Z');

    expect(todayISO('Asia/Kolkata', afterUtcMidnightInIndia)).toBe('2026-10-08');
    expect(dateKeyInTimeZone(beforeLocalMidnightAtUtcMinusEight, 'Etc/GMT+8')).toBe('2026-10-06');
    expect(dayKeyOf('2026-10-07T19:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-08');
  });
});

describe('monthSummary', () => {
  it('counts only tracked, non-future days and computes completion %', () => {
    const habit = {
      completedDates: ['2026-10-01', '2026-10-02'],
      failedDates: ['2026-10-04'],
      skippedDates: [],
      createdAt: '2026-09-15T12:00:00.000Z',
    };
    const summary = monthSummary(habit, 2026, 9, '2026-10-05'); // October 2026
    expect(summary.checked).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.eligible).toBe(5); // Oct 1-5
    expect(summary.completionPct).toBe(40);
  });

  it('excludes days before creation', () => {
    const habit = { completedDates: [], failedDates: [], skippedDates: [], createdAt: '2026-10-15T12:00:00.000Z' };
    const summary = monthSummary(habit, 2026, 9, '2026-10-31');
    // createdAt lands on Oct 14-16 depending on the machine's timezone
    expect(summary.eligible).toBeGreaterThanOrEqual(15);
    expect(summary.eligible).toBeLessThanOrEqual(17);
    expect(summary.checked).toBe(0);
  });
});

describe('streaks', () => {
  it('current streak survives until end of today', () => {
    expect(currentStreak(['2026-10-01', '2026-10-02'], '2026-10-02')).toBe(2);
    expect(currentStreak(['2026-10-01'], '2026-10-02')).toBe(1);
    expect(currentStreak(['2026-09-30'], '2026-10-02')).toBe(0);
    expect(currentStreak([], '2026-10-02')).toBe(0);
  });

  it('best streak finds the longest run ever', () => {
    expect(bestStreak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-06'])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });
});

describe('monthsThrough + habitStartKey', () => {
  it('lists months newest-first from creation month to today', () => {
    const months = monthsThrough('2026-08-15', '2026-10-02');
    expect(months).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 8 },
      { year: 2026, month: 7 },
    ]);
  });

  it('crosses year boundaries', () => {
    const months = monthsThrough('2026-11-30', '2027-01-05');
    expect(months).toEqual([
      { year: 2027, month: 0 },
      { year: 2026, month: 11 },
      { year: 2026, month: 10 },
    ]);
  });

  it('single month when created this month', () => {
    expect(monthsThrough('2026-10-01', '2026-10-02')).toEqual([{ year: 2026, month: 9 }]);
  });

  it('habitStartKey prefers the earliest recorded day over createdAt', () => {
    expect(
      habitStartKey({
        completedDates: ['2026-08-01'],
        failedDates: [],
        skippedDates: [],
        createdAt: '2026-09-01T12:00:00.000Z',
      })
    ).toBe('2026-08-01');
  });

  it('habitStartKey uses createdAt when no earlier record exists', () => {
    const key = habitStartKey({
      completedDates: ['2026-10-05'],
      failedDates: [],
      skippedDates: [],
      createdAt: '2026-09-01T12:00:00.000Z',
    });
    expect(key).not.toBe('2026-10-05');
    expect(key).toMatch(/^2026-(08|09)-/); // Aug 31 - Sep 2 depending on timezone
  });

  it('habitStartKey is null with no history at all', () => {
    expect(habitStartKey({ completedDates: [], failedDates: [], skippedDates: [] })).toBeNull();
  });
});

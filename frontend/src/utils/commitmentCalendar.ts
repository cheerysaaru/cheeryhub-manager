/**
 * Pure helpers for the Commitments history month calendars.
 * Everything here is side-effect free so the calendar can be unit tested and
 * only the visible month is ever computed (older months load on demand).
 */
import {
  dateKeyInTimeZone,
  getLocalDateString,
  parseLocalDate,
  shiftDate,
} from "./date";

/** Users may fix today and the last 2 days — mirrors the server window. */
export const EDIT_WINDOW_DAYS = 2;

/** Tooltip shown on locked (too old) days in the UI. */
export const LOCKED_TOOLTIP = `Locked after ${EDIT_WINDOW_DAYS} days`;

export type DayStatus =
  "COMPLETED" | "FAILED" | "SKIPPED" | "EMPTY" | "NOT_STARTED" | "FUTURE";

export type EditableStatus = "COMPLETED" | "FAILED" | "SKIPPED" | "EMPTY";

export const STATUS_LABEL: Record<DayStatus, string> = {
  COMPLETED: "checked in",
  FAILED: "failed",
  SKIPPED: "left",
  EMPTY: "nothing recorded",
  NOT_STARTED: "not started",
  FUTURE: "not started yet",
};

export interface HabitDayData {
  completedDates: string[];
  failedDates: string[];
  skippedDates: string[];
  /** ISO timestamp of when the commitment was created. */
  createdAt?: string;
}

export interface MonthCell {
  /** Local 'YYYY-MM-DD'. */
  date: string;
  /** Day of month, 1-31 — every cell always carries a number. */
  day: number;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
}

/** Local 'YYYY-MM-DD' for an ISO timestamp (date part only). */
export function dayKeyOf(iso: string, timeZone?: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dateKeyInTimeZone(date, timeZone);
}

/**
 * Mon-Sun grid for one month, padded with the real dates of the neighbouring
 * months so no cell is ever an empty square.
 */
export function buildMonthGrid(year: number, monthIndex: number): MonthCell[] {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Monday = 0
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;
  const cells: MonthCell[] = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(year, monthIndex, 1 - leading + index);
    cells.push({
      date: getLocalDateString(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex && date.getFullYear() === year,
    });
  }
  return cells;
}

/** e.g. "October 2026". */
export function monthLabel(
  year: number,
  monthIndex: number,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
}

/** Localised short weekday names, Monday first. */
export function weekdayHeaders(locale?: string): string[] {
  const monday = new Date(2024, 0, 1); // 1 Jan 2024 is a Monday
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + index,
    );
    return formatter.format(date);
  });
}

/** e.g. "Friday, October 2, 2026". */
export function formatFullDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(date));
}

/** e.g. "Wed, 30 Sep 2026" — menu and toast heading for one day. */
export function formatShortFullDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseLocalDate(date));
}

/** Shift a (year, monthIndex) anchor by whole months. */
export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; month: number } {
  const date = new Date(year, monthIndex + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * First day that can hold data for this commitment: its creation day, or the
 * earliest recorded day if history predates it (e.g. an import).
 */
export function habitStartKey(
  habit: HabitDayData,
  timeZone?: string,
): string | null {
  const recorded = [
    ...habit.completedDates,
    ...habit.failedDates,
    ...habit.skippedDates,
  ].sort();
  const created = habit.createdAt ? dayKeyOf(habit.createdAt, timeZone) : null;
  if (recorded.length && created)
    return recorded[0] < created ? recorded[0] : created;
  if (recorded.length) return recorded[0];
  return created;
}

/** Newest-first list of months from the first tracked month through `today`. */
export function monthsThrough(
  startKey: string,
  today: string,
): { year: number; month: number }[] {
  const start = parseLocalDate(startKey);
  const end = parseLocalDate(today);
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const cursor = new Date(end.getFullYear(), end.getMonth(), 1);
  const months: { year: number; month: number }[] = [];
  while (
    cursor.getFullYear() > first.getFullYear() ||
    (cursor.getFullYear() === first.getFullYear() &&
      cursor.getMonth() >= first.getMonth())
  ) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

/**
 * Status of one day:
 * future > recorded status > before the commitment existed (not started) >
 * nothing recorded.
 */
export function dayStatus(
  habit: HabitDayData,
  date: string,
  today: string,
  timeZone?: string,
): DayStatus {
  if (date > today) return "FUTURE";
  const created = habit.createdAt ? dayKeyOf(habit.createdAt, timeZone) : null;
  if (created && date < created) return "NOT_STARTED";
  if (habit.completedDates.includes(date)) return "COMPLETED";
  if (habit.failedDates.includes(date)) return "FAILED";
  if (habit.skippedDates.includes(date)) return "SKIPPED";
  return "EMPTY";
}

/** Today and the previous `EDIT_WINDOW_DAYS` days only — never the future. */
export function isEditableDay(date: string, today: string): boolean {
  if (date > today) return false;
  return date >= shiftDate(today, -EDIT_WINDOW_DAYS);
}

export interface WeekDay {
  date: string;
  status: DayStatus;
  editable: boolean;
}

export function buildWeekDateKeys(today: string): string[] {
  const weekday = parseLocalDate(today).getDay();
  const monday = shiftDate(today, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export function buildWeekDays(
  habit: HabitDayData,
  today: string,
  timeZone?: string,
): WeekDay[] {
  return buildWeekDateKeys(today).map((date) => {
    const status = dayStatus(habit, date, today, timeZone);
    return {
      date,
      status,
      editable: status !== "NOT_STARTED" && isEditableDay(date, today),
    };
  });
}

/** Cycle order: check in -> failed -> leave -> clear. */
export function nextDayStatus(current: DayStatus): EditableStatus {
  if (current === "COMPLETED") return "FAILED";
  if (current === "FAILED") return "SKIPPED";
  return "COMPLETED";
}

export interface MonthSummary {
  checked: number;
  failed: number;
  leave: number;
  /** Days in the visible month that count (from creation day up to today). */
  eligible: number;
  /** checked / eligible, 0-100. */
  completionPct: number;
}

/** Totals + completion % for the visible month only. */
export function monthSummary(
  habit: HabitDayData,
  year: number,
  monthIndex: number,
  today: string,
  timeZone?: string,
): MonthSummary {
  const created = habit.createdAt ? dayKeyOf(habit.createdAt, timeZone) : null;
  let checked = 0;
  let failed = 0;
  let leave = 0;
  let eligible = 0;
  for (const cell of buildMonthGrid(year, monthIndex)) {
    if (!cell.inMonth) continue;
    if (cell.date > today) continue;
    if (created && cell.date < created) continue;
    eligible += 1;
    const status = dayStatus(habit, cell.date, today, timeZone);
    if (status === "COMPLETED") checked += 1;
    else if (status === "FAILED") failed += 1;
    else if (status === "SKIPPED") leave += 1;
  }
  return {
    checked,
    failed,
    leave,
    eligible,
    completionPct: eligible ? Math.round((checked / eligible) * 100) : 0,
  };
}

/** Consecutive checked-in days ending today (or yesterday if today is open). */
export function currentStreak(completedDates: string[], today: string): number {
  const days = new Set(completedDates);
  let cursor = days.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive checked-in days ever. */
export function bestStreak(completedDates: string[]): number {
  const sorted = [...new Set(completedDates)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous && shiftDate(previous, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }
  return best;
}

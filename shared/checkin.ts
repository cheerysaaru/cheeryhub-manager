/**
 * ONE shared check-in editability rule — used by BOTH the React frontend and
 * the Cloudflare Worker backend so the two can never disagree.
 *
 * Editable = today, yesterday, or the day before yesterday, computed in
 * Asia/Colombo (UTC+5:30). Never UTC, never device-local. Future dates are
 * never editable.
 */
export const CHECKIN_TIMEZONE = "Asia/Colombo";

/** today + the previous 2 days = 3 editable days. */
export const EDIT_WINDOW_DAYS = 2;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The 'YYYY-MM-DD' calendar day for `now` in the check-in timezone. */
export function todayInCheckinZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHECKIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Shift a 'YYYY-MM-DD' key by whole calendar days (timezone-independent). */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * True only when `date` is today, yesterday, or the day before yesterday in
 * Asia/Colombo. Rejects future dates and anything older than the window.
 */
export function isCheckInEditable(
  date: string,
  now: Date = new Date(),
): boolean {
  if (!DAY_KEY.test(date)) return false;
  const today = todayInCheckinZone(now);
  if (date > today) return false;
  return date >= shiftDayKey(today, -EDIT_WINDOW_DAYS);
}

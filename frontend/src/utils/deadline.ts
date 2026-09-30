/** Deadline helpers. Everything is computed in the user's local timezone. */

export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Local date + time as an ISO string the API can parse. */
export function combineDateTime(dateStr: string, timeStr: string): string | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const date = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Deadline for a day picked without a time: 23:59 local. */
export function endOfLocalDay(dateStr: string): string | null {
  return combineDateTime(dateStr, '23:59');
}

/** Server default: start + 24h (mirrored here so the UI can preview it). */
export function defaultDeadline(startAt: Date = new Date()): Date {
  return new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
}

export function formatDeadline(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}

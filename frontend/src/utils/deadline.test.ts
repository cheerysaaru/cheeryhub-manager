import { describe, it, expect } from 'vitest';
import {
  toDateInput,
  toTimeInput,
  combineDateTime,
  endOfLocalDay,
  defaultDeadline,
  formatDeadline,
} from './deadline';

describe('toDateInput / toTimeInput', () => {
  it('zero-pads local date and time parts', () => {
    const date = new Date(2026, 0, 5, 7, 5);
    expect(toDateInput(date)).toBe('2026-01-05');
    expect(toTimeInput(date)).toBe('07:05');
  });
});

describe('combineDateTime', () => {
  it('combines date and time into an ISO instant', () => {
    const iso = combineDateTime('2026-06-16', '09:30');
    expect(iso).not.toBeNull();
    const date = new Date(iso!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(16);
    expect(date.getHours()).toBe(9);
    expect(date.getMinutes()).toBe(30);
  });

  it('returns null for malformed input', () => {
    expect(combineDateTime('2026-06-16', 'nope')).toBeNull();
    expect(combineDateTime('', '09:30')).toBeNull();
    expect(combineDateTime('2026-06-16', 'ab:cd')).toBeNull();
  });
});

describe('endOfLocalDay', () => {
  it('resolves 23:59 for a day-only pick', () => {
    const iso = endOfLocalDay('2026-06-16');
    expect(iso).not.toBeNull();
    const date = new Date(iso!);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(59);
  });

  it('returns null for an invalid day', () => {
    expect(endOfLocalDay('garbage')).toBeNull();
  });
});

describe('defaultDeadline', () => {
  it('mirrors the server default of start + 24h', () => {
    const start = new Date('2026-06-15T10:00:00Z');
    expect(defaultDeadline(start).getTime()).toBe(start.getTime() + 24 * 60 * 60 * 1000);
  });
});

describe('formatDeadline', () => {
  it('returns an empty string without a valid deadline', () => {
    expect(formatDeadline()).toBe('');
    expect(formatDeadline(null)).toBe('');
    expect(formatDeadline('')).toBe('');
    expect(formatDeadline('not-a-date')).toBe('');
  });

  it('labels today and tomorrow', () => {
    expect(formatDeadline(new Date().toISOString())).toContain('Today');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatDeadline(tomorrow.toISOString())).toContain('Tomorrow');
  });
});

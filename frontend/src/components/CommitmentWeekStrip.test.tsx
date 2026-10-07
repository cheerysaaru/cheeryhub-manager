import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Habit } from '../types';
import { CommitmentWeekStrip, CommitmentWeekStripSkeleton } from './CommitmentWeekStrip';

function habit(createdAt: string): Habit {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Test commitment',
    frequency: 'DAILY',
    active: true,
    createdAt,
    updatedAt: createdAt,
    completedToday: false,
    failedToday: false,
    skippedToday: false,
    completedDays: 0,
    weekCompletedDays: 0,
    weekStart: '',
    weekDates: [],
    completedDates: [],
    failedDates: [],
    skippedDates: [],
  };
}

function renderStrip(createdAt: string, today: string) {
  return renderToStaticMarkup(
    <CommitmentWeekStrip
      habit={habit(createdAt)}
      today={today}
      timeZone="UTC"
      pending={false}
      onCheck={() => undefined}
      onDayTap={() => undefined}
    />
  );
}

function dayButtons(markup: string): RegExpMatchArray[] {
  return Array.from(markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g));
}

describe('CommitmentWeekStrip', () => {
  it('renders all seven dates for a commitment created today and leaves today tappable', () => {
    const markup = renderStrip('2026-10-07T10:00:00.000Z', '2026-10-07');
    const cells = dayButtons(markup);

    expect(cells).toHaveLength(7);
    expect(cells.every((cell) => /<b>\d+<\/b>/.test(cell[2]))).toBe(true);
    const today = cells.find(([attributes]) => attributes.includes(' today'));
    expect(today?.[1]).not.toContain('disabled');
    expect(today?.[1]).toContain('nothing recorded, tap to check in');
  });

  it('renders seven dates for commitments created three weeks earlier', () => {
    expect(dayButtons(renderStrip('2026-09-16T10:00:00.000Z', '2026-10-07'))).toHaveLength(7);
  });

  it('shows pre-creation Monday and Tuesday as faded not-started cells', () => {
    const cells = dayButtons(renderStrip('2026-10-07T12:00:00.000Z', '2026-10-11'));

    expect(cells).toHaveLength(7);
    expect(cells[0][1]).toContain('not-started');
    expect(cells[0][1]).not.toContain('failed');
    expect(cells[0][1]).toContain('disabled');
    expect(cells[1][1]).toContain('not-started');
  });

  it('disables days outside the editable window and future dates', () => {
    const cells = dayButtons(renderStrip('2026-09-16T10:00:00.000Z', '2026-10-08'));

    expect(cells[0][1]).toContain('outside-window locked');
    expect(cells[0][1]).toContain('disabled');
    expect(cells[1][1]).not.toContain('disabled');
    expect(cells[3][1]).not.toContain('disabled');
    expect(cells[4][1]).toContain('future');
    expect(cells[4][1]).toContain('disabled');
  });

  it('shows a seven-cell skeleton while week data loads', () => {
    const markup = renderToStaticMarkup(<CommitmentWeekStripSkeleton />);
    expect((markup.match(/week-day-skeleton/g) ?? [])).toHaveLength(7);
  });
});

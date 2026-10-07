import { CheckCircle2, Circle, CircleX, Coffee, Lock } from 'lucide-react';
import type { Habit } from '../types';
import {
  buildWeekDays,
  LOCKED_TOOLTIP,
  STATUS_LABEL,
  type DayStatus,
} from '../utils/commitmentCalendar';

interface DayMenuTarget {
  habitId: string;
  date: string;
  status: DayStatus;
  x: number;
  y: number;
}

interface CommitmentWeekStripProps {
  habit: Habit;
  today: string;
  timeZone: string;
  pending: boolean;
  onCheck: (id: string, date?: string) => void;
  onDayTap: (target: DayMenuTarget) => void;
}

function weekdayLabel(date: string): string {
  const utcMidday = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(utcMidday);
}

function dayIcon(status: DayStatus) {
  if (status === 'COMPLETED') return <CheckCircle2 size={18} />;
  if (status === 'FAILED') return <CircleX size={18} />;
  if (status === 'SKIPPED') return <Coffee size={18} />;
  return <Circle size={18} />;
}

export function CommitmentWeekStrip({
  habit,
  today,
  timeZone,
  pending,
  onCheck,
  onDayTap,
}: CommitmentWeekStripProps) {
  const days = buildWeekDays(habit, today, timeZone);

  return (
    <div className="week-panel commitment-week-strip">
      <div className="week-heading">
        <strong>{habit.weekCompletedDays}/7 this week</strong>
        <span>Mon–Sun</span>
      </div>
      <div className="day-buttons" role="group" aria-label="Commitment status this week">
        {days.map(({ date, status, editable }) => {
          const isToday = date === today;
          const isLocked = !editable && status !== 'FUTURE' && status !== 'NOT_STARTED';
          const classes = [
            'day-check',
            status === 'COMPLETED' ? 'checked' : '',
            status === 'FAILED' ? 'failed' : '',
            status === 'SKIPPED' ? 'skipped' : '',
            status === 'NOT_STARTED' ? 'not-started' : '',
            isToday ? 'today' : '',
            status === 'FUTURE' ? 'future' : '',
            isLocked ? 'outside-window locked' : '',
            editable && status === 'EMPTY' ? 'backfill' : '',
          ].filter(Boolean).join(' ');
          const label = weekdayLabel(date);
          const dayNumber = Number(date.slice(8, 10));
          const actionLabel = editable
            ? status === 'EMPTY' ? ', tap to check in' : ', tap to change'
            : isLocked ? ', locked' : '';

          return (
            <button
              key={date}
              type="button"
              disabled={!editable || pending}
              aria-busy={pending || undefined}
              className={classes}
              onClick={(event) => {
                if (!editable) return;
                if (status === 'COMPLETED' || status === 'FAILED' || status === 'SKIPPED') {
                  onDayTap({
                    habitId: habit.id,
                    date,
                    status,
                    x: event.clientX,
                    y: event.clientY,
                  });
                } else {
                  onCheck(habit.id, date);
                }
              }}
              aria-label={`${label} ${dayNumber}, ${STATUS_LABEL[status]}${actionLabel}`}
              title={isLocked ? LOCKED_TOOLTIP : STATUS_LABEL[status]}
            >
              {dayIcon(status)}
              {isLocked && <Lock className="day-lock" size={12} aria-hidden="true" />}
              <small>{label}</small>
              <b>{dayNumber}</b>
            </button>
          );
        })}
      </div>
      <p className="week-backfill-note">
        Today, yesterday and the day before stay editable — tap an empty day to check in, or a recorded day to change it.
      </p>
    </div>
  );
}

export function CommitmentWeekStripSkeleton() {
  return (
    <div className="week-panel week-panel-skeleton commitment-week-strip" role="status" aria-label="Loading commitment week">
      <div className="week-heading">
        <span className="week-skeleton-line" />
        <span className="week-skeleton-line short" />
      </div>
      <div className="day-buttons" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className="week-day-skeleton" />
        ))}
      </div>
    </div>
  );
}

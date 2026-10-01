import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, CircleX, Coffee } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useHabits } from '../hooks/useHabits';
import { parseLocalDate, shiftDate, todayISO } from '../utils/date';
import { SkeletonRows } from '../components/Skeleton';
import type { Habit } from '../types';

const HISTORY_DAYS = 30;
type DayStatus = 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'EMPTY';

function statusOf(habit: Habit, date: string): DayStatus {
  if (habit.completedDates.includes(date)) return 'COMPLETED';
  if (habit.failedDates.includes(date)) return 'FAILED';
  if (habit.skippedDates.includes(date)) return 'SKIPPED';
  return 'EMPTY';
}

const CYCLE: Record<DayStatus, DayStatus> = {
  EMPTY: 'COMPLETED',
  COMPLETED: 'FAILED',
  FAILED: 'SKIPPED',
  SKIPPED: 'EMPTY',
};

const STATUS_LABEL: Record<DayStatus, string> = {
  EMPTY: 'nothing recorded',
  COMPLETED: 'checked in',
  FAILED: 'failed',
  SKIPPED: 'left',
};

function statusIcon(status: DayStatus) {
  if (status === 'COMPLETED') return <CheckCircle2 size={13} />;
  if (status === 'FAILED') return <CircleX size={13} />;
  if (status === 'SKIPPED') return <Coffee size={13} />;
  return <Circle size={13} />;
}

function BackFillCell({
  date,
  status,
  onCycle,
  pending,
}: {
  date: string;
  status: DayStatus;
  onCycle: (date: string) => void;
  pending?: boolean;
}) {
  const label = parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <button
      type="button"
      className={`backfill-cell ${status.toLowerCase()}`}
      onClick={() => onCycle(date)}
      disabled={pending}
      aria-busy={pending || undefined}
      title={`${label} · ${STATUS_LABEL[status]} — tap to change`}
      aria-label={`${label}: ${STATUS_LABEL[status]}. Tap to change.`}
    >
      <span className="backfill-day">{parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
      <span className="backfill-date">{parseLocalDate(date).getDate()}</span>
      {statusIcon(status)}
    </button>
  );
}

export default function CommitmentsPage() {
  const { user } = useAuth();
  const { habits, loading, isPending, complete, failToday, skipToday, clearToday } = useHabits(user?.id ?? null);

  const today = todayISO();
  const windowDays = useMemo(() => [shiftDate(today, -2), shiftDate(today, -1), today], [today]);
  const historyDays = useMemo(
    () => Array.from({ length: HISTORY_DAYS }, (_, index) => shiftDate(today, -(HISTORY_DAYS - 1 - index))),
    [today]
  );

  const cycle = async (habit: Habit, date: string) => {
    const next = CYCLE[statusOf(habit, date)];
    try {
      if (next === 'EMPTY') await clearToday(habit.id, date);
      else if (next === 'COMPLETED') await complete(habit.id, date);
      else if (next === 'FAILED') await failToday(habit.id, date);
      else await skipToday(habit.id, date);
    } catch {
      /* the hook rolls the optimistic state back on failure */
    }
  };

  if (loading) {
    return (
      <div className="commitments-page" role="status" aria-label="Loading commitments">
        <div className="page-header">
          <div style={{ width: '100%' }}>
            <span className="skeleton" style={{ display: 'block', width: '110px', height: '12px' }} />
            <span className="skeleton" style={{ display: 'block', width: '280px', height: '26px', marginTop: '6px' }} />
          </div>
        </div>
        <SkeletonRows rows={3} height="120px" />
      </div>
    );
  }

  return (
    <div className="commitments-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commitments</p>
          <h1>History &amp; back-fill</h1>
          <p className="header-date">
            {habits.length} active {habits.length === 1 ? 'commitment' : 'commitments'} · you can fix today, yesterday and the day before
          </p>
        </div>
        <Link to="/" className="panel-link">
          <ArrowLeft size={16} />
          <span>Back to dashboard</span>
        </Link>
      </header>

      <div className="backfill-banner">
        <strong>Back-fill window:</strong> the last 3 days stay editable. Tap a cell to cycle{' '}
        <em>check in → failed → left → clear</em>.
      </div>

      {habits.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <Circle size={36} strokeWidth={2} />
            <strong>No commitments yet</strong>
            <p>Add a daily commitment from the dashboard to start building streaks</p>
            <Link to="/" className="panel-link">Go to dashboard</Link>
          </div>
        </section>
      ) : (
        <div className="commitment-history-list">
          {habits.map((habit) => {
            const failedCount = habit.failedDates.length;
            const skippedCount = habit.skippedDates.length;
            return (
              <section key={habit.id} className="panel commitment-history" aria-label={`${habit.name} history`}>
                <div className="panel-header">
                  <div>
                    <h2>{habit.name}</h2>
                    <p className="panel-subtitle">
                      {habit.completedDays} checked in · {failedCount} failed · {skippedCount} left · {habit.weekCompletedDays}/7 this week
                    </p>
                  </div>
                </div>

                <div className="backfill-row" role="group" aria-label="Back-fill window">
                  {windowDays.map((date) => (
                    <BackFillCell
                      key={date}
                      date={date}
                      status={statusOf(habit, date)}
                      pending={isPending(habit.id)}
                      onCycle={(day) => void cycle(habit, day)}
                    />
                  ))}
                </div>

                <div className="history-grid" role="list" aria-label={`Last ${HISTORY_DAYS} days`}>
                  {historyDays.map((date) => {
                    const status = statusOf(habit, date);
                    const label = parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <span
                        key={date}
                        role="listitem"
                        className={`history-cell ${status.toLowerCase()} ${date === today ? 'is-today' : ''}`}
                        title={`${label} · ${STATUS_LABEL[status]}`}
                        aria-label={`${label}: ${STATUS_LABEL[status]}`}
                      >
                        {status !== 'EMPTY' && statusIcon(status)}
                      </span>
                    );
                  })}
                </div>

                <div className="history-legend">
                  <span className="legend-item completed"><CheckCircle2 size={12} /> checked in</span>
                  <span className="legend-item failed"><CircleX size={12} /> failed</span>
                  <span className="legend-item skipped"><Coffee size={12} /> left</span>
                  <span className="legend-item empty"><Circle size={12} /> nothing</span>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, CircleX, Coffee, Lock, ChevronUp } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useHabits } from '../hooks/useHabits';
import { useToast } from '../components/Toast';
import { useDayActions } from '../hooks/useDayActions';
import { DayContextMenu, type DayMenuTarget } from '../components/DayContextMenu';
import { SkeletonRows } from '../components/Skeleton';
import {
  STATUS_LABEL,
  LOCKED_TOOLTIP,
  bestStreak,
  buildMonthGrid,
  currentStreak,
  dayStatus,
  formatShortFullDate,
  habitStartKey,
  isEditableDay,
  monthsThrough,
  monthLabel,
  monthSummary,
  weekdayHeaders,
  type DayStatus,
} from '../utils/commitmentCalendar';
import { parseLocalDate, shiftDate, todayISO } from '../utils/date';
import type { Habit } from '../types';

const MONTHS_PER_STEP = 6;

function statusIcon(status: DayStatus, size = 13) {
  if (status === 'COMPLETED') return <CheckCircle2 size={size} />;
  if (status === 'FAILED') return <CircleX size={size} />;
  if (status === 'SKIPPED') return <Coffee size={size} />;
  return null;
}

/** The always-editable 3-day strip: day name + date + status, tap for actions. */
function WindowCell({
  habit,
  date,
  today,
  timeZone,
  pending,
  onOpen,
}: {
  habit: Habit;
  date: string;
  today: string;
  timeZone: string;
  pending: boolean;
  onOpen: (target: { habitId: string; date: string; status: DayStatus; x: number; y: number }) => void;
}) {
  const status = dayStatus(habit, date, today, timeZone);
  const editable = status !== 'NOT_STARTED' && isEditableDay(date, today);
  const parsed = parseLocalDate(date);
  return (
    <button
      type="button"
      className={`backfill-cell status-${status.toLowerCase()} ${date === today ? 'is-today' : ''}`}
      disabled={!editable || pending}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (!editable) return;
        onOpen({ habitId: habit.id, date, status, x: event.clientX, y: event.clientY });
      }}
      title={`${formatShortFullDate(date)} · ${STATUS_LABEL[status]}`}
      aria-label={`${formatShortFullDate(date)}: ${STATUS_LABEL[status]}. Tap to change.`}
    >
      <span className="backfill-day">{parsed.toLocaleDateString(undefined, { weekday: 'short' })}</span>
      <span className="backfill-date">{parsed.getDate()}</span>
      {statusIcon(status) ?? <Circle size={13} />}
    </button>
  );
}

function MonthSection({
  habit,
  year,
  month,
  today,
  timeZone,
  pending,
  onOpen,
}: {
  habit: Habit;
  year: number;
  month: number;
  today: string;
  timeZone: string;
  pending: boolean;
  onOpen: (target: { habitId: string; date: string; status: DayStatus; x: number; y: number }) => void;
}) {
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const summary = useMemo(
    () => monthSummary(habit, year, month, today, timeZone),
    [habit, year, month, today, timeZone]
  );
  const weekdays = useMemo(() => weekdayHeaders(), []);

  return (
    <div className="month-section">
      <div className="month-header">
        <h3>{monthLabel(year, month)}</h3>
        <span className="month-summary">
          {summary.checked} checked · {summary.failed} failed · {summary.leave} left · {summary.completionPct}%
        </span>
      </div>
      <div className="month-weekdays" aria-hidden="true">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid" role="grid" aria-label={`${monthLabel(year, month)} calendar`}>
        {grid.map((cell) => {
          if (!cell.inMonth) {
            return <span key={cell.date} className="month-cell is-outside" aria-hidden="true" />;
          }
          const status = dayStatus(habit, cell.date, today, timeZone);
          const editable = status !== 'NOT_STARTED' && isEditableDay(cell.date, today);
          const title = !editable && cell.date <= today && status !== 'NOT_STARTED' && status !== 'FUTURE'
            ? `${formatShortFullDate(cell.date)} · ${STATUS_LABEL[status]} — ${LOCKED_TOOLTIP}`
            : `${formatShortFullDate(cell.date)} · ${STATUS_LABEL[status]}`;
          return (
            <button
              key={cell.date}
              type="button"
              className={[
                'month-cell',
                `status-${status.toLowerCase()}`,
                cell.date === today ? 'is-today' : '',
                editable ? 'is-editable' : status === 'NOT_STARTED' || status === 'FUTURE' ? 'is-inactive' : 'is-locked',
              ].join(' ')}
              disabled={!editable || pending}
              aria-busy={pending || undefined}
              title={title}
              aria-label={`${formatShortFullDate(cell.date)}: ${STATUS_LABEL[status]}${editable ? '. Tap to change.' : ''}`}
              onClick={(event) => {
                if (!editable) return;
                onOpen({ habitId: habit.id, date: cell.date, status, x: event.clientX, y: event.clientY });
              }}
            >
              <span className="month-day-number">{cell.day}</span>
              <span className="month-cell-icon">
                {statusIcon(status, 14) ?? (!editable && status !== 'NOT_STARTED' && status !== 'FUTURE' ? <Lock size={12} /> : null)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CommitmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { habits, loading, error, fetchHabits, isPending, complete, failToday, skipToday, clearToday } =
    useHabits(user?.id ?? null, user?.timezone);
  const runDayAction = useDayActions(
    { complete, failToday, skipToday, clearToday },
    toast
  );
  const [dayMenu, setDayMenu] = useState<DayMenuTarget | null>(null);
  const [visibleMonths, setVisibleMonths] = useState<Record<string, number>>({});

  const today = todayISO(user?.timezone);
  const timeZone = user?.timezone ?? 'UTC';
  const windowDays = useMemo(() => [shiftDate(today, -2), shiftDate(today, -1), today], [today]);

  const openMenu = (target: { habitId: string; date: string; status: DayStatus; x: number; y: number }) =>
    setDayMenu({ ...target, label: formatShortFullDate(target.date) });

  const showCountFor = (habit: Habit) => visibleMonths[habit.id] ?? 1;

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
        <strong>Back-fill window:</strong> the last 3 days stay editable — tap a cell to open its actions
        (undo, check in, failed, leave). Older days are locked.
      </div>

      <div className="history-legend" aria-label="Legend">
        <span className="legend-item completed"><CheckCircle2 size={12} /> checked in</span>
        <span className="legend-item failed"><CircleX size={12} /> failed</span>
        <span className="legend-item skipped"><Coffee size={12} /> left</span>
        <span className="legend-item empty"><Circle size={12} /> nothing</span>
        <span className="legend-item locked"><Lock size={12} /> locked</span>
      </div>

      {error && (
        <div className="commitment-load-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void fetchHabits()}>Retry</button>
        </div>
      )}

      {habits.length === 0 && !error ? (
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
            const startKey = habitStartKey(habit, timeZone);
            const allMonths = startKey ? monthsThrough(startKey, today) : [];
            const visible = showCountFor(habit);
            const hiddenMonths = allMonths.length - visible;
            const months = allMonths.slice(0, visible);
            return (
              <section key={habit.id} className="panel commitment-history" aria-label={`${habit.name} history`}>
                <div className="panel-header">
                  <div>
                    <h2>{habit.name}</h2>
                    <p className="panel-subtitle">
                      {habit.completedDays} checked in · {failedCount} failed · {skippedCount} left ·
                      current streak {currentStreak(habit.completedDates, today)} · best {bestStreak(habit.completedDates)} ·
                      {' '}{habit.weekCompletedDays}/7 this week
                    </p>
                  </div>
                </div>

                <div className="backfill-row" role="group" aria-label="Editable window">
                  {windowDays.map((date) => (
                    <WindowCell
                      key={date}
                      habit={habit}
                      date={date}
                      today={today}
                      timeZone={timeZone}
                      pending={isPending(habit.id)}
                      onOpen={openMenu}
                    />
                  ))}
                </div>

                {allMonths.length === 0 ? (
                  <p className="month-empty">Nothing recorded yet.</p>
                ) : (
                  <>
                    {months.map(({ year, month }) => (
                      <MonthSection
                        key={`${year}-${month}`}
                        habit={habit}
                        year={year}
                        month={month}
                        today={today}
                        timeZone={timeZone}
                        pending={isPending(habit.id)}
                        onOpen={openMenu}
                      />
                    ))}
                    {hiddenMonths > 0 && (
                      <button
                        type="button"
                        className="show-earlier-months"
                        onClick={() =>
                          setVisibleMonths((prev) => ({
                            ...prev,
                            [habit.id]: Math.min(allMonths.length, visible + MONTHS_PER_STEP),
                          }))
                        }
                      >
                        <ChevronUp size={15} />
                        Show earlier months ({hiddenMonths} more)
                      </button>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      <DayContextMenu
        target={dayMenu}
        pending={dayMenu ? isPending(dayMenu.habitId) : false}
        onClose={() => setDayMenu(null)}
        onAction={runDayAction}
      />
    </div>
  );
}

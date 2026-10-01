import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Target, CheckCircle2, Circle, CircleX, Coffee, Clock, ArrowRight, X, CalendarClock, Trash2, RotateCcw, AlarmClockOff, Flame } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTasks } from '../hooks/useTasks';
import { useHabits } from '../hooks/useHabits';
import { useGoals } from '../hooks/useGoals';
import { useAnalytics } from '../hooks/useAnalytics';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Progress } from '../components/Progress';
import { useToast } from '../components/Toast';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { ConfirmDialog, Modal } from '../components/Modal';
import { TaskRow } from '../components/TaskRow';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { formatDate, formatShortDate, greeting, parseLocalDate, shiftDate, todayISO } from '../utils/date';
import { ROUTES } from '../routes';
import { levelFor, pointsIntoLevel, pointsToNextLevel } from '../utils/points';
import { formatDeadline } from '../utils/deadline';
import { getDisplayName } from '../utils/profile';
import type { Task, Habit } from '../types';

const DASHBOARD_TASK_LIMIT = 6;

function WeekChecklist({ habit, onCheck, pending }: { habit: Habit; onCheck: (id: string, date?: string) => void; pending?: boolean }) {
  const today = todayISO();
  const backFillUntil = shiftDate(today, -2);
  return (
    <div className="week-panel">
      <div className="week-heading">
        <strong>{habit.weekCompletedDays}/7 this week</strong>
        <span>Mon–Sun</span>
      </div>
      <div className="day-buttons">
        {habit.weekDates.map((date) => {
          const checked = habit.completedDates.includes(date);
          const failed = habit.failedDates.includes(date);
          const skipped = habit.skippedDates.includes(date);
          const future = date > today;
          const beforeWindow = date < backFillUntil;
          const editable = !future && !beforeWindow;
          const label = parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' });
          const number = parseLocalDate(date).getDate();
          const statusText = checked ? ', checked in' : failed ? ', failed' : skipped ? ', left' : future ? ', not started' : beforeWindow ? ', outside back-fill window' : ', nothing recorded';
          return (
            <button
              key={date}
              disabled={!editable || pending}
              aria-busy={pending || undefined}
              className={`day-check ${checked ? 'checked' : ''} ${failed ? 'failed' : ''} ${skipped ? 'skipped' : ''} ${date === today ? 'today' : ''} ${future ? 'future' : ''} ${beforeWindow ? 'outside-window' : ''} ${editable && !checked && !failed && !skipped ? 'backfill' : ''}`}
              onClick={() => editable && !checked && onCheck(habit.id, date)}
              aria-label={`${label} ${number}${statusText}${editable && !checked ? ', tap to check in' : ''}`}
              title={future ? 'This day has not started yet' : beforeWindow ? 'Too old to edit' : failed ? 'Failed that day' : skipped ? 'Left this day' : checked ? 'Checked in' : editable ? 'Check in for this day' : date}
            >
              {checked ? <CheckCircle2 size={18} /> : failed ? <CircleX size={18} /> : skipped ? <Coffee size={18} /> : <Circle size={18} />}
              <small>{label}</small>
              <b>{number}</b>
            </button>
          );
        })}
      </div>
      <p className="week-backfill-note">Yesterday and the day before stay editable — tap an empty day to back-fill.</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    tasks,
    trash,
    loading: tasksLoading,
    creating: creatingTask,
    isPending: isTaskPending,
    create: createTask,
    checkIn,
    complete: completeTask,
    remove: removeTask,
    fetchTrash,
    restore: restoreTask,
    purge: purgeTask,
    markNotCompleted,
    extend: extendTask,
  } = useTasks(user?.id ?? null);
  const {
    habits,
    loading: habitsLoading,
    creating: creatingHabit,
    isPending: isHabitPending,
    create: createHabit,
    complete: completeHabit,
    clearToday,
    failToday,
    skipToday,
    remove: removeHabit,
  } = useHabits(user?.id ?? null);
  const { goals } = useGoals(user?.id ?? null);
  const { xp, streak } = useAnalytics(user?.id ?? null);

  const [taskForm, setTaskForm] = useState({ title: '' });
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [overdueTask, setOverdueTask] = useState<Task | null>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  const [habitForm, setHabitForm] = useState({ name: '' });
  const taskMenu = useContextMenu();
  const habitMenu = useContextMenu();
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'task' | 'habit'; id: string; label: string } | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Task | null>(null);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'ARCHIVED' && !t.deletedAt),
    [tasks]
  );
  const completedToday = useMemo(() => tasks.filter((t) => t.checkedToday).length, [tasks]);
  const completedHabits = useMemo(() => habits.filter((h) => h.completedToday).length, [habits]);
  const overdueTasks = useMemo(
    () => tasks.filter((t) => t.isOverdue && t.status !== 'COMPLETED').length,
    [tasks]
  );
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'ACTIVE').length, [goals]);
  const visibleTasks = useMemo(() => activeTasks.slice(0, DASHBOARD_TASK_LIMIT), [activeTasks]);
  const hiddenTaskCount = activeTasks.length - visibleTasks.length;

  const onToggleTask = useCallback((task: Task) => { void checkIn(task.id, !task.checkedToday); }, [checkIn]);
  const onDoneTask = useCallback((task: Task) => { void completeTask(task.id); }, [completeTask]);
  const totalXP = xp?.total ?? 0;
  const level = levelFor(totalXP);
  const xpInLevel = pointsIntoLevel(totalXP);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = taskForm.title.trim();
    if (!title) return;
    try {
      const created = await createTask({
        title,
        scheduledDate: todayISO(),
        priority: 'MEDIUM',
        dueAt: dueAt ?? undefined,
      });
      setTaskForm({ title: '' });
      setDueAt(null);
      toast({
        type: 'success',
        title: 'Task added',
        message: created.dueAt ? `${title} · due ${formatDeadline(created.dueAt)}` : title,
      });
    } catch (error) {
      toast({ type: 'error', title: 'Could not add task', message: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const handleExtend = async (iso: string) => {
    if (!overdueTask) return;
    try {
      await extendTask(overdueTask.id, iso);
      toast({ type: 'success', title: 'Deadline extended', message: `New deadline: ${formatDeadline(iso)}` });
      setExtendOpen(false);
      setOverdueTask(null);
    } catch (error) {
      toast({ type: 'error', title: 'Could not extend deadline', message: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const handleMarkNotCompleted = async () => {
    if (!overdueTask) return;
    try {
      await markNotCompleted(overdueTask.id);
      toast({ type: 'info', title: 'Marked as not completed', message: overdueTask.title });
      setOverdueTask(null);
    } catch (error) {
      toast({ type: 'error', title: 'Could not update task', message: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const openTrash = () => {
    setTrashOpen(true);
    void fetchTrash();
  };

  const handleRestore = async (task: Task) => {
    try {
      await restoreTask(task.id);
      toast({ type: 'success', title: 'Task restored', message: task.title });
    } catch (error) {
      toast({ type: 'error', title: 'Could not restore task', message: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    try {
      await purgeTask(purgeTarget.id);
      toast({ type: 'success', title: 'Task deleted', message: purgeTarget.title });
    } catch (error) {
      toast({ type: 'error', title: 'Could not delete task', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setPurgeTarget(null);
    }
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = habitForm.name.trim();
    if (!name) return;
    try {
      await createHabit({ name, frequency: 'Daily' });
      setHabitForm({ name: '' });
      toast({ type: 'success', title: 'Commitment added', message: name });
    } catch (error) {
      toast({ type: 'error', title: 'Could not add commitment', message: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'task') await removeTask(deleteTarget.id);
      else await removeHabit(deleteTarget.id);
      toast({ type: 'success', title: 'Deleted', message: deleteTarget.label });
    } catch (error) {
      toast({ type: 'error', title: 'Could not delete', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setDeleteTarget(null);
    }
  };

  if (tasksLoading || habitsLoading) {
    return (
      <div className="dashboard-page" role="status" aria-label="Loading dashboard">
        <div className="page-header">
          <div style={{ width: '100%' }}>
            <Skeleton width="90px" height="12px" />
            <Skeleton width="260px" height="26px" />
          </div>
        </div>
        <div className="stats-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="skeleton-block" height="76px" />
          ))}
        </div>
        <SkeletonRows rows={5} height="58px" />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>{greeting(getDisplayName(user?.name || 'there'))}</h1>
          <p className="header-date">{formatDate()}</p>
        </div>
        <div className="header-stats">
          {streak && (
            <div
              className={`streak-badge${streak.todayActive ? ' is-active' : ''}`}
              title={`Best streak: ${streak.best} day${streak.best === 1 ? '' : 's'}`}
            >
              <Flame size={16} aria-hidden="true" />
              <span>
                <strong>{streak.current}</strong> day{streak.current === 1 ? '' : 's'}
              </span>
            </div>
          )}
          <div
            className="rank-circle"
            style={{ '--rank-progress': `${xpInLevel}%` } as React.CSSProperties}
            role="img"
            aria-label={`Level ${level}, ${totalXP} points, ${xpInLevel} of 100 to the next level`}
            title={`${totalXP} points · ${pointsToNextLevel(totalXP)} to level ${level + 1}`}
          >
            <span className="rank-level">{level}</span>
            <span className="rank-label">LVL</span>
          </div>
          <div className="xp-badge">
            <span className="xp-flame" aria-hidden="true">🔥</span>
            <span>{totalXP} pts · {xpInLevel}/100</span>
          </div>
        </div>
      </header>

      <section className="stats-grid" aria-label="Today's progress">
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">Tasks Today</span>
            <div className="stat-value-row">
              <strong>{completedToday} / {activeTasks.length}</strong>
            </div>
            <Progress value={completedToday} max={Math.max(activeTasks.length, 1)} size="md" showLabel />
            <p className="stat-desc">{completedToday} of {activeTasks.length} tasks done</p>
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">Commitments</span>
            <div className="stat-value-row">
              <strong>{completedHabits} / {habits.length}</strong>
            </div>
            <Progress value={completedHabits} max={Math.max(habits.length, 1)} size="md" showLabel />
            <p className="stat-desc">{completedHabits} of {habits.length} checked in</p>
          </div>
        </Card>
        <Card variant="outlined" className="stat-card-overdue" padding="md">
          <div className="stat-card">
            <span className="stat-label">Overdue</span>
            <div className="stat-value-row">
              <strong className="text-danger">{overdueTasks}</strong>
            </div>
            <Progress value={overdueTasks} max={Math.max(activeTasks.length, 1)} size="md" variant="danger" showLabel />
            <p className="stat-desc">{overdueTasks} tasks past due</p>
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">Active Goals</span>
            <div className="stat-value-row">
              <strong>{activeGoals}</strong>
            </div>
            <p className="stat-desc stat-link">{activeGoals} goals in progress</p>
          </div>
        </Card>
      </section>

      <div className="dashboard-grid">
        <section className="panel task-panel" aria-labelledby="tasks-heading">
          <div className="panel-header">
            <div>
              <h2 id="tasks-heading">Today's Tasks</h2>
              <p className="panel-subtitle">{activeTasks.length} active {activeTasks.length === 1 ? 'task' : 'tasks'}</p>
            </div>
            <div className="panel-header-actions">
              <Link to={ROUTES.tasks} className="panel-link">
                <span>View all</span>
                <ArrowRight size={16} />
              </Link>
              <button
                type="button"
                className="panel-icon-btn"
                onClick={openTrash}
                aria-label={`Trash Bin, ${trash.length} deleted ${trash.length === 1 ? 'task' : 'tasks'}`}
                title="Trash Bin"
              >
                <Trash2 size={18} />
                {trash.length > 0 && <span className="panel-icon-badge">{trash.length > 9 ? '9+' : trash.length}</span>}
              </button>
            </div>
          </div>

          <form className="task-form" onSubmit={handleAddTask}>
            <div className="task-form-row">
              <div className="task-input-wrap">
                <input
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="What needs your attention?"
                  aria-label="Task title"
                  required
                />
                <button
                  type="button"
                  className={`deadline-btn ${dueAt ? 'has-deadline' : ''}`}
                  onClick={() => setDeadlineOpen(true)}
                  aria-label={dueAt ? `Deadline ${formatDeadline(dueAt)}. Change deadline` : 'Choose a deadline'}
                  title={dueAt ? formatDeadline(dueAt) : 'Choose a deadline'}
                >
                  <CalendarClock size={18} />
                </button>
              </div>
              <Button type="submit" size="md" loading={creatingTask}><Plus size={18} /> Add Task</Button>
            </div>
            {dueAt && (
              <p className="deadline-summary">
                <Clock size={14} /> Due {formatDeadline(dueAt)}
                <button type="button" onClick={() => setDueAt(null)} aria-label="Clear deadline">
                  <X size={12} />
                </button>
              </p>
            )}
          </form>

          {activeTasks.length === 0 ? (
            <div className="empty-state">
              <Circle size={36} strokeWidth={2} />
              <strong>No tasks yet</strong>
              <p>Add your first task above to get started</p>
            </div>
          ) : (
            <ul className="task-list" role="list">
              {visibleTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  bind={taskMenu.bind}
                  pending={isTaskPending(task.id)}
                  onToggle={onToggleTask}
                  onDone={onDoneTask}
                  onOverdueMenu={setOverdueTask}
                />
              ))}
            </ul>
          )}
          {hiddenTaskCount > 0 && (
            <Link to={ROUTES.tasks} className="panel-link task-more-link">
              <span>{hiddenTaskCount} more {hiddenTaskCount === 1 ? 'task' : 'tasks'}</span>
              <ArrowRight size={16} />
            </Link>
          )}
        </section>

        <section className="panel commitments-panel" aria-labelledby="habits-heading">
          <div className="panel-header">
            <div>
              <h2 id="habits-heading">Daily Commitments</h2>
              <p className="panel-subtitle">Build streaks, one day at a time</p>
            </div>
            <div className="panel-header-actions">
              <Link to={ROUTES.commitmentsHistory} className="panel-link">
                <span>View all</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          <form className="commitment-form" onSubmit={handleAddHabit}>
            <input
              value={habitForm.name}
              onChange={(e) => setHabitForm({ name: e.target.value })}
              placeholder="Add a daily commitment"
              aria-label="Commitment name"
              required
            />
            <Button type="submit" size="md" loading={creatingHabit}><Plus size={18} /> Add</Button>
          </form>

          {habits.length === 0 ? (
            <div className="empty-state">
              <Target size={32} />
              <strong>No commitments yet</strong>
              <p>Add a daily habit to start building streaks</p>
            </div>
          ) : (
            <div className="commitment-list" role="list">
              {habits.map((habit) => (
                <article
                  key={habit.id}
                  className="commitment-card"
                  {...habitMenu.bind(habit.name)}
                >
                  <div className="commitment-main">
                    <div className="commitment-info">
                      <strong>{habit.name}</strong>
                      <span>{habit.completedDays} total days · {habit.weekCompletedDays}/7 this week</span>
                    </div>
                    <WeekChecklist habit={habit} onCheck={completeHabit} pending={isHabitPending(habit.id)} />
                  </div>
                  <div className="commitment-actions">
                    <Button
                      variant={habit.completedToday ? 'secondary' : 'primary'}
                      size="md"
                      className="check-in-btn"
                      onClick={() => !habit.completedToday && completeHabit(habit.id)}
                      disabled={habit.completedToday || isHabitPending(habit.id)}
                      loading={isHabitPending(habit.id)}
                    >
                      {habit.completedToday ? (
                        <>
                          <CheckCircle2 size={18} /> Checked In
                        </>
                      ) : (
                        <>
                          <Target size={18} /> Check In Today
                        </>
                      )}
                    </Button>
                    <button
                      type="button"
                      className={`day-action leave ${habit.skippedToday ? 'active' : ''}`}
                      onClick={() => !habit.skippedToday && skipToday(habit.id)}
                      disabled={habit.skippedToday || isHabitPending(habit.id)}
                      aria-label="Leave today"
                      title="Leave today"
                    >
                      <Coffee size={16} />
                    </button>
                    <button
                      type="button"
                      className={`day-action fail ${habit.failedToday ? 'active' : ''}`}
                      onClick={() => !habit.failedToday && failToday(habit.id)}
                      disabled={habit.failedToday || isHabitPending(habit.id)}
                      aria-label="Failed that day"
                      title="Failed that day"
                    >
                      <CircleX size={16} />
                    </button>
                    {(habit.completedToday || habit.failedToday || habit.skippedToday) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="undo-day"
                        onClick={() => clearToday(habit.id)}
                        loading={isHabitPending(habit.id)}
                      >
                        <X size={14} />
                        Undo
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ContextMenu
        state={taskMenu.menu}
        onClose={taskMenu.close}
        onDelete={() => {
          if (!taskMenu.menu) return;
          const task = activeTasks.find((t) => t.title === taskMenu.menu?.label);
          if (task) setDeleteTarget({ kind: 'task', id: task.id, label: task.title });
        }}
        deleteLabel="Delete task"
      />
      <ContextMenu
        state={habitMenu.menu}
        onClose={habitMenu.close}
        onDelete={() => {
          if (!habitMenu.menu) return;
          const habit = habits.find((h) => h.name === habitMenu.menu?.label);
          if (habit) setDeleteTarget({ kind: 'habit', id: habit.id, label: habit.name });
        }}
        deleteLabel="Delete commitment"
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${deleteTarget?.kind === 'habit' ? 'commitment' : 'task'}?`}
        message={
          deleteTarget?.kind === 'habit'
            ? `"${deleteTarget?.label}" will be permanently deleted.`
            : `"${deleteTarget?.label}" will be moved to the Trash Bin.`
        }
        confirmText={deleteTarget?.kind === 'habit' ? 'Delete' : 'Move to trash'}
        variant="danger"
      />

      <DeadlinePicker
        isOpen={deadlineOpen}
        onConfirm={(iso) => {
          setDueAt(iso);
          setDeadlineOpen(false);
        }}
        onClose={() => setDeadlineOpen(false)}
      />

      <Modal
        isOpen={!!overdueTask && !extendOpen}
        onClose={() => setOverdueTask(null)}
        title={overdueTask?.title ?? ''}
        description="This task is past its deadline. What would you like to do?"
        size="sm"
      >
        <div className="overdue-menu">
          <Button type="button" variant="primary" onClick={() => setExtendOpen(true)}>
            <Clock size={16} /> Give more time
          </Button>
          <Button type="button" variant="secondary" onClick={() => void handleMarkNotCompleted()}>
            <AlarmClockOff size={16} /> Mark as not completed
          </Button>
        </div>
      </Modal>

      <DeadlinePicker
        isOpen={extendOpen}
        title="Give more time"
        confirmLabel="Extend deadline"
        initial={overdueTask?.dueAt ?? null}
        onConfirm={(iso) => void handleExtend(iso)}
        onClose={() => setExtendOpen(false)}
      />

      <Modal
        isOpen={trashOpen}
        onClose={() => setTrashOpen(false)}
        title="Trash Bin"
        description={trash.length === 0 ? undefined : `${trash.length} deleted ${trash.length === 1 ? 'task' : 'tasks'}`}
        size="md"
      >
        {trash.length === 0 ? (
          <div className="empty-state">
            <Trash2 size={32} />
            <strong>Trash is empty</strong>
            <p>Deleted tasks land here for 30 days</p>
          </div>
        ) : (
          <ul className="trash-list" role="list">
            {trash.map((task) => (
              <li key={task.id} className="trash-row">
                <div className="trash-info">
                  <strong>{task.title}</strong>
                  <span>{task.scheduledDate ? formatShortDate(task.scheduledDate) : ''}</span>
                </div>
                <div className="trash-actions">
                  <Button variant="ghost" size="sm" onClick={() => void handleRestore(task)}>
                    <RotateCcw size={14} /> Restore
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setPurgeTarget(task)}>
                    <Trash2 size={14} /> Delete forever
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!purgeTarget}
        onClose={() => setPurgeTarget(null)}
        onConfirm={handlePurge}
        title="Delete forever?"
        message={`"${purgeTarget?.title}" will be permanently deleted. This cannot be undone.`}
        confirmText="Delete forever"
        variant="danger"
      />
    </div>
  );
}
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Target, Trophy, Brain, BookOpen, Bell, BarChart2, Briefcase, DollarSign, CheckCircle2, Circle, AlertTriangle, Clock, Flame, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTasks } from '../hooks/useTasks';
import { useHabits } from '../hooks/useHabits';
import { useGoals } from '../hooks/useGoals';
import { useSkills } from '../hooks/useSkills';
import { useFocus } from '../hooks/useFocus';
import { useJournal } from '../hooks/useJournal';
import { useReminders } from '../hooks/useReminders';
import { useAnalytics } from '../hooks/useAnalytics';
import { useBrand } from '../hooks/useBrand';
import { Button } from '../components/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Badge } from '../components/Badge';
import { Progress } from '../components/Progress';
import { Avatar } from '../components/Avatar';
import { useToast } from '../components/Toast';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { ConfirmDialog } from '../components/Modal';
import { formatDate, greeting } from '../utils/date';
import type { Task, Habit } from '../types';

function WeekChecklist({ habit, onCheck }: { habit: Habit; onCheck: (id: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="week-panel">
      <div className="week-heading">
        <strong>{habit.weekCompletedDays}/7 this week</strong>
        <span>Mon–Sun</span>
      </div>
      <div className="day-buttons">
        {habit.weekDates.map((date) => {
          const checked = habit.completedDates.includes(date);
          const future = date > today;
          const label = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' });
          const number = new Date(`${date}T00:00:00Z`).getUTCDate();
          return (
            <button
              key={date}
              disabled={future}
              className={`day-check ${checked ? 'checked' : ''} ${date === today ? 'today' : ''} ${future ? 'future' : ''}`}
              onClick={() => !future && !checked && onCheck(habit.id)}
              aria-label={`${label} ${number}${future ? ', not started' : ''}`}
              title={future ? 'This day has not started yet' : date}
            >
              {checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              <small>{label}</small>
              <b>{number}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { tasks, loading: tasksLoading, create: createTask, checkIn, complete: completeTask, remove: removeTask } = useTasks(user?.id ?? null);
  const { habits, loading: habitsLoading, create: createHabit, complete: completeHabit, clearToday, remove: removeHabit } = useHabits(user?.id ?? null);
  const { goals } = useGoals(user?.id ?? null);
  const { skills } = useSkills(user?.id ?? null);
  const { sessions: focusSessions } = useFocus(user?.id ?? null);
  const { entries: journalEntries } = useJournal(user?.id ?? null);
  const { reminders } = useReminders(user?.id ?? null);
  const { xp } = useAnalytics(user?.id ?? null);
  const { projects: brandProjects } = useBrand(user?.id ?? null);

  const [taskForm, setTaskForm] = useState({ title: '', date: new Date().toISOString().slice(0, 10) });
  const [habitForm, setHabitForm] = useState({ name: '' });
  const taskMenu = useContextMenu();
  const habitMenu = useContextMenu();
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'task' | 'habit'; id: string; label: string } | null>(null);

  const activeTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'ARCHIVED' && !t.deletedAt);
  const completedToday = tasks.filter((t) => t.checkedToday).length;
  const completedHabits = habits.filter((h) => h.completedToday).length;
  const overdueTasks = tasks.filter((t) => t.isOverdue && t.status !== 'COMPLETED').length;
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE').length;
  const totalXP = xp?.total ?? 0;
  const level = Math.floor(totalXP / 100) + 1;
  const xpInLevel = totalXP % 100;

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = taskForm.title.trim();
    if (!title) return;
    try {
      await createTask({ title, scheduledDate: taskForm.date || undefined, priority: 'MEDIUM' });
      setTaskForm({ title: '', date: new Date().toISOString().slice(0, 10) });
      toast({ type: 'success', title: 'Task added', message: title });
    } catch (error) {
      toast({ type: 'error', title: 'Could not add task', message: error instanceof Error ? error.message : 'Please try again.' });
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
    return <div className="page-loading" role="status">Loading dashboard…</div>;
  }

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>{greeting(user?.name || 'there')}</h1>
          <p className="header-date">{formatDate()}</p>
        </div>
        <div className="header-stats">
          <div className="xp-badge">
            <Flame size={18} />
            <span>Level {level} · {xpInLevel}/100 XP</span>
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
            <p className="stat-desc">{activeGoals} goals in progress</p>
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
            <Link to="/goals" className="panel-link">
              <ArrowRight size={16} />
              <span>View Goals</span>
            </Link>
          </div>

          <form className="task-form" onSubmit={handleAddTask}>
            <div className="task-form-row">
              <input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="What needs your attention?"
                aria-label="Task title"
                required
              />
              <Button type="submit" size="md"><Plus size={18} /> Add Task</Button>
            </div>
            <div className="task-form-options">
              <input type="date" value={taskForm.date} onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })} aria-label="Task date" className="date-input" />
            </div>
          </form>

          {activeTasks.length === 0 ? (
            <div className="empty-state">
              <Circle size={32} />
              <strong>No tasks yet</strong>
              <p>Add your first task above to get started</p>
            </div>
          ) : (
            <ul className="task-list" role="list">
              {activeTasks.map((task) => (
                <li
                  key={task.id}
                  className={`task-row ${task.isOverdue ? 'overdue' : ''} ${task.checkedToday ? 'completed' : ''}`}
                  onContextMenu={(e) => taskMenu.open(e, task.title)}
                >
                  <button
                    className="task-check"
                    onClick={() => checkIn(task.id, !task.checkedToday)}
                    aria-label={task.checkedToday ? 'Uncheck task' : 'Check in task'}
                    aria-pressed={task.checkedToday}
                  >
                    {task.checkedToday ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                  </button>
                  <div className="task-content">
                    <input
                      className="task-title"
                      value={task.title}
                      readOnly
                      aria-label="Task title"
                    />
                    <div className="task-meta">
                      {task.scheduledTime && (
                        <span className="task-time">
                          <Clock size={14} />
                          {task.scheduledTime}
                        </span>
                      )}
                      {task.isOverdue && (
                        <Badge variant="danger" className="overdue-badge">
                          <AlertTriangle size={10} />
                          Overdue
                        </Badge>
                      )}
                      {task.recurrence !== 'NONE' && (
                        <Badge variant="outline" className="recurrence-badge">
                          {task.recurrence.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="task-actions">
                    <Button variant="ghost" size="sm" onClick={() => completeTask(task.id)}>
                      <CheckCircle2 size={16} /> Done
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel commitments-panel" aria-labelledby="habits-heading">
          <div className="panel-header">
            <div>
              <h2 id="habits-heading">Daily Commitments</h2>
              <p className="panel-subtitle">Build streaks, one day at a time</p>
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
            <Button type="submit" size="md"><Plus size={18} /> Add</Button>
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
                  onContextMenu={(e) => habitMenu.open(e, habit.name)}
                >
                  <div className="commitment-main">
                    <div className="commitment-info">
                      <strong>{habit.name}</strong>
                      <span>{habit.completedDays} total days · {habit.weekCompletedDays}/7 this week</span>
                    </div>
                    <WeekChecklist habit={habit} onCheck={completeHabit} />
                  </div>
                  <div className="commitment-actions">
                    <Button
                      variant={habit.completedToday ? 'secondary' : 'primary'}
                      size="md"
                      className="check-in-btn"
                      onClick={() => !habit.completedToday && completeHabit(habit.id)}
                      disabled={habit.completedToday}
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
                    {habit.completedToday && (
                      <Button variant="ghost" size="sm" onClick={() => clearToday(habit.id)}>
                        Undo Today
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="quick-links" aria-label="Quick navigation">
        <h2 className="sr-only">Quick Links</h2>
        <div className="quick-link-grid">
          <Link to="/goals" className="quick-link-card">
            <Target size={24} />
            <strong>Goals</strong>
            <span>{goals.filter(g => g.status === 'ACTIVE').length} active</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/skills" className="quick-link-card">
            <Trophy size={24} />
            <strong>Skills</strong>
            <span>{skills.length} tracking</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/focus" className="quick-link-card">
            <Brain size={24} />
            <strong>Focus</strong>
            <span>{focusSessions.filter(s => s.status === 'COMPLETED').length} sessions</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/journal" className="quick-link-card">
            <BookOpen size={24} />
            <strong>Journal</strong>
            <span>{journalEntries.length} entries</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/reminders" className="quick-link-card">
            <Bell size={24} />
            <strong>Reminders</strong>
            <span>{reminders.filter(r => r.enabled).length} active</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/analytics" className="quick-link-card">
            <BarChart2 size={24} />
            <strong>Analytics</strong>
            <span>View progress</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/brand" className="quick-link-card">
            <Briefcase size={24} />
            <strong>Brand</strong>
            <span>{brandProjects.length} projects</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/finance" className="quick-link-card">
            <DollarSign size={24} />
            <strong>Finance</strong>
            <span>Track money</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

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
        message={`"${deleteTarget?.label}" will be permanently deleted.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
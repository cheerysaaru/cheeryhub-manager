import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, Circle, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTasks } from '../hooks/useTasks';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Modal, ConfirmDialog } from '../components/Modal';
import { TaskRow } from '../components/TaskRow';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { formatShortDate, todayISO } from '../utils/date';
import { formatDeadline } from '../utils/deadline';
import type { Task } from '../types';

type Tab = 'active' | 'trash';

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    tasks,
    trash,
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

  const [tab, setTab] = useState<Tab>('active');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [overdueTask, setOverdueTask] = useState<Task | null>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Task | null>(null);
  const taskMenu = useContextMenu();

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'ARCHIVED' && !t.deletedAt),
    [tasks]
  );
  const overdueCount = activeTasks.filter((t) => t.isOverdue && t.status !== 'COMPLETED').length;

  const handleAddTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const created = await createTask({
        title: trimmed,
        scheduledDate: todayISO(),
        priority: 'MEDIUM',
        dueAt: dueAt ?? undefined,
      });
      setTitle('');
      setDueAt(null);
      toast({
        type: 'success',
        title: 'Task added',
        message: created.dueAt ? `${trimmed} · due ${formatDeadline(created.dueAt)}` : trimmed,
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeTask(deleteTarget.id);
      toast({ type: 'success', title: 'Moved to trash', message: deleteTarget.title });
      void fetchTrash();
    } catch (error) {
      toast({ type: 'error', title: 'Could not delete task', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="tasks-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>Everything on your plate</h1>
          <p className="header-date">
            {activeTasks.length} active · {overdueCount} overdue · {trash.length} in trash
          </p>
        </div>
        <Link to="/" className="panel-link">
          <ArrowLeft size={16} />
          <span>Back to dashboard</span>
        </Link>
      </header>

      <div className="page-tabs" role="tablist" aria-label="Task views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={`page-tab ${tab === 'active' ? 'active' : ''}`}
          onClick={() => setTab('active')}
        >
          Active
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'trash'}
          className={`page-tab ${tab === 'trash' ? 'active' : ''}`}
          onClick={() => {
            setTab('trash');
            void fetchTrash();
          }}
        >
          <Trash2 size={14} /> Trash {trash.length > 0 && <span className="page-tab-count">{trash.length}</span>}
        </button>
      </div>

      {tab === 'active' && (
        <section className="panel task-panel" aria-label="Active tasks">
          <form className="task-form" onSubmit={handleAddTask}>
            <div className="task-form-row">
              <div className="task-input-wrap">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
              <Button type="submit" size="md"><Plus size={18} /> Add Task</Button>
            </div>
            {dueAt && (
              <p className="deadline-summary">
                Due {formatDeadline(dueAt)}
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
              {activeTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  bind={taskMenu.bind}
                  onToggle={(t) => void checkIn(t.id, !t.checkedToday)}
                  onDone={(t) => void completeTask(t.id)}
                  onOverdueMenu={setOverdueTask}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'trash' && (
        <section className="panel trash-panel" aria-label="Trashed tasks">
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
        </section>
      )}

      <ContextMenu
        state={taskMenu.menu}
        onClose={taskMenu.close}
        onDelete={() => {
          if (!taskMenu.menu) return;
          const task = activeTasks.find((t) => t.title === taskMenu.menu?.label);
          if (task) setDeleteTarget(task);
        }}
        deleteLabel="Move to trash"
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
            <CalendarClock size={16} /> Give more time
          </Button>
          <Button type="button" variant="secondary" onClick={() => void handleMarkNotCompleted()}>
            <X size={16} /> Mark as not completed
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

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete task?"
        message={`"${deleteTarget?.title}" will be moved to the Trash Bin.`}
        confirmText="Move to trash"
        variant="danger"
      />

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

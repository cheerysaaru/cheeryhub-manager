import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Target, CheckCircle2, Circle, Trash2, ChevronDown, ChevronRight, Pencil, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useGoals } from '../hooks/useGoals';
import { useTasks } from '../hooks/useTasks';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Progress } from '../components/Progress';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import type { Goal, GoalMilestone } from '../types';
import { daysUntil } from '../utils/date';

const BASE_PATH = '/personal-productivity-manager';

export default function GoalsPage() {
  const { user } = useAuth();
  const { goals, loading, create, update, remove, createMilestone, updateMilestone, deleteMilestone } = useGoals(user?.id ?? null);
  const { tasks } = useTasks(user?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [milestoneForm, setMilestoneForm] = useState<{ goalId: string; title: string } | null>(null);
  const [form, setForm] = useState({ title: '', description: '', deadline: '', status: 'ACTIVE' as Goal['status'], progress: 0 });

  function openForm(goal?: Goal) {
    if (goal) {
      setEditingGoal(goal);
      setForm({
        title: goal.title,
        description: goal.description ?? '',
        deadline: goal.deadline ? goal.deadline.slice(0, 10) : '',
        status: goal.status,
        progress: goal.progress,
      });
    } else {
      setEditingGoal(null);
      setForm({ title: '', description: '', deadline: '', status: 'ACTIVE', progress: 0 });
    }
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      title: form.title,
      description: form.description || undefined,
      deadline: form.deadline || undefined,
      status: form.status,
      progress: form.progress,
    };
    if (editingGoal) {
      await update(editingGoal.id, data);
    } else {
      await create(data);
    }
    setShowForm(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  async function addMilestone(goalId: string, title: string) {
    if (!title.trim()) return;
    await createMilestone(goalId, { title });
    setMilestoneForm(null);
  }

  async function toggleMilestone(goal: Goal, milestone: GoalMilestone) {
    await updateMilestone(goal.id, milestone.id, { completed: !milestone.completed });
    const completedCount = goal.milestones.filter((m) => (m.id === milestone.id ? !milestone.completed : m.completed)).length;
    const newProgress = goal.milestones.length > 0 ? Math.round((completedCount / goal.milestones.length) * 100) : 0;
    await update(goal.id, { progress: newProgress });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const statusVariant = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'COMPLETED' ? 'info' : s === 'PAUSED' ? 'warning' : 'outline');

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Goals</p>
          <h1>What are you working toward?</h1>
        </div>
        <Button size="lg" onClick={() => openForm()}>
          <Plus size={20} /> New Goal
        </Button>
      </header>

      {loading ? (
        <div className="page-loading">Loading goals…</div>
      ) : goals.length === 0 ? (
        <div className="empty-state">
          <Target size={40} />
          <strong>No goals yet</strong>
          <p>Create your first goal to start tracking progress.</p>
          <Button onClick={() => openForm()}><Plus size={18} /> New Goal</Button>
        </div>
      ) : (
        <div className="goals-list">
          {goals.map((goal) => {
            const linkedTasks = tasks.filter((t) => t.goalId === goal.id && !t.deletedAt);
            const isExpanded = expanded.has(goal.id);
            const deadlineDays = goal.deadline ? daysUntil(goal.deadline) : null;

            return (
              <Card key={goal.id} className="goal-card" padding="md">
                <div className="goal-header" onClick={() => toggleExpand(goal.id)}>
                  <button className="expand-toggle" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>
                  <div className="goal-info">
                    <strong>{goal.title}</strong>
                    <div className="goal-badges">
                      <Badge variant={statusVariant(goal.status)}>{goal.status.toLowerCase()}</Badge>
                      {deadlineDays !== null && (
                        <Badge variant={deadlineDays < 0 ? 'danger' : deadlineDays <= 7 ? 'warning' : 'outline'}>
                          {deadlineDays < 0 ? `${Math.abs(deadlineDays)} days overdue` : `${deadlineDays} days left`}
                        </Badge>
                      )}
                      <span className="goal-progress-text">{goal.progress}%</span>
                    </div>
                    {goal.description && <p className="goal-desc">{goal.description}</p>}
                  </div>
                  <div className="goal-actions" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openForm(goal)} aria-label="Edit goal">
                      <Pencil size={16} />
                    </Button>
                    <Button variant="ghost" size="sm" className="danger-ghost" onClick={() => setDeleteTarget(goal)} aria-label="Delete goal">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>

                <Progress value={goal.progress} size="md" showLabel label="Progress" variant={goal.progress >= 80 ? 'success' : 'default'} />

                {isExpanded && (
                  <div className="goal-details">
                    <div className="milestones-section">
                      <div className="milestones-header">
                        <h3>Milestones</h3>
                        <Button variant="ghost" size="sm" onClick={() => setMilestoneForm({ goalId: goal.id, title: '' })}>
                          <Plus size={16} /> Add Milestone
                        </Button>
                      </div>
                      {milestoneForm?.goalId === goal.id ? (
                        <div className="milestone-form">
                          <input
                            autoFocus
                            value={milestoneForm.title}
                            onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })}
                            placeholder="Milestone title"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addMilestone(goal.id, milestoneForm.title);
                              if (e.key === 'Escape') setMilestoneForm(null);
                            }}
                          />
                          <Button size="sm" onClick={() => addMilestone(goal.id, milestoneForm.title)}>Add</Button>
                          <Button variant="ghost" size="sm" onClick={() => setMilestoneForm(null)}><X size={16} /></Button>
                        </div>
                      ) : null}
                      <ul className="milestone-list">
                        {goal.milestones.length === 0 && <li className="empty-milestone">No milestones yet.</li>}
                        {goal.milestones.map((ms) => (
                          <li key={ms.id} className={`milestone-item ${ms.completed ? 'completed' : ''}`}>
                            <button className="milestone-check" onClick={() => toggleMilestone(goal, ms)} aria-label={ms.completed ? 'Uncomplete milestone' : 'Complete milestone'}>
                              {ms.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </button>
                            <span className="milestone-title">{ms.title}</span>
                            <button className="milestone-delete" onClick={() => deleteMilestone(goal.id, ms.id)} aria-label="Delete milestone">
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="linked-tasks-section">
                      <h3>Linked Tasks ({linkedTasks.length})</h3>
                      <ul className="linked-task-list">
                        {linkedTasks.length === 0 && <li className="empty-milestone">No linked tasks.</li>}
                        {linkedTasks.map((task) => (
                          <li key={task.id} className="linked-task-item">
                            {task.checkedToday ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                            <span>{task.title}</span>
                          </li>
                        ))}
                      </ul>
                      <Link to={`${BASE_PATH}/`} className="link-button-small">Go to tasks →</Link>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingGoal ? 'Edit Goal' : 'New Goal'}>
        <form onSubmit={handleSubmit} className="modal-form">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <Input label="Deadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          <div className="form-row">
            <label className="input-label">
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Goal['status'] })} className="select">
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="PAUSED">Paused</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="input-label">
              Progress: {form.progress}%
              <input type="range" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} className="range-input" />
            </label>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit">{editingGoal ? 'Save Changes' : 'Create Goal'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete goal?"
        message={`"${deleteTarget?.title}" and its milestones will be permanently deleted.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
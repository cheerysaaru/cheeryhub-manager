import { useState } from 'react';
import { Plus, Briefcase, Trash2, Pencil, ChevronDown, ChevronRight, CheckCircle2, Circle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useBrand } from '../hooks/useBrand';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Progress } from '../components/Progress';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import type { BrandProject, BrandMilestone } from '../types';

export default function BrandPage() {
  const { user } = useAuth();
  const { projects, loading, create, update, remove, createMilestone, updateMilestone, deleteMilestone } = useBrand(user?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BrandProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrandProject | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [milestoneForm, setMilestoneForm] = useState<{ projectId: string; title: string } | null>(null);
  const [form, setForm] = useState({ title: '', description: '', status: 'IDEA' as BrandProject['status'], progress: 0 });
  const projectMenu = useContextMenu();

  function openForm(project?: BrandProject) {
    if (project) {
      setEditing(project);
      setForm({ title: project.title, description: project.description ?? '', status: project.status, progress: project.progress });
    } else {
      setEditing(null);
      setForm({ title: '', description: '', status: 'IDEA', progress: 0 });
    }
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) await update(editing.id, form);
    else await create(form);
    setShowForm(false);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addMilestone(projectId: string, title: string) {
    if (!title.trim()) return;
    await createMilestone(projectId, { title });
    setMilestoneForm(null);
  }

  async function toggleMilestone(project: BrandProject, ms: BrandMilestone) {
    await updateMilestone(project.id, ms.id, { completed: !ms.completed });
    const completed = project.milestones.filter((m) => (m.id === ms.id ? !ms.completed : m.completed)).length;
    const progress = project.milestones.length ? Math.round((completed / project.milestones.length) * 100) : 0;
    await update(project.id, { progress });
  }

  const statusVariant = (s: string) =>
    s === 'ACTIVE' ? 'success' : s === 'COMPLETED' ? 'info' : s === 'PAUSED' ? 'warning' : 'outline';

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Brand Projects</p>
          <h1>Build your brand</h1>
        </div>
        <Button size="lg" onClick={() => openForm()}>
          <Plus size={20} /> New Project
        </Button>
      </header>

      {loading ? (
        <div className="page-loading">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <Briefcase size={40} />
          <strong>No brand projects yet</strong>
          <p>Track your side projects, launches, and brand initiatives.</p>
          <Button onClick={() => openForm()}><Plus size={18} /> New Project</Button>
        </div>
      ) : (
        <div className="goals-list">
          {projects.map((project) => {
            const isExpanded = expanded.has(project.id);
            return (
              <Card key={project.id} className="goal-card" padding="md" onContextMenu={(e) => projectMenu.open(e, project.title)}>
                <div className="goal-header" onClick={() => toggleExpand(project.id)}>
                  <button className="expand-toggle" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>
                  <div className="goal-info">
                    <strong>{project.title}</strong>
                    <div className="goal-badges">
                      <Badge variant={statusVariant(project.status)}>{project.status.toLowerCase()}</Badge>
                      <span className="goal-progress-text">{project.progress}%</span>
                    </div>
                    {project.description && <p className="goal-desc">{project.description}</p>}
                  </div>
                  <div className="goal-actions" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openForm(project)} aria-label="Edit"><Pencil size={16} /></Button>
                    <Button variant="ghost" size="sm" className="danger-ghost" onClick={() => setDeleteTarget(project)} aria-label="Delete"><Trash2 size={16} /></Button>
                  </div>
                </div>
                <Progress value={project.progress} size="md" showLabel label="Progress" />
                {isExpanded && (
                  <div className="goal-details">
                    <div className="milestones-section">
                      <div className="milestones-header">
                        <h3>Milestones</h3>
                        <Button variant="ghost" size="sm" onClick={() => setMilestoneForm({ projectId: project.id, title: '' })}>
                          <Plus size={16} /> Add
                        </Button>
                      </div>
                      {milestoneForm?.projectId === project.id && (
                        <div className="milestone-form">
                          <input
                            autoFocus
                            value={milestoneForm.title}
                            onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })}
                            placeholder="Milestone title"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addMilestone(project.id, milestoneForm.title);
                              if (e.key === 'Escape') setMilestoneForm(null);
                            }}
                          />
                          <Button size="sm" onClick={() => addMilestone(project.id, milestoneForm.title)}>Add</Button>
                          <Button variant="ghost" size="sm" onClick={() => setMilestoneForm(null)}>✕</Button>
                        </div>
                      )}
                      <ul className="milestone-list">
                        {project.milestones.length === 0 && <li className="empty-milestone">No milestones yet.</li>}
                        {project.milestones.map((ms) => (
                          <li key={ms.id} className={`milestone-item ${ms.completed ? 'completed' : ''}`}>
                            <button className="milestone-check" onClick={() => toggleMilestone(project, ms)} aria-label={ms.completed ? 'Uncomplete' : 'Complete'}>
                              {ms.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </button>
                            <span className="milestone-title">{ms.title}</span>
                            <button className="milestone-delete" onClick={() => deleteMilestone(project.id, ms.id)} aria-label="Delete milestone">
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Project' : 'New Project'}>
        <form onSubmit={handleSubmit} className="modal-form">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <div className="form-row">
            <label className="input-label">
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BrandProject['status'] })} className="select">
                <option value="IDEA">Idea</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </label>
            <label className="input-label">
              Progress: {form.progress}%
              <input type="range" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} className="range-input" />
            </label>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save' : 'Create Project'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) { await remove(deleteTarget.id); setDeleteTarget(null); } }}
        title="Delete project?"
        message={`"${deleteTarget?.title}" and its milestones will be permanently deleted.`}
        confirmText="Delete"
        variant="danger"
      />
      <ContextMenu
        state={projectMenu.menu}
        onClose={projectMenu.close}
        onEdit={() => {
          if (!projectMenu.menu) return;
          const project = projects.find((p) => p.title === projectMenu.menu?.label);
          if (project) openForm(project);
        }}
        onDelete={() => {
          if (!projectMenu.menu) return;
          const project = projects.find((p) => p.title === projectMenu.menu?.label);
          if (project) setDeleteTarget(project);
        }}
        editLabel="Edit project"
        deleteLabel="Delete project"
      />
    </div>
  );
}
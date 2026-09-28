import { useState } from 'react';
import { Plus, Trophy, Trash2, TrendingUp, Pencil, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSkills } from '../hooks/useSkills';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Progress } from '../components/Progress';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { Input } from '../components/Input';
import type { Skill } from '../types';

export default function SkillsPage() {
  const { user } = useAuth();
  const { skills, loading, create, update, remove } = useSkills(user?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [form, setForm] = useState({ name: '', currentLevel: 1, targetLevel: 5, progress: 0 });
  const skillMenu = useContextMenu();

  function openForm(skill?: Skill) {
    if (skill) {
      setEditing(skill);
      setForm({ name: skill.name, currentLevel: skill.currentLevel, targetLevel: skill.targetLevel, progress: skill.progress });
    } else {
      setEditing(null);
      setForm({ name: '', currentLevel: 1, targetLevel: 5, progress: 0 });
    }
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...form };
    if (editing) await update(editing.id, data);
    else await create(data);
    setShowForm(false);
  }

  async function adjustProgress(skill: Skill, delta: number) {
    const newProgress = Math.max(0, Math.min(100, skill.progress + delta));
    let newLevel = skill.currentLevel;
    if (newProgress >= 100 && skill.currentLevel < skill.targetLevel) {
      newLevel = skill.currentLevel + 1;
      await update(skill.id, { progress: 0, currentLevel: newLevel });
    } else {
      await update(skill.id, { progress: newProgress });
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Skills</p>
          <h1>Level up your abilities</h1>
        </div>
        <Button size="lg" onClick={() => openForm()}>
          <Plus size={20} /> New Skill
        </Button>
      </header>

      {loading ? (
        <div className="page-loading">Loading skills…</div>
      ) : skills.length === 0 ? (
        <div className="empty-state">
          <Trophy size={40} />
          <strong>No skills tracked yet</strong>
          <p>Add a skill and start leveling up.</p>
          <Button onClick={() => openForm()}><Plus size={18} /> New Skill</Button>
        </div>
      ) : (
        <div className="skills-grid">
          {skills.map((skill) => (
            <Card key={skill.id} className="skill-card" padding="md" {...skillMenu.bind(skill.name)}>
              <div className="skill-header">
                <div className="skill-info">
                  <strong>{skill.name}</strong>
                  <div className="skill-badges">
                    <Badge variant="info">Level {skill.currentLevel}</Badge>
                    <Badge variant="outline">Target {skill.targetLevel}</Badge>
                  </div>
                </div>
                <div className="goal-actions">
                  <Button variant="ghost" size="sm" onClick={() => openForm(skill)} aria-label="Edit skill"><Pencil size={16} /></Button>
                  <Button variant="ghost" size="sm" className="danger-ghost" onClick={() => setDeleteTarget(skill)} aria-label="Delete skill"><Trash2 size={16} /></Button>
                </div>
              </div>
              <Progress value={skill.progress} size="md" showLabel label="Level progress" />
              <div className="skill-adjust">
                <Button variant="secondary" size="sm" onClick={() => adjustProgress(skill, -10)}>
                  <TrendingUp size={14} style={{ transform: 'rotate(-90deg)' }} /> -10%
                </Button>
                <Button variant="primary" size="sm" onClick={() => adjustProgress(skill, 10)}>
                  <TrendingUp size={14} /> +10%
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Skill' : 'New Skill'}>
        <form onSubmit={handleSubmit} className="modal-form">
          <Input label="Skill name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="form-row">
            <label className="input-label">
              Current level
              <input type="number" min="1" max="100" value={form.currentLevel} onChange={(e) => setForm({ ...form, currentLevel: Number(e.target.value) })} className="input" />
            </label>
            <label className="input-label">
              Target level
              <input type="number" min="1" max="100" value={form.targetLevel} onChange={(e) => setForm({ ...form, targetLevel: Number(e.target.value) })} className="input" />
            </label>
          </div>
          <label className="input-label">
            Progress: {form.progress}%
            <input type="range" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} className="range-input" />
          </label>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save' : 'Create Skill'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) { await remove(deleteTarget.id); setDeleteTarget(null); } }}
        title="Delete skill?"
        message={`"${deleteTarget?.name}" will be permanently deleted.`}
        confirmText="Delete"
        variant="danger"
      />
      <ContextMenu
        state={skillMenu.menu}
        onClose={skillMenu.close}
        onEdit={() => {
          if (!skillMenu.menu) return;
          const skill = skills.find((s) => s.name === skillMenu.menu?.label);
          if (skill) openForm(skill);
        }}
        onDelete={() => {
          if (!skillMenu.menu) return;
          const skill = skills.find((s) => s.name === skillMenu.menu?.label);
          if (skill) setDeleteTarget(skill);
        }}
        editLabel="Edit skill"
        deleteLabel="Delete skill"
      />
    </div>
  );
}
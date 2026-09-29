import { useState } from 'react';
import { Plus, Award, Archive } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { readArchivedments, addArchivedment, type Archivedment } from '../utils/archivedments';
import { todayISO, parseLocalDate } from '../utils/date';

function formatAchievedDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ArchivedmentsPage() {
  const [items, setItems] = useState<Archivedment[]>(() => readArchivedments());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ emoji: '', title: '', description: '', date: todayISO() });

  function openForm() {
    setForm({ emoji: '', title: '', description: '', date: todayISO() });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    addArchivedment({
      emoji: form.emoji.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      date: form.date || todayISO(),
    });
    setItems(readArchivedments());
    setShowForm(false);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">OVERVIEW / Archivedments</p>
          <h1>Archivedments</h1>
        </div>
        <Button size="lg" onClick={openForm}>
          <Plus size={20} /> Add Achievement
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="empty-state">
          <Archive size={40} />
          <strong>No achievements yet</strong>
          <p>Add your first achievement, or complete a goal at 100%.</p>
          <Button onClick={openForm}><Plus size={18} /> Add Achievement</Button>
        </div>
      ) : (
        <div className="skills-grid">
          {items.map((item) => (
            <Card key={item.id} className="skill-card" padding="md">
              <div className="skill-header">
                <div className="skill-info">
                  <strong>
                    {item.emoji ? `${item.emoji} ` : ''}
                    {item.title}
                  </strong>
                  <span className="achievement-date">{formatAchievedDate(item.date)}</span>
                </div>
                <Award size={18} className="achievement-icon" aria-hidden="true" />
              </div>
              {item.description && <p className="achievement-desc">{item.description}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Add Achievement">
        <form onSubmit={handleSubmit} className="modal-form">
          <Input
            label="Emoji (optional)"
            value={form.emoji}
            onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 2) })}
            maxLength={2}
            placeholder="🏆"
          />
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <Input label="Date Achieved" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

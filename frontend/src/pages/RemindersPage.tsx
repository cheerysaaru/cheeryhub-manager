import { useState } from 'react';
import { Plus, Bell, Trash2, Pencil, X, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useReminders } from '../hooks/useReminders';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { Switch } from '../components/Switch';
import type { Reminder } from '../types';
import { todayISO, daysUntil } from '../utils/date';

export default function RemindersPage() {
  const { user } = useAuth();
  const { reminders, loading, create, update, remove } = useReminders(user?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    reminderDate: todayISO(),
    reminderTime: '09:00',
    repeatType: 'NONE' as Reminder['repeatType'],
    enabled: true,
  });

  function openForm(reminder?: Reminder) {
    if (reminder) {
      setEditing(reminder);
      setForm({
        title: reminder.title,
        description: reminder.description ?? '',
        reminderDate: reminder.reminderDate.slice(0, 10),
        reminderTime: reminder.reminderTime ?? '09:00',
        repeatType: reminder.repeatType,
        enabled: reminder.enabled,
      });
    } else {
      setEditing(null);
      setForm({ title: '', description: '', reminderDate: todayISO(), reminderTime: '09:00', repeatType: 'NONE', enabled: true });
    }
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      ...form,
      reminderDate: `${form.reminderDate}T00:00:00.000Z`,
    };
    if (editing) await update(editing.id, data);
    else await create(data);
    setShowForm(false);
  }

  async function toggleEnabled(reminder: Reminder) {
    await update(reminder.id, { enabled: !reminder.enabled });
  }

  const upcoming = reminders
    .filter((r) => daysUntil(r.reminderDate) >= 0)
    .sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime());
  const past = reminders
    .filter((r) => daysUntil(r.reminderDate) < 0)
    .sort((a, b) => new Date(b.reminderDate).getTime() - new Date(a.reminderDate).getTime());

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reminders</p>
          <h1>Never miss what matters</h1>
        </div>
        <Button size="lg" onClick={() => openForm()}>
          <Plus size={20} /> New Reminder
        </Button>
      </header>

      {loading ? (
        <div className="page-loading">Loading reminders…</div>
      ) : reminders.length === 0 ? (
        <div className="empty-state">
          <Bell size={40} />
          <strong>No reminders yet</strong>
          <p>Create a reminder so nothing slips through.</p>
          <Button onClick={() => openForm()}><Plus size={18} /> New Reminder</Button>
        </div>
      ) : (
        <>
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="section-title">Upcoming ({upcoming.length})</h2>
            <div className="reminders-list">
              {upcoming.map((reminder) => {
                const days = daysUntil(reminder.reminderDate);
                return (
                  <Card key={reminder.id} className={`reminder-card ${!reminder.enabled ? 'disabled' : ''}`} padding="md">
                    <div className="reminder-main">
                      <div className="reminder-info">
                        <strong>{reminder.title}</strong>
                        {reminder.description && <p className="reminder-desc">{reminder.description}</p>}
                        <div className="reminder-badges">
                          <Badge variant={days === 0 ? 'danger' : days <= 1 ? 'warning' : 'outline'}>
                            {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                          </Badge>
                          <span className="reminder-when">
                            {new Date(reminder.reminderDate).toLocaleDateString()} {reminder.reminderTime && `at ${reminder.reminderTime}`}
                          </span>
                          {reminder.repeatType !== 'NONE' && <Badge variant="info">{reminder.repeatType.toLowerCase()}</Badge>}
                        </div>
                      </div>
                      <div className="reminder-actions">
                        <Switch checked={reminder.enabled} onChange={() => toggleEnabled(reminder)} aria-label={`Enable ${reminder.title}`} />
                        <Button variant="ghost" size="sm" onClick={() => openForm(reminder)} aria-label="Edit"><Pencil size={16} /></Button>
                        <Button variant="ghost" size="sm" className="danger-ghost" onClick={() => setDeleteTarget(reminder)} aria-label="Delete"><Trash2 size={16} /></Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
              {upcoming.length === 0 && <p className="empty-milestone">No upcoming reminders.</p>}
            </div>
          </section>

          {past.length > 0 && (
            <section aria-labelledby="past-heading" className="past-section">
              <h2 id="past-heading" className="section-title">Past ({past.length})</h2>
              <div className="reminders-list">
                {past.map((reminder) => (
                  <Card key={reminder.id} className="reminder-card past" padding="md">
                    <div className="reminder-main">
                      <div className="reminder-info">
                        <strong>{reminder.title}</strong>
                        <div className="reminder-badges">
                          <Badge variant="outline">past</Badge>
                          <span className="reminder-when">{new Date(reminder.reminderDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="reminder-actions">
                        <Button variant="ghost" size="sm" onClick={() => openForm(reminder)} aria-label="Edit"><Pencil size={16} /></Button>
                        <Button variant="ghost" size="sm" className="danger-ghost" onClick={() => setDeleteTarget(reminder)} aria-label="Delete"><Trash2 size={16} /></Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Reminder' : 'New Reminder'}>
        <form onSubmit={handleSubmit} className="modal-form">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <div className="form-row">
            <Input label="Date" type="date" value={form.reminderDate} min={todayISO()} onChange={(e) => setForm({ ...form, reminderDate: e.target.value })} required />
            <Input label="Time" type="time" value={form.reminderTime} onChange={(e) => setForm({ ...form, reminderTime: e.target.value })} />
          </div>
          <div className="form-row">
            <label className="input-label">
              Repeat
              <select value={form.repeatType} onChange={(e) => setForm({ ...form, repeatType: e.target.value as Reminder['repeatType'] })} className="select">
                <option value="NONE">Never</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <div className="form-switch">
              <Switch checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} label="Enabled" />
            </div>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save' : 'Create Reminder'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) { await remove(deleteTarget.id); setDeleteTarget(null); } }}
        title="Delete reminder?"
        message={`"${deleteTarget?.title}" will be permanently deleted.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
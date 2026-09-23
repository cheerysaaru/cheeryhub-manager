import { useEffect, useState } from 'react';
import { BookOpen, Save, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useJournal } from '../hooks/useJournal';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Textarea } from '../components/Textarea';
import { Badge } from '../components/Badge';
import { todayISO } from '../utils/date';

const fields = [
  { key: 'accomplishments', label: 'What did you accomplish today?' },
  { key: 'lessons', label: 'What did you learn?' },
  { key: 'procrastination', label: 'Where did you procrastinate?' },
  { key: 'improvements', label: 'How could tomorrow be better?' },
  { key: 'gratitude', label: 'What are you grateful for?' },
] as const;

type FieldKey = (typeof fields)[number]['key'];

export default function JournalPage() {
  const { user } = useAuth();
  const { entries, loading, getByDate, save } = useJournal(user?.id ?? null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [form, setForm] = useState<Record<FieldKey, string>>({
    accomplishments: '',
    lessons: '',
    procrastination: '',
    improvements: '',
    gratitude: '',
  });
  const [passionScore, setPassionScore] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingEntry(true);
    getByDate(selectedDate).then((entry) => {
      if (cancelled) return;
      if (entry) {
        setForm({
          accomplishments: entry.accomplishments ?? '',
          lessons: entry.lessons ?? '',
          procrastination: entry.procrastination ?? '',
          improvements: entry.improvements ?? '',
          gratitude: entry.gratitude ?? '',
        });
        setPassionScore(entry.passionScore ?? 5);
      } else {
        setForm({ accomplishments: '', lessons: '', procrastination: '', improvements: '', gratitude: '' });
        setPassionScore(5);
      }
      setLoadingEntry(false);
    });
    return () => { cancelled = true; };
  }, [selectedDate, getByDate]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await save({
        date: `${selectedDate}T00:00:00.000Z`,
        ...form,
        passionScore,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function shiftDate(delta: number) {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next <= todayISO()) setSelectedDate(next);
  }

  const entryDates = new Set(entries.map((e) => e.date.slice(0, 10)));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Journal</p>
          <h1>Reflect on your day</h1>
        </div>
        <div className="journal-nav">
          <Button variant="outline" size="sm" onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft size={18} />
          </Button>
          <input
            type="date"
            value={selectedDate}
            max={todayISO()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-input"
            aria-label="Journal date"
          />
          <Button variant="outline" size="sm" onClick={() => shiftDate(1)} disabled={selectedDate >= todayISO()} aria-label="Next day">
            <ChevronRight size={18} />
          </Button>
        </div>
      </header>

      <Card padding="lg">
        {loadingEntry ? (
          <div className="page-loading">Loading entry…</div>
        ) : (
          <form onSubmit={handleSave} className="journal-form">
            {fields.map((field) => (
              <Textarea
                key={field.key}
                label={field.label}
                value={form[field.key]}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                rows={3}
                placeholder="Write freely…"
              />
            ))}
            <div className="passion-row">
              <label className="input-label">
                Passion score: {passionScore}/10
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={passionScore}
                  onChange={(e) => setPassionScore(Number(e.target.value))}
                  className="range-input"
                />
              </label>
              <div className="passion-stars" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <Star key={i} size={18} className={i < passionScore ? 'star-active' : 'star-inactive'} fill={i < passionScore ? 'currentColor' : 'none'} />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <span className={`save-indicator ${saved ? 'show' : ''}`} role="status">Saved ✓</span>
              <Button type="submit" loading={saving} size="lg">
                <Save size={18} /> Save Entry
              </Button>
            </div>
          </form>
        )}
      </Card>

      <section className="panel" aria-labelledby="journal-history-heading">
        <div className="panel-header">
          <div>
            <h2 id="journal-history-heading">Past Entries</h2>
            <p className="panel-subtitle">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
          </div>
        </div>
        {loading ? (
          <div className="page-loading">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={32} />
            <strong>No entries yet</strong>
            <p>Write today's entry above to get started.</p>
          </div>
        ) : (
          <ul className="journal-history-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button className="journal-history-item" onClick={() => setSelectedDate(entry.date.slice(0, 10))}>
                  <strong>{new Date(entry.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
                  <span className="journal-preview">{entry.accomplishments?.slice(0, 80) || entry.gratitude?.slice(0, 80) || 'No content'}</span>
                  {entry.passionScore && <Badge variant="info">{entry.passionScore}/10</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
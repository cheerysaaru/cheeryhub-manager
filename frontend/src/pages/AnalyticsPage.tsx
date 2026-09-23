import { useEffect, useState } from 'react';
import { BarChart2, Download, Flame, CheckCircle2, Target, Brain } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAnalytics } from '../hooks/useAnalytics';
import { useTasks } from '../hooks/useTasks';
import { useHabits } from '../hooks/useHabits';
import { useFocus } from '../hooks/useFocus';
import { Button } from '../components/Button';
import { Card, CardTitle, CardDescription } from '../components/Card';
import { Progress } from '../components/Progress';
import { Badge } from '../components/Badge';
import { downloadJson } from '../utils/misc';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { stats, xp, loading, fetchAnalytics, exportBackup, importBackup } = useAnalytics(user?.id ?? null);
  const { tasks } = useTasks(user?.id ?? null);
  const { habits } = useHabits(user?.id ?? null);
  const { sessions } = useFocus(user?.id ?? null);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const totalXP = xp?.total ?? 0;
  const level = Math.floor(totalXP / 100) + 1;
  const xpInLevel = totalXP % 100;
  const totalTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const totalHabits = habits.reduce((s, h) => s + h.completedDays, 0);
  const totalFocus = sessions.filter((s) => s.status === 'COMPLETED').reduce((s, x) => s + x.durationMinutes, 0);
  const recentXp = (xp?.history ?? []).slice(0, 10);

  async function handleExport() {
    try {
      const data = await exportBackup();
      downloadJson(`productivity-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
    } catch {
      alert('Export failed. Please try again.');
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importBackup(data);
      setImportMsg('Backup imported successfully.');
      fetchAnalytics();
    } catch (err) {
      setImportMsg(`Import failed: ${err instanceof Error ? err.message : 'invalid file'}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  const last14 = stats.slice(-14);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1>Your progress at a glance</h1>
        </div>
        <div className="header-actions-row">
          <Button variant="secondary" onClick={handleExport}>
            <Download size={18} /> Export Backup
          </Button>
          <label className="import-label" style={{ cursor: 'pointer' }}>
            <span className="sr-only">Import backup file</span>
            <input type="file" accept="application/json" onChange={handleImport} disabled={importing} />
          </label>
        </div>
      </header>

      {importMsg && <p className="save-indicator show" role="status">{importMsg}</p>}

      <div className="stats-grid analytics-stats">
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label"><Flame size={16} /> Level</span>
            <div className="stat-value-row"><strong>{level}</strong></div>
            <Progress value={xpInLevel} max={100} showLabel label={`${xpInLevel} / 100 XP`} />
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label"><Target size={16} /> Total XP</span>
            <div className="stat-value-row"><strong>{totalXP}</strong></div>
            <p className="stat-desc">{recentXp.length} recent transactions</p>
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label"><CheckCircle2 size={16} /> Tasks Completed</span>
            <div className="stat-value-row"><strong>{totalTasks}</strong></div>
            <p className="stat-desc">All time</p>
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label"><Brain size={16} /> Focus Minutes</span>
            <div className="stat-value-row"><strong>{totalFocus}</strong></div>
            <p className="stat-desc">Deep work total</p>
          </div>
        </Card>
      </div>

      <section className="panel" aria-labelledby="trend-heading">
        <div className="panel-header">
          <div>
            <h2 id="trend-heading">Daily Productivity</h2>
            <p className="panel-subtitle">Last {last14.length} days with recorded stats</p>
          </div>
        </div>
        {loading ? (
          <div className="page-loading">Loading analytics…</div>
        ) : last14.length === 0 ? (
          <div className="empty-state">
            <BarChart2 size={32} />
            <strong>No stats yet</strong>
            <p>Stats appear as you complete tasks and habits.</p>
          </div>
        ) : (
          <div className="bar-chart" role="img" aria-label="Productivity over the last days">
            {last14.map((day) => (
              <div key={day.id} className="bar-col" title={`${new Date(day.date).toLocaleDateString()}: ${day.productivityPercentage}%`}>
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: `${day.productivityPercentage}%` }} />
                </div>
                <span className="bar-label">{new Date(day.date).getDate()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="xp-heading">
        <div className="panel-header">
          <div>
            <h2 id="xp-heading">Recent XP</h2>
            <p className="panel-subtitle">Your latest rewards</p>
          </div>
        </div>
        {recentXp.length === 0 ? (
          <div className="empty-state">
            <Flame size={32} />
            <strong>No XP yet</strong>
            <p>Complete tasks and habits to earn XP.</p>
          </div>
        ) : (
          <ul className="xp-list">
            {recentXp.map((item) => (
              <li key={item.id} className="xp-item">
                <Badge variant={item.amount > 0 ? 'success' : 'danger'}>{item.amount > 0 ? '+' : ''}{item.amount} XP</Badge>
                <span className="xp-reason">{item.reason}</span>
                <span className="xp-date">{new Date(item.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="backup-heading">
        <div className="panel-header">
          <div>
            <h2 id="backup-heading">Backup & Export</h2>
            <p className="panel-subtitle">Export all your data or restore from a backup file</p>
          </div>
        </div>
        <p className="muted">Export creates a JSON file with tasks, habits, goals, skills, journal entries, focus sessions, reminders, XP, and stats. Import merges tasks and habits from a previously exported file.</p>
        <div className="header-actions-row" style={{ marginTop: '16px' }}>
          <Button variant="primary" onClick={handleExport}><Download size={18} /> Export Backup</Button>
          <label className="import-label">
            <span className="sr-only">Import backup file</span>
            <input type="file" accept="application/json" onChange={handleImport} disabled={importing} />
          </label>
        </div>
      </section>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { Settings, Download, LogOut, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { Card, CardTitle, CardDescription } from '../components/Card';
import { Input } from '../components/Input';
import { Switch } from '../components/Switch';
import { api } from '../services/api';
import { downloadJson } from '../utils/misc';
import type { UserSettings } from '../types';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<UserSettings>('/settings')
      .then((data) => setSettings(data))
      .catch(() => {
        setSettings({
          id: '', userId: user?.id ?? '',
          wakeUpTime: '07:00', sleepTime: '22:30',
          breakfastTime: '08:00', lunchTime: '12:30', dinnerTime: '18:30',
          defaultFocusDuration: 25, defaultBreakDuration: 5, notificationsEnabled: true,
          createdAt: '', updatedAt: '',
        });
      })
      .finally(() => setLoading(false));
  }, [user]);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api<UserSettings>('/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      const data = await api('/backup/export');
      downloadJson(`productivity-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
    } catch {
      alert('Export failed. Please try again.');
    }
  }

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (loading || !settings) {
    return <div className="page-loading">Loading settings…</div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Customise your experience</h1>
        </div>
      </header>

      <Card padding="lg">
        <div className="settings-section">
          <div className="settings-section-header">
            <User size={20} />
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your account information</CardDescription>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field">
              <label className="input-label">Name</label>
              <p className="settings-value">{user?.name}</p>
            </div>
            <div className="settings-field">
              <label className="input-label">Email</label>
              <p className="settings-value">{user?.email}</p>
            </div>
            <div className="settings-field">
              <label className="input-label">Timezone</label>
              <p className="settings-value">{user?.timezone}</p>
            </div>
            <div className="settings-field">
              <label className="input-label">Member since</label>
              <p className="settings-value">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="settings-section">
          <div className="settings-section-header">
            <Settings size={20} />
            <div>
              <CardTitle>Daily Schedule</CardTitle>
              <CardDescription>Set your preferred times for the day</CardDescription>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field">
              <Input label="Wake up" type="time" value={settings.wakeUpTime} onChange={(e) => update('wakeUpTime', e.target.value)} />
            </div>
            <div className="settings-field">
              <Input label="Breakfast" type="time" value={settings.breakfastTime} onChange={(e) => update('breakfastTime', e.target.value)} />
            </div>
            <div className="settings-field">
              <Input label="Lunch" type="time" value={settings.lunchTime} onChange={(e) => update('lunchTime', e.target.value)} />
            </div>
            <div className="settings-field">
              <Input label="Dinner" type="time" value={settings.dinnerTime} onChange={(e) => update('dinnerTime', e.target.value)} />
            </div>
            <div className="settings-field">
              <Input label="Sleep" type="time" value={settings.sleepTime} onChange={(e) => update('sleepTime', e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="settings-section">
          <div className="settings-section-header">
            <Settings size={20} />
            <div>
              <CardTitle>Focus Defaults</CardTitle>
              <CardDescription>Default durations for focus sessions</CardDescription>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field">
              <Input label="Focus duration (min)" type="number" min="5" max="180" value={settings.defaultFocusDuration} onChange={(e) => update('defaultFocusDuration', Number(e.target.value))} />
            </div>
            <div className="settings-field">
              <Input label="Break duration (min)" type="number" min="1" max="60" value={settings.defaultBreakDuration} onChange={(e) => update('defaultBreakDuration', Number(e.target.value))} />
            </div>
            <div className="settings-field">
              <Switch checked={settings.notificationsEnabled} onChange={(e) => update('notificationsEnabled', e.target.checked)} label="Enable notifications" />
            </div>
          </div>
          <div className="settings-actions">
            <span className={`save-indicator ${saved ? 'show' : ''}`} role="status">Saved ✓</span>
            <Button onClick={saveSettings} loading={saving}>Save Settings</Button>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="settings-section">
          <div className="settings-section-header">
            <Download size={20} />
            <div>
              <CardTitle>Data & Backup</CardTitle>
              <CardDescription>Export all your data as JSON</CardDescription>
            </div>
          </div>
          <div className="settings-actions">
            <Button variant="secondary" onClick={handleExport}>
              <Download size={18} /> Export All Data
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="settings-section">
          <div className="settings-section-header">
            <LogOut size={20} />
            <div>
              <CardTitle>Sign Out</CardTitle>
              <CardDescription>Log out of this device</CardDescription>
            </div>
          </div>
          <div className="settings-actions">
            <Button variant="danger" onClick={logout}>
              <LogOut size={18} /> Log Out
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
import { useEffect, useRef, useState } from 'react';
import { Settings, Download, LogOut, User, Palette } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { Card, CardTitle, CardDescription } from '../components/Card';
import { Input } from '../components/Input';
import { Switch } from '../components/Switch';
import { Avatar } from '../components/Avatar';
import { Tabs, TabsList, TabsTrigger } from '../components/Tabs';
import { ProfilePhotoCropModal } from '../components/ProfilePhotoCropModal';
import { api } from '../services/api';
import { downloadJson } from '../utils/misc';
import { todayISO } from '../utils/date';
import { getTheme, applyTheme, type ThemeMode } from '../utils/theme';
import { getDisplayName, getProfilePic, notifyProfileUpdated, saveProfilePic, removeProfilePic } from '../utils/profile';
import type { UserSettings } from '../types';

const MAX_USERNAME_CHANGES = 2;

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [profilePic, setProfilePic] = useState<string | null>(() => getProfilePic());
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [username, setUsername] = useState(() => getDisplayName(user?.name ?? ''));
  const [usernameChangeCount, setUsernameChangeCount] = useState(() => {
    try {
      return parseInt(localStorage.getItem('usernameChangeCount') || '0', 10) || 0;
    } catch {
      return 0;
    }
  });
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  function handleThemeChange(value: string) {
    const next = value === 'dark' ? 'dark' : 'light';
    applyTheme(next);
    setThemeState(next);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(String(reader.result));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleCropSave(base64: string) {
    saveProfilePic(base64);
    setProfilePic(base64);
    setCropSrc(null);
  }

  function handleRemovePhoto() {
    removeProfilePic();
    setProfilePic(null);
  }

  function saveUsername() {
    const trimmed = username.trim();
    if (!trimmed || usernameChangeCount >= MAX_USERNAME_CHANGES) return;
    try {
      localStorage.setItem('userName', trimmed);
      localStorage.setItem('usernameChangeCount', String(usernameChangeCount + 1));
    } catch {
      /* Storage may be unavailable. */
    }
    setUsername(trimmed);
    setUsernameChangeCount(usernameChangeCount + 1);
    setUsernameSaved(true);
    setTimeout(() => setUsernameSaved(false), 3000);
    notifyProfileUpdated();
  }

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
      downloadJson(`productivity-backup-${todayISO()}.json`, data);
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
      await api('/backup/import', { method: 'POST', body: JSON.stringify(data) });
      setImportMsg('Backup imported successfully.');
    } catch (err) {
      setImportMsg(`Import failed: ${err instanceof Error ? err.message : 'invalid file'}`);
    } finally {
      setImporting(false);
      e.target.value = '';
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
            <div className="settings-field settings-field-wide">
              <label className="input-label">Profile Photo</label>
              <div className="profile-photo-row">
                <div className="profile-photo-main">
                  <Avatar
                    size="xl"
                    className="settings-avatar"
                    name={username || user?.name || '?'}
                    src={profilePic}
                    alt="Profile photo"
                  />
                  {profilePic && (
                    <button type="button" className="remove-photo-link" onClick={handleRemovePhoto}>
                      Remove photo
                    </button>
                  )}
                </div>
                <Button variant="secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                  Change Photo
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Choose profile photo"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>
            <div className="settings-field settings-field-wide">
              <label className="input-label" htmlFor="profile-username">Username</label>
              <div className="settings-username-row">
                <Input
                  id="profile-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={usernameChangeCount >= MAX_USERNAME_CHANGES}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  onClick={saveUsername}
                  disabled={usernameChangeCount >= MAX_USERNAME_CHANGES || !username.trim()}
                >
                  Save
                </Button>
              </div>
              {usernameChangeCount >= MAX_USERNAME_CHANGES ? (
                <p className="settings-note">You have used both username changes. Username cannot be changed again.</p>
              ) : usernameChangeCount === 0 ? (
                <p className="settings-note">You can change your username 2 times total.</p>
              ) : (
                <p className="settings-note">
                  You can change your username {MAX_USERNAME_CHANGES - usernameChangeCount} more time(s).
                </p>
              )}
              <span className={`save-indicator ${usernameSaved ? 'show' : ''}`} role="status">Saved ✓</span>
            </div>
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
            <Palette size={20} />
            <div>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Choose how cheeryhub looks</CardDescription>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field">
              <label className="input-label">Theme</label>
              <Tabs value={theme} onValueChange={handleThemeChange}>
                <TabsList>
                  <TabsTrigger value="light">Light</TabsTrigger>
                  <TabsTrigger value="dark">Dark</TabsTrigger>
                </TabsList>
              </Tabs>
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
              <CardDescription>Export your data as JSON or restore from a backup file</CardDescription>
            </div>
          </div>
          <div className="settings-actions">
            <Button variant="secondary" onClick={handleExport}>
              <Download size={18} /> Export All Data
            </Button>
            <label className="import-label">
              <span className="sr-only">Import backup file</span>
              <input type="file" accept="application/json" onChange={handleImport} disabled={importing} />
            </label>
          </div>
          {importMsg && <p className="save-indicator show" role="status">{importMsg}</p>}
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

      {cropSrc && (
        <ProfilePhotoCropModal
          imageSrc={cropSrc}
          onCancel={() => setCropSrc(null)}
          onSave={handleCropSave}
        />
      )}
    </div>
  );
}
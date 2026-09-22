import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, CheckCircle2, Circle, LogOut, Plus, Trash2, Wifi, WifiOff, DollarSign, ArrowRight } from 'lucide-react';
import './styles.css';
import TaskBoard from './TaskBoard';
import FinancePanel from './FinancePanel';

const BASE_PATH = '/personal-productivity-manager';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${BASE_PATH}/sw.js`); });
}

type User = { id: string; name: string; email: string; timezone: string; createdAt: string };
type Task = { 
  id: string; 
  title: string; 
  description?: string;
  category?: string;
  priority: string; 
  status: string; 
  scheduledDate?: string; 
  scheduledTime?: string;
  deadlineTime?: string;
  timerStartedAt?: string;
  recurrence: string;
  isMandatory: boolean;
  reminderEnabled: boolean;
  estimatedMinutes?: number;
  completedAt?: string;
  deletedAt?: string;
  goalId?: string;
  skillId?: string;
  createdAt: string;
  updatedAt: string;
  checkedToday: boolean;
  checkedDays: number;
  missedDays: number;
  isOverdue: boolean;
};
type Habit = { 
  id: string; 
  name: string; 
  description?: string;
  frequency: string; 
  active: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedToday: boolean;
  completedDays: number;
  weekCompletedDays: number;
  weekDates: string[];
  completedDates: string[];
};
type Reminder = { 
  id: string; 
  title: string; 
  description?: string; 
  reminderDate: string; 
  reminderTime?: string; 
  repeatType: string; 
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
type ApiFn = <T>(path: string, init?: RequestInit) => Promise<T>;
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
type PendingWrite = { path: string; init: RequestInit };
const queueKey = 'productivity-pending-writes';
async function flushQueue() { const pending = JSON.parse(localStorage.getItem(queueKey) ?? '[]') as PendingWrite[]; for (const write of pending) { try { const response = await fetch(`${API}${write.path}`, { ...write.init, credentials: 'include' }); if (!response.ok) return; } catch { return; } } localStorage.removeItem(queueKey); }
async function api<T>(path: string, init?: RequestInit): Promise<T> { try { const response = await fetch(`${API}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Request failed'); return body.data; } catch (error) { if (init?.method && init.method !== 'GET' && !navigator.onLine) { const pending = JSON.parse(localStorage.getItem(queueKey) ?? '[]') as PendingWrite[]; pending.push({ path, init }); localStorage.setItem(queueKey, JSON.stringify(pending)); return undefined as T; } throw error; } }

function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [registering, setRegistering] = useState(false); const [form, setForm] = useState({ name: '', email: '', password: '' }); const [error, setError] = useState('');
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); try { const result = await api<{ user: User }>(registering ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(form) }); onLogin(result.user); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in'); } }
  return <main className="auth"><section><p className="eyebrow">A quieter way to make progress</p><h1>Keep your days<br /><em>in motion.</em></h1><p className="muted">Your tasks, rituals, focus, and reflection in one durable home.</p><form onSubmit={submit}>{registering && <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}<input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /><input type="password" placeholder="Password (10+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} required /><button type="submit">{registering ? 'Create account' : 'Enter dashboard'}</button></form>{error && <p className="error">{error}</p>}<button className="link" onClick={() => setRegistering(!registering)}>{registering ? 'I already have an account' : 'Create a new account'}</button></section></main>;
}

function FinancePage({ user, onLogout, api }: { user: User; onLogout: () => void; api: ApiFn }) {
  const navigate = useNavigate();
  return (
    <main className="shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Finance Tracker</p>
          <h1>Income & Expenses</h1>
        </div>
        <div className="header-actions">
          <button className="logout-button" onClick={() => navigate('/')}>
            <ArrowRight size={19} />
            <span>Back to Dashboard</span>
          </button>
          <button className="logout-button" onClick={() => api('/auth/logout', { method: 'POST' }).then(onLogout)} aria-label="Log out">
            <LogOut size={19} />
            <span>Log out</span>
          </button>
        </div>
      </header>
      <FinancePanel api={api} />
    </main>
  );
}

function App() { 
  const [user, setUser] = useState<User | null>(null); 
  useEffect(() => { 
    api<{ user: User }>('/auth/me').then((result) => setUser(result.user)).catch(() => undefined); 
  }, []); 
  
  if (!user) return <Auth onLogin={setUser} />;
  
  return (
    <Routes>
      <Route path="/" element={<TaskBoard user={user} api={api} onLogout={() => setUser(null)} />} />
      <Route path="/finance" element={<FinancePage user={user} api={api} onLogout={() => setUser(null)} />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Bell, CalendarClock, CheckCircle2, Circle, LogOut, Plus, Trash2, Wifi, WifiOff } from 'lucide-react';
import './styles.css';
import TaskBoard from './TaskBoard';

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
function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]); const [habits, setHabits] = useState<Habit[]>([]); const [title, setTitle] = useState(''); const [offline, setOffline] = useState(!navigator.onLine);
  async function refresh() { try { setTasks(await api<Task[]>('/tasks')); setHabits(await api<Habit[]>('/habits')); } catch { setOffline(true); } }
  useEffect(() => { refresh(); const online = () => { setOffline(false); flushQueue().then(refresh); }; const down = () => setOffline(true); addEventListener('online', online); addEventListener('offline', down); return () => { removeEventListener('online', online); removeEventListener('offline', down); }; }, []);
  async function addTask(event: React.FormEvent) { event.preventDefault(); if (!title.trim()) return; await api('/tasks', { method: 'POST', body: JSON.stringify({ title, priority: 'MEDIUM' }) }); setTitle(''); refresh(); }
  async function complete(id: string) { await api(`/tasks/${id}/complete`, { method: 'PATCH' }); refresh(); }
  return <main className="shell"><header><div><p className="eyebrow">PERSONAL OPERATING SYSTEM</p><h1>Good morning, {user.name.split(' ')[0]}.</h1></div><div className="header-actions"><span className={offline ? 'network offline' : 'network'}>{offline ? <WifiOff size={15} /> : <Wifi size={15} />}{offline ? 'Offline' : 'Synced'}</span><button className="icon-button" onClick={async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); }} title="Sign out"><LogOut size={18} /></button></div></header><section className="stats"><div><span>Today</span><strong>{tasks.filter((task) => task.status === 'COMPLETED').length}/{tasks.length}</strong><small>tasks complete</small></div><div><span>Rituals</span><strong>{habits.length}</strong><small>active habits</small></div><div><span>Account</span><strong>Live</strong><small>database connected</small></div></section><div className="grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">FOCUS LIST</p><h2>Today&apos;s tasks</h2></div><span>{tasks.length} total</span></div><form className="add" onSubmit={addTask}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs your attention?" /><button title="Add task"><Plus size={18} /></button></form><div className="items">{tasks.map((task) => <button className={`item ${task.status === 'COMPLETED' ? 'done' : ''}`} key={task.id} onClick={() => task.status !== 'COMPLETED' && complete(task.id)}>{task.status === 'COMPLETED' ? <CheckCircle2 /> : <Circle />}<span>{task.title}</span><small>{task.priority}</small></button>)}</div></section><section className="panel accent"><p className="eyebrow">YOUR RHYTHM</p><h2>Small actions,<br /><em>compounding days.</em></h2><p className="muted">Every completion is stored in your account and contributes to the history you build over time.</p><div className="habit-list">{habits.map((habit) => <div key={habit.id}><CheckCircle2 size={17} /><span>{habit.name}</span><small>{habit.frequency}</small></div>)}</div></section></div></main>;
}
function TaskReminderDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]); const [habits, setHabits] = useState<Habit[]>([]); const [reminders, setReminders] = useState<Reminder[]>([]); const [offline, setOffline] = useState(!navigator.onLine);
  const [taskForm, setTaskForm] = useState({ title: '', scheduledDate: '', scheduledTime: '' }); const [reminderForm, setReminderForm] = useState({ title: '', reminderDate: '', reminderTime: '', repeatType: 'NONE' });
  async function refresh() { try { const [nextTasks, nextHabits, nextReminders] = await Promise.all([api<Task[]>('/tasks'), api<Habit[]>('/habits'), api<Reminder[]>('/reminders')]); setTasks(nextTasks); setHabits(nextHabits); setReminders(nextReminders); setOffline(false); } catch { setOffline(true); } }
  useEffect(() => { refresh(); const online = () => { setOffline(false); flushQueue().then(refresh); }; const down = () => setOffline(true); addEventListener('online', online); addEventListener('offline', down); return () => { removeEventListener('online', online); removeEventListener('offline', down); }; }, []);
  async function addTask(event: React.FormEvent) { event.preventDefault(); if (!taskForm.title.trim()) return; await api('/tasks', { method: 'POST', body: JSON.stringify({ title: taskForm.title, priority: 'MEDIUM', scheduledDate: taskForm.scheduledDate || undefined, scheduledTime: taskForm.scheduledTime || undefined }) }); setTaskForm({ title: '', scheduledDate: '', scheduledTime: '' }); refresh(); }
  async function deleteTask(id: string) { await api(`/tasks/${id}`, { method: 'DELETE' }); refresh(); }
  async function completeTask(id: string) { await api(`/tasks/${id}/complete`, { method: 'PATCH' }); refresh(); }
  async function addReminder(event: React.FormEvent) { event.preventDefault(); if (!reminderForm.title.trim() || !reminderForm.reminderDate) return; await api('/reminders', { method: 'POST', body: JSON.stringify({ ...reminderForm, reminderDate: `${reminderForm.reminderDate}T00:00:00.000Z`, reminderTime: reminderForm.reminderTime || undefined }) }); setReminderForm({ title: '', reminderDate: '', reminderTime: '', repeatType: 'NONE' }); refresh(); }
  async function deleteReminder(id: string) { await api(`/reminders/${id}`, { method: 'DELETE' }); refresh(); }
  return <main className="shell"><header><div><p className="eyebrow">PERSONAL OPERATING SYSTEM</p><h1>Good morning, {user.name.split(' ')[0]}.</h1></div><div className="header-actions"><span className={offline ? 'network offline' : 'network'}>{offline ? <WifiOff size={15} /> : <Wifi size={15} />}{offline ? 'Offline' : 'Synced'}</span><button className="icon-button" onClick={async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); }} title="Sign out"><LogOut size={18} /></button></div></header><section className="stats"><div><span>Today</span><strong>{tasks.filter((task) => task.status === 'COMPLETED').length}/{tasks.length}</strong><small>tasks complete</small></div><div><span>Rituals</span><strong>{habits.length}</strong><small>active habits</small></div><div><span>Reminders</span><strong>{reminders.length}</strong><small>saved in database</small></div></section><div className="grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">FOCUS LIST</p><h2>Today&apos;s tasks</h2></div><span>{tasks.length} total</span></div><form className="add task-form" onSubmit={addTask}><input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="What needs your attention?" /><input type="date" value={taskForm.scheduledDate} onChange={(event) => setTaskForm({ ...taskForm, scheduledDate: event.target.value })} aria-label="Task date" /><input type="time" value={taskForm.scheduledTime} onChange={(event) => setTaskForm({ ...taskForm, scheduledTime: event.target.value })} aria-label="Task time" /><button title="Add task"><Plus size={18} /></button></form><div className="items">{tasks.map((task) => <div className={`item ${task.status === 'COMPLETED' ? 'done' : ''}`} key={task.id}><button className="item-main" onClick={() => task.status !== 'COMPLETED' && completeTask(task.id)}>{task.status === 'COMPLETED' ? <CheckCircle2 /> : <Circle />}<span>{task.title}</span></button>{task.scheduledTime && <small className="scheduled"><CalendarClock size={13} />{task.scheduledTime}</small>}<small>{task.priority}</small><button className="delete-button" onClick={() => deleteTask(task.id)} title="Delete task"><Trash2 size={16} /></button></div>)}</div></section><section className="panel accent"><p className="eyebrow">REMINDERS</p><h2>Keep important things<br /><em>close at hand.</em></h2><form className="reminder-form" onSubmit={addReminder}><input value={reminderForm.title} onChange={(event) => setReminderForm({ ...reminderForm, title: event.target.value })} placeholder="Reminder title" required /><div className="form-row"><input type="date" value={reminderForm.reminderDate} onChange={(event) => setReminderForm({ ...reminderForm, reminderDate: event.target.value })} required aria-label="Reminder date" /><input type="time" value={reminderForm.reminderTime} onChange={(event) => setReminderForm({ ...reminderForm, reminderTime: event.target.value })} aria-label="Reminder time" /></div><select value={reminderForm.repeatType} onChange={(event) => setReminderForm({ ...reminderForm, repeatType: event.target.value })} aria-label="Reminder repeat"><option value="NONE">One time</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select><button type="submit"><Bell size={16} /> Save reminder</button></form><div className="reminder-list">{reminders.map((reminder) => <div key={reminder.id}><div><strong>{reminder.title}</strong><small>{reminder.reminderTime ? `${reminder.reminderDate.slice(0, 10)} at ${reminder.reminderTime}` : reminder.reminderDate.slice(0, 10)} · {reminder.repeatType.toLowerCase()}</small></div><button className="delete-button" onClick={() => deleteReminder(reminder.id)} title="Delete reminder"><Trash2 size={15} /></button></div>)}</div></section></div></main>;
}
function App() { const [user, setUser] = useState<User | null>(null); useEffect(() => { api<{ user: User }>('/auth/me').then((result) => setUser(result.user)).catch(() => undefined); }, []); return user ? <TaskBoard user={user} api={api} onLogout={() => setUser(null)} /> : <Auth onLogin={setUser} />; }
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, CheckCircle2, Clock, Brain } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useFocus } from '../hooks/useFocus';
import { useTasks } from '../hooks/useTasks';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { FocusSession } from '../types';

export default function FocusPage() {
  const { user } = useAuth();
  const { sessions, loading, start, complete } = useFocus(user?.id ?? null);
  const { tasks } = useTasks(user?.id ?? null);
  const [duration, setDuration] = useState(25);
  const [selectedTask, setSelectedTask] = useState('');
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const runningSession = sessions.find((s) => s.status === 'RUNNING') || activeSession;
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED');
  const totalMinutes = completedSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  useEffect(() => {
    if (runningSession && runningSession.status === 'RUNNING') {
      const elapsed = Math.floor((Date.now() - new Date(runningSession.startedAt).getTime()) / 1000);
      const total = runningSession.durationMinutes * 60;
      setRemaining(Math.max(0, total - elapsed));
      if (elapsed >= total) {
        complete(runningSession.id).then(() => setActiveSession(null));
        setRemaining(0);
      }
    }
  }, [runningSession, complete]);

  useEffect(() => {
    if (remaining > 0 && !paused && runningSession) {
      intervalRef.current = window.setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            if (runningSession) complete(runningSession.id).then(() => setActiveSession(null));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [remaining > 0, paused, runningSession, complete]);

  async function handleStart() {
    const session = await start(duration, selectedTask || undefined);
    setActiveSession(session);
    setRemaining(duration * 60);
    setPaused(false);
  }

  async function handleComplete() {
    if (runningSession) {
      await complete(runningSession.id);
      setActiveSession(null);
      setRemaining(0);
      setPaused(false);
    }
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const openTasks = tasks.filter((t) => t.status !== 'COMPLETED' && !t.deletedAt);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Focus</p>
          <h1>Deep work sessions</h1>
        </div>
        <div className="focus-stats">
          <Badge variant="info">{completedSessions.length} sessions</Badge>
          <Badge variant="success">{totalMinutes} min total</Badge>
        </div>
      </header>

      {!runningSession ? (
        <Card className="focus-start-card" padding="lg">
          <div className="focus-start-inner">
            <Brain size={48} className="focus-icon" />
            <h2>Start a focus session</h2>
            <p className="muted">Pick a duration, optionally link a task, and get to work.</p>
            <div className="duration-options" role="radiogroup" aria-label="Session duration">
              {[15, 25, 45, 60, 90].map((d) => (
                <button
                  key={d}
                  className={`duration-chip ${duration === d ? 'selected' : ''}`}
                  onClick={() => setDuration(d)}
                  role="radio"
                  aria-checked={duration === d}
                >
                  {d}m
                </button>
              ))}
            </div>
            {openTasks.length > 0 && (
              <label className="input-label focus-task-label">
                Link a task (optional)
                <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)} className="select">
                  <option value="">No specific task</option>
                  {openTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </label>
            )}
            <Button size="lg" onClick={handleStart}>
              <Play size={20} /> Start {duration}-minute session
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="focus-active-card" padding="lg">
          <div className="focus-active-inner">
            <p className="eyebrow">Session in progress</p>
            <div className="focus-countdown" aria-live="polite">
              {formatCountdown(remaining)}
            </div>
            <p className="focus-task-name">
              {tasks.find((t) => t.id === runningSession.taskId)?.title ?? 'Free focus session'}
            </p>
            <Badge variant="success">{runningSession.durationMinutes} min session</Badge>
            <div className="focus-controls">
              <Button variant="secondary" size="lg" onClick={() => setPaused(!paused)}>
                {paused ? <Play size={20} /> : <Pause size={20} />}
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="primary" size="lg" onClick={handleComplete}>
                <CheckCircle2 size={20} /> Complete
              </Button>
            </div>
          </div>
        </Card>
      )}

      <section className="panel" aria-labelledby="history-heading">
        <div className="panel-header">
          <div>
            <h2 id="history-heading">Session History</h2>
            <p className="panel-subtitle">{completedSessions.length} completed sessions</p>
          </div>
        </div>
        {loading ? (
          <div className="page-loading">Loading history…</div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <Clock size={32} />
            <strong>No sessions yet</strong>
            <p>Start your first focus session above.</p>
          </div>
        ) : (
          <ul className="session-list">
            {sessions.slice(0, 20).map((session) => (
              <li key={session.id} className="session-item">
                <div className="session-info">
                  <strong>{tasks.find((t) => t.id === session.taskId)?.title ?? 'Free focus'}</strong>
                  <span className="session-date">{new Date(session.startedAt).toLocaleDateString()} at {new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="session-meta">
                  <Badge variant={session.status === 'COMPLETED' ? 'success' : session.status === 'RUNNING' ? 'info' : 'outline'}>
                    {session.status.toLowerCase()}
                  </Badge>
                  <span className="session-duration">{session.durationMinutes}m</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
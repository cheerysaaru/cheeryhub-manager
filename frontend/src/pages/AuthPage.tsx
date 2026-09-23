import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../hooks/useAuth';
import { todayISO } from '../utils/date';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (registering) {
        await register(form.name, form.email, form.password, Intl.DateTimeFormat().resolvedOptions().timeZone);
        setVerifyInfo('Check your email for a verification link.');
      } else {
        await login(form.email, form.password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in';
      if (msg.toLowerCase().includes('verified')) {
        setVerifyInfo(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    setError('');
    try {
      const base = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
      await fetch(`${base}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
        credentials: 'include',
      });
      setVerifyInfo('If an account exists, a new verification email has been sent.');
    } catch {
      setVerifyInfo('If an account exists, a new verification email has been sent.');
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">A quieter way to make progress</p>
        <h1>
          Keep your days
          <br />
          <em>in motion.</em>
        </h1>
        <p className="muted">Your tasks, rituals, focus, and reflection in one durable home.</p>

        <form onSubmit={submit} className="auth-form">
          {registering && (
            <Input
              label="Name"
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="10+ characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={10}
            required
          />
          <Button type="submit" size="lg" loading={loading}>
            {registering ? 'Create account' : 'Enter dashboard'}
          </Button>
        </form>

        {error && <p className="error-message" role="alert">{error}</p>}
        {verifyInfo && (
          <div className="verify-info">
            <p>{verifyInfo}</p>
            {registering && form.email && (
              <Button variant="ghost" size="sm" onClick={resendVerification}>
                Resend verification email
              </Button>
            )}
          </div>
        )}

        <button className="link-button" onClick={() => { setRegistering(!registering); setError(''); setVerifyInfo(null); }}>
          {registering ? 'I already have an account' : 'Create a new account'}
        </button>
      </section>
    </main>
  );
}
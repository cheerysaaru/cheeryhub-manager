import { useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../hooks/useAuth';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (registering) {
        await register(form.name, form.email, form.password, Intl.DateTimeFormat().resolvedOptions().timeZone);
      } else {
        await login(form.email, form.password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
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
            label="Username"
            placeholder="user"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={5}
            required
          />
          <Button type="submit" size="lg" loading={loading}>
            {registering ? 'Create account' : 'Enter dashboard'}
          </Button>
        </form>

        {error && <p className="error-message" role="alert">{error}</p>}

        <button className="link-button" onClick={() => { setRegistering(!registering); setError(''); }}>
          {registering ? 'I already have an account' : 'Create a new account'}
        </button>
      </section>
    </main>
  );
}

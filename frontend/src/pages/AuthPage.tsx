import { useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../hooks/useAuth';

export default function AuthPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
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
          <Input
            label="Username"
            placeholder="Enter your username"
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
            Enter dashboard
          </Button>
        </form>

        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    </main>
  );
}

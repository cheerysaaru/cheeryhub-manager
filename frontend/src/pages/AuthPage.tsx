import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../hooks/useAuth';
import {
  PASSWORD_RULES,
  USERNAME_RULES,
  passwordProblem,
  usernameProblem,
} from '../utils/validation';

type Mode = 'signin' | 'register' | 'forgot';

function strengthOf(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*]/.test(password)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] ?? '' };
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const { login, register, forgotPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [error, setError] = useState('');
  const sessionExpired = searchParams.get('session') === 'expired';
  const [notice, setNotice] = useState(() =>
    sessionExpired ? 'Your session has expired. Please sign in again.' : ''
  );
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => strengthOf(password), [password]);

  function resetState(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const name = username.trim();
    const usernameError = usernameProblem(name);
    if (usernameError) {
      setError(usernameError);
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register(name, email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your account');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const message = await forgotPassword(resetEmail.trim());
      setNotice(message);
      setResetEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send the reset link');
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

        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="auth-form">
            <Input
              label="Username"
              placeholder="Username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Button type="submit" size="lg" loading={loading}>
              Enter dashboard
            </Button>
            <div className="auth-links">
              <button type="button" className="link-button" onClick={() => resetState('register')}>
                Create an account
              </button>
              <button type="button" className="link-button" onClick={() => resetState('forgot')}>
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <Input
              label="Username"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              helperText={USERNAME_RULES}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {password && (
              <div className="password-strength" aria-live="polite">
                <div className="strength-track">
                  {[1, 2, 3, 4].map((step) => (
                    <span key={step} className={`strength-seg ${strength.score >= step ? `on level-${strength.score}` : ''}`} />
                  ))}
                </div>
                <small>{strength.label}</small>
              </div>
            )}
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              error={confirm && confirm !== password ? 'Passwords do not match.' : undefined}
              required
            />
            <p className="auth-hint">{PASSWORD_RULES}</p>
            <Button type="submit" size="lg" loading={loading}>
              Create account
            </Button>
            <div className="auth-links">
              <button type="button" className="link-button" onClick={() => resetState('signin')}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="auth-form">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <p className="auth-hint">
              We&apos;ll email you a link that&apos;s valid for 15 minutes.
            </p>
            <Button type="submit" size="lg" loading={loading}>
              Send reset link
            </Button>
            <div className="auth-links">
              <button type="button" className="link-button" onClick={() => resetState('signin')}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {notice && (
          <p className={sessionExpired ? 'error-message' : 'success-message'} role={sessionExpired ? 'alert' : 'status'}>
            {notice}
          </p>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    </main>
  );
}

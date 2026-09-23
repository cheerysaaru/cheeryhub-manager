import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/Button';

const BASE_PATH = '/personal-productivity-manager';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
    fetch(`${base}/auth/verify-email?token=${encodeURIComponent(token)}`, { credentials: 'include' })
      .then(async (r) => {
        const body = await r.json();
        if (r.ok) {
          setStatus('success');
          setMessage(body.data?.message ?? 'Email verified successfully.');
        } else {
          setStatus('error');
          setMessage(body.error ?? 'Verification failed. The link may have expired.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Network error. Please try again.');
      });
  }, [token]);

  return (
    <main className="auth-page">
      <section className="auth-card verify-card">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="spin-icon" />
            <h1>Verifying your email…</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={48} className="success-icon" />
            <h1>Email verified!</h1>
            <p className="muted">{message}</p>
            <Link to={`${BASE_PATH}/`}>
              <Button size="lg">Go to dashboard</Button>
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={48} className="error-icon" />
            <h1>Verification failed</h1>
            <p className="muted">{message}</p>
            <Link to={`${BASE_PATH}/`}>
              <Button variant="secondary" size="lg">Back to login</Button>
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
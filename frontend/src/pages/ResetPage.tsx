import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAuth } from "../hooks/useAuth";
import { PASSWORD_RULES, passwordProblem } from "../utils/validation";

function strengthOf(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*]/.test(password)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] ?? "" };
}

export default function ResetPage() {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => strengthOf(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const message = await resetPassword(token, password);
      setNotice(message);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to reset the password",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Choose a new password</p>
        <h1>
          Set a new
          <br />
          <em>password.</em>
        </h1>
        <p className="muted">
          This link only works once and expires 15 minutes after it was sent.
        </p>

        {!token && (
          <p className="error-message" role="alert">
            This reset link is missing its token. Request a new one from the
            sign-in page.
          </p>
        )}

        {notice ? (
          <>
            <p className="success-message" role="status">
              {notice} You can sign in now.
            </p>
            <div className="auth-links">
              <Link className="link-button" to="/">
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <Input
              label="New password"
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {password && (
              <div className="password-strength" aria-live="polite">
                <div className="strength-track">
                  {[1, 2, 3, 4].map((step) => (
                    <span
                      key={step}
                      className={`strength-seg ${strength.score >= step ? `on level-${strength.score}` : ""}`}
                    />
                  ))}
                </div>
                <small>{strength.label}</small>
              </div>
            )}
            <Input
              label="Confirm new password"
              type="password"
              placeholder="Repeat the new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              error={
                confirm && confirm !== password
                  ? "Passwords do not match."
                  : undefined
              }
              required
            />
            <p className="auth-hint">{PASSWORD_RULES}</p>
            <Button type="submit" size="lg" loading={loading} disabled={!token}>
              Update password
            </Button>
            <div className="auth-links">
              <Link className="link-button" to="/">
                Back to sign in
              </Link>
            </div>
          </form>
        )}

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

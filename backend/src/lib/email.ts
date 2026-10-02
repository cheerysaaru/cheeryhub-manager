import { getEmailApiKey, getEmailFrom } from './config';
import { CircuitBreaker, fetchWithRetry } from './http';
import { logWarn } from './logger';

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

let breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });

/** Test helper: puts the provider circuit back to closed. */
export function resetEmailBreaker() {
  breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });
}

async function sendEmail(
  { to, subject, html }: EmailPayload,
  requestId?: string
): Promise<boolean> {
  const apiKey = getEmailApiKey();
  if (!apiKey) {
    logWarn('email send skipped: EMAIL_API_KEY is not configured', requestId);
    return false;
  }
  if (!breaker.allow()) {
    logWarn('email send skipped: provider circuit open after repeated failures', requestId);
    return false;
  }
  try {
    const response = await fetchWithRetry(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: getEmailFrom(), to: [to], subject, html }),
      },
      { retries: 2, timeoutMs: 8000 }
    );
    if (!response.ok) {
      breaker.failure();
      logWarn(
        `email send failed: provider responded with ${response.status}`,
        requestId
      );
      return false;
    }
    breaker.success();
    return true;
  } catch (error) {
    breaker.failure();
    logWarn(
      `email send failed: ${error instanceof Error ? error.message : 'network error'}`,
      requestId
    );
    return false;
  }
}

export function sendPasswordResetEmail(
  to: string,
  token: string,
  appUrl: string,
  requestId?: string
) {
  const link = `${appUrl}/reset?token=${encodeURIComponent(token)}`;
  return sendEmail(
    {
      to,
      subject: 'Reset your password',
      html: `<p>Reset link (valid 15 min): <a href="${link}">Reset password</a></p>
<p>If you didn't request this, ignore this email.</p>`,
    },
    requestId
  );
}

export function sendPasswordChangedEmail(to: string, requestId?: string) {
  return sendEmail(
    {
      to,
      subject: 'Your password was changed',
      html: `<p>Your password was just changed. If this wasn't you, reset your password immediately and review your account.</p>`,
    },
    requestId
  );
}

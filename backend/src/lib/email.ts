import { getEmailApiKey, getEmailFrom } from './config';

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmail({ to, subject, html }: EmailPayload): Promise<boolean> {
  const apiKey = getEmailApiKey();
  if (!apiKey) {
    console.error('email send skipped: EMAIL_API_KEY is not configured');
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: getEmailFrom(), to: [to], subject, html }),
    });
    if (!response.ok) {
      console.error(`email send failed: provider responded with ${response.status}`);
      return false;
    }
    return true;
  } catch {
    console.error('email send failed: network error');
    return false;
  }
}

export function sendPasswordResetEmail(to: string, token: string, appUrl: string) {
  const link = `${appUrl}/reset?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: 'Reset your password',
    html: `<p>Reset link (valid 15 min): <a href="${link}">Reset password</a></p>
<p>If you didn't request this, ignore this email.</p>`,
  });
}

export function sendPasswordChangedEmail(to: string) {
  return sendEmail({
    to,
    subject: 'Your password was changed',
    html: `<p>Your password was just changed. If this wasn't you, reset your password immediately and review your account.</p>`,
  });
}

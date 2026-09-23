import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { setAuthCookie } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'temp-mail.org', 'yopmail.com', 'sharklasers.com', 'throwawaymail.com',
  'getnada.com', 'maildrop.cc', 'trashmail.com', 'fakeinbox.com', 'mailcatch.com',
]);

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(10).max(200);
const nameSchema = z.string().trim().min(1).max(100);

const credentials = z.object({
  name: nameSchema.optional(),
  email: emailSchema,
  password: passwordSchema,
  timezone: z.string().max(80).optional(),
});

const publicUser = (user: { id: string; name: string; email: string; timezone: string; createdAt: Date }) => ({
  id: user.id, name: user.name, email: user.email, timezone: user.timezone, createdAt: user.createdAt,
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
  const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim();
  const basePath = process.env.BASE_PATH ?? '';
  const link = `${frontendUrl}${basePath}/verify-email?token=${token}`;
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Productivity <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(`[DEV] Verification link for ${email}: ${link}`);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Verify your email — Personal Productivity Manager',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
            <h1 style="color:#244b2b;">Welcome, ${name}!</h1>
            <p style="color:#536050;font-size:16px;">Please verify your email address to activate your account.</p>
            <a href="${link}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#244b2b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">Verify my email</a>
            <p style="color:#667063;font-size:13px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
          </div>`,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error('[Email] Resend API error:', response.status, body);
    }
  } catch (err) {
    console.error('[Email] Failed to send verification email:', err);
  }
}

function isEmailInUseWhere(excludeUserId?: string) {
  return excludeUserId ? { email: { not: { equals: undefined } } } : undefined;
}

export async function register(request: Request, response: Response) {
  const parsed = credentials.safeParse(request.body);
  if (!parsed.success) {
    return fail(response, 'Name, valid email, and password of at least 10 characters are required');
  }
  const { email, password, name = 'Productive human', timezone = 'UTC' } = parsed.data;

  const domain = email.split('@')[1];
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    return fail(response, 'Please use a permanent email address');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail(response, 'An account with that email already exists', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyHash = hashToken(verifyToken);

  const user = await prisma.user.create({
    data: {
      email, name, timezone, passwordHash,
      emailVerified: false,
      emailVerificationToken: verifyHash,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  await prisma.userSettings.create({ data: { userId: user.id } });
  await sendVerificationEmail(email, name, verifyToken);

  return ok(response, { user: publicUser(user), verificationSent: true }, 201);
}

export async function login(request: Request, response: Response) {
  const parsed = credentials.pick({ email: true, password: true }).safeParse(request.body);
  if (!parsed.success) return fail(response, 'Valid email and password are required');
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return fail(response, 'Invalid email or password', 401);
  }
  if (!user.emailVerified) {
    return fail(response, 'Please verify your email before logging in. Check your inbox for a verification link.', 403);
  }
  setAuthCookie(response, user.id);
  return ok(response, { user: publicUser(user) });
}

export function logout(_request: Request, response: Response) {
  response.clearCookie('auth_token');
  return ok(response, { loggedOut: true });
}

export async function me(request: AuthRequest, response: Response) {
  const user = await prisma.user.findUnique({ where: { id: request.userId } });
  if (!user) return fail(response, 'User not found', 404);
  return ok(response, { user: publicUser(user), emailVerified: user.emailVerified });
}

export async function verifyEmail(request: Request, response: Response) {
  const token = (request.query.token as string) ?? '';
  if (!token) return fail(response, 'Missing verification token');
  const hash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { emailVerificationToken: hash, emailVerificationExpires: { gt: new Date() } },
  });
  if (!user) return fail(response, 'Invalid or expired verification link', 400);
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
  });
  return ok(response, { message: 'Email verified successfully. You can now log in.' });
}

const resendSchema = z.object({ email: emailSchema });
const resendAttempts = new Map<string, { count: number; resetAt: number }>();

export async function resendVerification(request: Request, response: Response) {
  const parsed = resendSchema.safeParse(request.body);
  if (!parsed.success) return ok(response, { message: 'If an account exists, a verification email has been sent.' });

  const email = parsed.data.email;
  const now = Date.now();
  const attempts = resendAttempts.get(email);
  if (attempts && attempts.resetAt > now) {
    if (attempts.count >= 3) {
      return ok(response, { message: 'If an account exists, a verification email has been sent.' });
    }
    attempts.count += 1;
  } else {
    resendAttempts.set(email, { count: 1, resetAt: now + 60 * 60 * 1000 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified) {
    const verifyToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: hashToken(verifyToken),
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await sendVerificationEmail(user.email, user.name, verifyToken);
  }

  return ok(response, { message: 'If an account exists, a verification email has been sent.' });
}

export { emailSchema, passwordSchema, nameSchema };
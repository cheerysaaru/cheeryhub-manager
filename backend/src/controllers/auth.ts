import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { setAuthCookie } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { getAppUrl, getJwtSecret } from '../lib/config';
import { sendPasswordChangedEmail, sendPasswordResetEmail } from '../lib/email';
import { fail, ok } from '../utils/response';
import {
  PASSWORD_REQUIREMENT,
  emailFormatSchema,
  passwordError,
  strongPasswordSchema,
  usernameSchema,
} from '../utils/validation';

const emailSchema = emailFormatSchema;
const passwordSchema = strongPasswordSchema;
const nameSchema = usernameSchema;
const timezoneSchema = z.string().max(80);

const credentials = z.object({
  name: nameSchema.optional(),
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
  timezone: timezoneSchema.optional(),
});

const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  timezone: timezoneSchema.optional(),
});

const forgotSchema = z.object({
  email: z.string().trim().max(254),
});

const resetTokenSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: strongPasswordSchema,
});

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const FORGOT_MESSAGE = 'If that email exists, a reset link was sent.';
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const publicUser = (user: {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt: Date;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'DISABLED';
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  timezone: user.timezone,
  createdAt: user.createdAt,
  role: user.role,
  status: user.status,
});

const requestIdOf = (request: Request): string | undefined =>
  (request as Request & { requestId?: string }).requestId;

function passwordIssue(body: unknown): string {
  const password =
    body && typeof body === 'object'
      ? String((body as Record<string, unknown>).password ?? '')
      : '';
  return passwordError(password);
}

export async function register(request: Request, response: Response) {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'password') {
      const message = passwordIssue(request.body);
      return fail(response, message || PASSWORD_REQUIREMENT);
    }
    return fail(response, issue?.message ?? 'Invalid registration details');
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existingEmail) return fail(response, 'Email already in use', 409);

  const existingName = await prisma.user.findFirst({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (existingName) return fail(response, 'Username already taken', 409);

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: 'USER',
      status: 'ACTIVE',
      timezone: parsed.data.timezone ?? 'UTC',
      lastLoginAt: new Date(),
      settings: { create: {} },
    },
  });

  setAuthCookie(response, user.id);
  return ok(response, { user: publicUser(user) }, 201);
}

export async function login(request: Request, response: Response) {
  const parsed = credentials
    .pick({ email: true, password: true, timezone: true })
    .safeParse(request.body);
  if (!parsed.success) return fail(response, 'Username and password are required');
  const identifier = parsed.data.email;
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { name: identifier }] },
  });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return response.status(401).json({
      error: 'Invalid username or password',
      code: 'INVALID_CREDENTIALS',
      requestId: requestIdOf(request),
    });
  }
  if (user.status !== 'ACTIVE') {
    return fail(response, 'Account disabled', 403);
  }
  const timezone =
    parsed.data.timezone && parsed.data.timezone !== user.timezone
      ? parsed.data.timezone
      : undefined;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(timezone ? { timezone } : {}) },
  });
  setAuthCookie(response, user.id);
  return ok(response, { user: publicUser(updated) });
}

export async function forgotPassword(request: Request, response: Response) {
  const parsed = forgotSchema.safeParse(request.body);
  const submitted = parsed.success ? parsed.data.email : '';
  const candidates = [...new Set([submitted, submitted.toLowerCase()])];

  // Uniform response whether the account exists, is disabled, or the input is
  // malformed — the endpoint must never confirm which emails are registered.
  if (submitted && emailFormatSchema.safeParse(submitted).success) {
    const user = await prisma.user.findFirst({
      where: { email: { in: candidates }, status: 'ACTIVE' },
      select: { id: true, email: true },
    });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await sendPasswordResetEmail(user.email, token, getAppUrl(), requestIdOf(request));
    }
  }
  return ok(response, { message: FORGOT_MESSAGE });
}

export async function resetPasswordWithToken(request: Request, response: Response) {
  const parsed = resetTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'newPassword') {
      const newPassword =
        request.body && typeof request.body === 'object'
          ? String((request.body as Record<string, unknown>).newPassword ?? '')
          : '';
      const message = passwordError(newPassword);
      return fail(response, message || PASSWORD_REQUIREMENT);
    }
    return fail(response, 'Invalid reset request');
  }

  const record = await prisma.passwordReset.findFirst({
    where: {
      tokenHash: sha256(parsed.data.token),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true },
  });
  if (!record) return fail(response, 'Invalid or expired link', 400);

  // Atomic single-use consume: only one request can flip usedAt.
  const consumed = await prisma.passwordReset.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return fail(response, 'Invalid or expired link', 400);

  const user = await prisma.user.findFirst({
    where: { id: record.userId, status: 'ACTIVE' },
    select: { id: true, email: true },
  });
  if (!user) return fail(response, 'Invalid or expired link', 400);

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
  await sendPasswordChangedEmail(user.email, requestIdOf(request));
  return ok(response, { message: 'Password updated successfully' });
}

export function logout(_request: Request, response: Response) {
  response.clearCookie('auth_token');
  return ok(response, { loggedOut: true });
}

/**
 * Re-issues the auth cookie from a token that is still correctly signed but
 * has passed its 7-day expiry, so the frontend can recover silently instead
 * of forcing a sign-in. Never accepts tokens that predate a password change
 * or belong to a disabled/deleted account.
 */
export async function refreshSession(request: AuthRequest, response: Response) {
  const token =
    request.cookies?.auth_token ??
    request.headers.authorization?.replace('Bearer ', '');
  if (!token)
    return response.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
      requestId: requestIdOf(request),
    });

  let payload: { userId: string; iat?: number };
  try {
    payload = jwt.verify(token, getJwtSecret(), {
      ignoreExpiration: true,
    }) as { userId: string; iat?: number };
  } catch {
    return response.status(401).json({
      error: 'Your session has expired. Please sign in again.',
      code: 'SESSION_EXPIRED',
      requestId: requestIdOf(request),
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, status: true, passwordChangedAt: true },
  });
  if (!user || user.status !== 'ACTIVE')
    return response.status(401).json({
      error: 'Your session has expired. Please sign in again.',
      code: 'SESSION_EXPIRED',
      requestId: requestIdOf(request),
    });
  if (
    user.passwordChangedAt &&
    (payload.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)
  )
    return response.status(401).json({
      error: 'Your session has expired. Please sign in again.',
      code: 'SESSION_EXPIRED',
      requestId: requestIdOf(request),
    });

  setAuthCookie(response, user.id);
  return ok(response, { refreshed: true, userId: user.id });
}

export async function me(request: AuthRequest, response: Response) {
  const user = await prisma.user.findUnique({ where: { id: request.userId } });
  if (!user) return fail(response, 'User not found', 404);
  return ok(response, { user: publicUser(user), emailVerified: user.emailVerified });
}

export { emailSchema, passwordSchema, nameSchema };

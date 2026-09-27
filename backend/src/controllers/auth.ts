import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { setAuthCookie } from '../utils/auth';
import { prisma } from '../lib/prisma';
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

const resetPasswordSchema = z.object({
  email: z.string().trim().min(1).max(254),
  name: usernameSchema,
  newPassword: strongPasswordSchema,
});

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
    return fail(response, 'Invalid username or password', 401);
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

export async function resetPassword(request: Request, response: Response) {
  const parsed = resetPasswordSchema.safeParse(request.body);
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
    return fail(response, issue?.message ?? 'Invalid reset request');
  }

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, name: parsed.data.name },
    select: { id: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    return fail(response, 'Username and email do not match an account', 400);
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, updatedAt: new Date() },
  });
  return ok(response, { message: 'Password updated successfully' });
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

export { emailSchema, passwordSchema, nameSchema };

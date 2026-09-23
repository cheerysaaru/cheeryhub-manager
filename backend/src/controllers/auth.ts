import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { setAuthCookie } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';

const emailSchema = z.string().trim().min(1).max(254);
const passwordSchema = z.string().min(5).max(200);
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

export async function register(request: Request, response: Response) {
  const parsed = credentials.safeParse(request.body);
  if (!parsed.success) {
    return fail(response, 'Name, username, and password of at least 5 characters are required');
  }
  const { email, password, name = 'User', timezone = 'UTC' } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail(response, 'An account with that username already exists', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email, name, timezone, passwordHash,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
  });
  await prisma.userSettings.create({ data: { userId: user.id } });
  setAuthCookie(response, user.id);

  return ok(response, { user: publicUser(user) }, 201);
}

export async function login(request: Request, response: Response) {
  const parsed = credentials.pick({ email: true, password: true }).safeParse(request.body);
  if (!parsed.success) return fail(response, 'Username and password are required');
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return fail(response, 'Invalid username or password', 401);
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

export { emailSchema, passwordSchema, nameSchema };

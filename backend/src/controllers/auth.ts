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

export async function login(request: Request, response: Response) {
  const parsed = credentials.pick({ email: true, password: true }).safeParse(request.body);
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
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
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

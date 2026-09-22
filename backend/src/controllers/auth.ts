import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { setAuthCookie } from '../utils/auth';
import { fail, ok } from '../utils/response';

const credentials = z.object({ name: z.string().trim().min(1).max(100).optional(), email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(10).max(200), timezone: z.string().max(80).optional() });
const publicUser = (user: { id: string; name: string; email: string; timezone: string; createdAt: Date }) => ({ id: user.id, name: user.name, email: user.email, timezone: user.timezone, createdAt: user.createdAt });
export async function register(request: Request, response: Response) {
  const parsed = credentials.safeParse(request.body); if (!parsed.success) return fail(response, 'Name, valid email, and password of at least 10 characters are required');
  const { email, password, name = 'Productive human', timezone = 'UTC' } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) return fail(response, 'An account with that email already exists', 409);
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, name, timezone, passwordHash } });
  await prisma.userSettings.create({ data: { userId: user.id } });
  setAuthCookie(response, user.id); return ok(response, { user: publicUser(user) }, 201);
}
export async function login(request: Request, response: Response) {
  const parsed = credentials.pick({ email: true, password: true }).safeParse(request.body); if (!parsed.success) return fail(response, 'Valid email and password are required');
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return fail(response, 'Invalid email or password', 401);
  setAuthCookie(response, user.id); return ok(response, { user: publicUser(user) });
}
export function logout(_request: Request, response: Response) { response.clearCookie('auth_token'); return ok(response, { loggedOut: true }); }
export async function me(request: Request & { userId?: string }, response: Response) { const user = await prisma.user.findUnique({ where: { id: request.userId } }); return user ? ok(response, { user: publicUser(user) }) : fail(response, 'User not found', 404); }
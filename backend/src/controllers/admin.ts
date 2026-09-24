import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  timezone: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const nameSchema = z.string().trim().min(1).max(100);
const emailSchema = z.string().trim().min(1).max(254);
const passwordSchema = z.string().min(5).max(200);
const roleSchema = z.enum(['ADMIN', 'USER']);
const statusSchema = z.enum(['ACTIVE', 'DISABLED']);

const createSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema.optional(),
  timezone: z.string().max(80).optional(),
});

const updateSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: roleSchema.optional(),
    status: statusSchema.optional(),
    timezone: z.string().max(80).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'No fields to update',
  });

const passwordSchemaBody = z.object({ password: passwordSchema });

export async function listUsers(_request: AuthRequest, response: Response) {
  const users = await prisma.user.findMany({
    select: safeUserSelect,
    orderBy: { createdAt: 'desc' },
  });
  return ok(response, { users });
}

export async function createUser(request: AuthRequest, response: Response) {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid user data');

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) return fail(response, 'Email already in use', 409);

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role ?? 'USER',
      status: 'ACTIVE',
      ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
      settings: { create: {} },
    },
    select: safeUserSelect,
  });
  return ok(response, { user }, 201);
}

export async function updateUser(request: AuthRequest, response: Response) {
  const id = String(request.params.id);
  const parsed = updateSchema.safeParse(request.body);
  if (!parsed.success) return fail(response, 'Invalid user data');

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) return fail(response, 'User not found', 404);

  if (id === request.userId) {
    if (parsed.data.role !== undefined && parsed.data.role !== 'ADMIN') {
      return fail(response, 'You cannot change your own admin role', 400);
    }
    if (parsed.data.status !== undefined && parsed.data.status !== 'ACTIVE') {
      return fail(response, 'You cannot disable your own account', 400);
    }
  }

  if (parsed.data.email) {
    const emailTaken = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (emailTaken && emailTaken.id !== id)
      return fail(response, 'Email already in use', 409);
  }

  const { role, status, name, email, timezone } = parsed.data;
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
    },
    select: safeUserSelect,
  });
  return ok(response, { user });
}

export async function resetPassword(request: AuthRequest, response: Response) {
  const id = String(request.params.id);
  const parsed = passwordSchemaBody.safeParse(request.body);
  if (!parsed.success)
    return fail(response, 'Password must be at least 5 characters');

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) return fail(response, 'User not found', 404);

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return ok(response, { reset: true });
}

export async function setUserStatus(
  request: AuthRequest,
  response: Response,
  status: 'ACTIVE' | 'DISABLED'
) {
  const id = String(request.params.id);
  if (id === request.userId)
    return fail(response, 'You cannot change your own account status', 400);

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) return fail(response, 'User not found', 404);

  const user = await prisma.user.update({
    where: { id },
    data: { status },
    select: safeUserSelect,
  });
  return ok(response, { user });
}

export async function disableUser(request: AuthRequest, response: Response) {
  return setUserStatus(request, response, 'DISABLED');
}

export async function enableUser(request: AuthRequest, response: Response) {
  return setUserStatus(request, response, 'ACTIVE');
}

export async function deleteUser(request: AuthRequest, response: Response) {
  const id = String(request.params.id);
  if (id === request.userId)
    return fail(response, 'You cannot delete your own account', 400);

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) return fail(response, 'User not found', 404);

  if (target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
    if (adminCount <= 1)
      return fail(response, 'Cannot delete the last active admin', 400);
  }

  await prisma.user.delete({ where: { id } });
  return ok(response, { deleted: true });
}

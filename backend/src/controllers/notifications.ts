import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';
import { emitToUser } from '../lib/socket';
import { generateNotifications } from '../lib/notifications';

export async function listNotifications(request: AuthRequest, response: Response) {
  // Refresh standing reminders first so the bell is never stale.
  await generateNotifications(request.userId!).catch(() => undefined);
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: request.userId, readAt: null } }),
  ]);
  return ok(response, { items, unreadCount });
}

export async function markNotificationRead(request: AuthRequest, response: Response) {
  const id = String(request.params.id);
  const existing = await prisma.notification.findFirst({
    where: { id, userId: request.userId },
  });
  if (!existing) return fail(response, 'Notification not found', 404);
  const updated = existing.readAt
    ? existing
    : await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  emitToUser(request.userId!, 'notification:read', { id });
  return ok(response, updated);
}

export async function markAllNotificationsRead(request: AuthRequest, response: Response) {
  const result = await prisma.notification.updateMany({
    where: { userId: request.userId, readAt: null },
    data: { readAt: new Date() },
  });
  emitToUser(request.userId!, 'notification:read-all', {});
  return ok(response, { updated: result.count });
}

const generateSchema = z.object({}).optional();

export async function regenerateNotifications(request: AuthRequest, response: Response) {
  if (!generateSchema.safeParse(request.body ?? {}).success) {
    return fail(response, 'Invalid request data');
  }
  await generateNotifications(request.userId!);
  const unreadCount = await prisma.notification.count({
    where: { userId: request.userId, readAt: null },
  });
  return ok(response, { unreadCount });
}

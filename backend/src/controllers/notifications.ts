import { z } from 'zod';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { fail, ok } from '../utils/response';
import { emitToUser } from '../lib/socket';
import { generateNotifications, refreshNotificationsInBackground } from '../lib/notifications';

export async function listNotifications(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  // Refresh standing reminders in the background so the bell is never stale
  // for long, while the current state streams back immediately.
  refreshNotificationsInBackground(
    request.userId!,
    request as AuthRequest & { requestId?: string }
  );
  try {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: request.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId: request.userId, readAt: null },
      }),
    ]);
    return ok(response, { items, unreadCount });
  } catch (error) {
    return next(error);
  }
}

export async function markNotificationRead(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  try {
    const id = String(request.params.id);
    const existing = await prisma.notification.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) return fail(response, 'Notification not found', 404);
    const updated = existing.readAt
      ? existing
      : await prisma.notification.update({
          where: { id },
          data: { readAt: new Date() },
        });
    emitToUser(request.userId!, 'notification:read', { id });
    return ok(response, updated);
  } catch (error) {
    return next(error);
  }
}

export async function markAllNotificationsRead(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: request.userId, readAt: null },
      data: { readAt: new Date() },
    });
    emitToUser(request.userId!, 'notification:read-all', {});
    return ok(response, { updated: result.count });
  } catch (error) {
    return next(error);
  }
}

const generateSchema = z.object({}).optional();

export async function regenerateNotifications(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  if (!generateSchema.safeParse(request.body ?? {}).success) {
    return fail(response, 'Invalid request data');
  }
  try {
    await generateNotifications(request.userId!);
    const unreadCount = await prisma.notification.count({
      where: { userId: request.userId, readAt: null },
    });
    return ok(response, { unreadCount });
  } catch (error) {
    return next(error);
  }
}

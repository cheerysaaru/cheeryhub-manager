import type { AppRequest } from '../types/index';
import { Database } from '../db/client';

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const db = new Database(req.env?.DB!);
  const notifications = await db.all<Notification>(
    'SELECT * FROM "Notification" WHERE userId = ?1 ORDER BY createdAt DESC LIMIT 50',
    [req.user.id]
  );

  return new Response(JSON.stringify({ data: notifications }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function markNotificationAsRead(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { id } = req.params as any;

  const db = new Database(req.env?.DB!);
  const notification = await db.first<Notification>(
    'SELECT * FROM "Notification" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id]
  );

  if (!notification) {
    return new Response(JSON.stringify({
      error: 'Notification not found',
      code: 'NOT_FOUND',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  await db.run(
    'UPDATE "Notification" SET "read" = true WHERE id = ?1',
    [id]
  );

  const updated = await db.first<Notification>(
    'SELECT * FROM "Notification" WHERE id = ?1',
    [id]
  );

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function deleteNotification(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { id } = req.params as any;

  const db = new Database(req.env?.DB!);
  const notification = await db.first<Notification>(
    'SELECT * FROM "Notification" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id]
  );

  if (!notification) {
    return new Response(JSON.stringify({
      error: 'Notification not found',
      code: 'NOT_FOUND',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  await db.run('DELETE FROM "Notification" WHERE id = ?1', [id]);

  return new Response(JSON.stringify({ data: { message: 'Notification deleted' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}


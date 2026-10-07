import type { AppRequest } from '../types/index';
import { Database } from '../db/client';

interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetDate?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function listGoals(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const db = new Database(req.env?.DB!);
  const goals = await db.all<Goal>(
    'SELECT * FROM "Goal" WHERE userId = ?1 ORDER BY createdAt DESC',
    [req.user.id]
  );

  return new Response(JSON.stringify({ data: goals }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function createGoal(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { title, description, targetDate } = req.body as any;

  if (!title) {
    return new Response(JSON.stringify({
      error: 'Missing required field: title',
      code: 'VALIDATION_ERROR',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const db = new Database(req.env?.DB!);
  const goalId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "Goal" (id, userId, title, description, targetDate, status, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [goalId, req.user.id, title, description, targetDate, 'active', now, now]
  );

  const goal = await db.first<Goal>(
    'SELECT * FROM "Goal" WHERE id = ?1',
    [goalId]
  );

  return new Response(JSON.stringify({ data: goal }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function updateGoal(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { id } = req.params as any;
  const updates = req.body as any;

  const db = new Database(req.env?.DB!);
  const goal = await db.first<Goal>(
    'SELECT * FROM "Goal" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id]
  );

  if (!goal) {
    return new Response(JSON.stringify({
      error: 'Goal not found',
      code: 'NOT_FOUND',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const sets = Object.keys(updates)
    .map((k, i) => `"${k}" = ?${i + 1}`)
    .join(', ');

  if (sets) {
    const values = Object.values(updates);
    values.push(new Date().toISOString());
    values.push(id);

    await db.run(
      `UPDATE "Goal" SET ${sets}, "updatedAt" = ?${values.length - 1} WHERE id = ?${values.length}`,
      values
    );
  }

  const updated = await db.first<Goal>(
    'SELECT * FROM "Goal" WHERE id = ?1',
    [id]
  );

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function deleteGoal(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { id } = req.params as any;

  const db = new Database(req.env?.DB!);
  const goal = await db.first<Goal>(
    'SELECT * FROM "Goal" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id]
  );

  if (!goal) {
    return new Response(JSON.stringify({
      error: 'Goal not found',
      code: 'NOT_FOUND',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  await db.run('DELETE FROM "Goal" WHERE id = ?1', [id]);

  return new Response(JSON.stringify({ data: { message: 'Goal deleted' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}


import type { AppRequest } from '../types/index';
import { Database } from '../db/client';

interface StreakData {
  id: string;
  title: string;
  current: number;
  longest: number;
}

export async function getStreaks(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const db = new Database(req.env?.DB!);
    const habits = await db.all<any>(
      'SELECT id, name as title, createdAt FROM "Habit" WHERE userId = ?1 AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 10',
      [req.user.id]
    );

    const streaks: StreakData[] = habits.map((habit: any) => ({
      id: habit.id,
      title: habit.title,
      current: 0,
      longest: 0,
    }));

    return new Response(JSON.stringify({ data: streaks }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error getting streaks:', error);
    return new Response(JSON.stringify({ error: 'Failed to get streaks', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function checkIn(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { id } = req.params as any;
  const { date } = req.body as any;

  const db = new Database(req.env?.DB!);
  
  try {
    const habit = await db.first<any>(
      'SELECT * FROM "Habit" WHERE id = ?1 AND userId = ?2',
      [id, req.user.id]
    );

    if (!habit) {
      return new Response(JSON.stringify({
        error: 'Habit not found',
        code: 'NOT_FOUND',
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const completionDate = date || new Date().toISOString().split('T')[0];
    const completionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const existing = await db.first(
      'SELECT * FROM "HabitCompletion" WHERE habitId = ?1 AND date = ?2',
      [id, completionDate]
    );

    if (!existing) {
      await db.run(
        `INSERT INTO "HabitCompletion" (id, habitId, date, status, createdAt)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
        [completionId, id, completionDate, 'completed', now]
      );
    }

    return new Response(JSON.stringify({ data: { message: 'Check-in recorded' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error recording check-in:', error);
    return new Response(JSON.stringify({ error: 'Failed to record check-in', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


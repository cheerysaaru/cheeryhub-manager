import type { AppRequest } from '../types/index';
import { Database } from '../db/client';

export async function getSettings(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const db = new Database(req.env?.DB!);
    const user = await db.getUserById(req.user.id);

    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'User not found',
          code: 'NOT_FOUND',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const settings = {
      userId: user.id,
      timezone: user.timezone || 'UTC',
      theme: user.theme || 'light',
      email: user.email,
      notifications: {
        email: user.emailNotifications !== false,
        push: user.pushNotifications !== false,
      },
    };

    return new Response(JSON.stringify({ data: settings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get settings',
      code: 'INTERNAL_ERROR',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function updateSettings(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { timezone, theme, emailNotifications, pushNotifications } = req.body as any;

  try {
    const updates = [];
    const values = [];

    if (timezone !== undefined) {
      updates.push('timezone = ?1');
      values.push(timezone);
    }
    if (theme !== undefined) {
      updates.push('theme = ?2');
      values.push(theme);
    }
    if (emailNotifications !== undefined) {
      updates.push('emailNotifications = ?3');
      values.push(emailNotifications ? 1 : 0);
    }
    if (pushNotifications !== undefined) {
      updates.push('pushNotifications = ?4');
      values.push(pushNotifications ? 1 : 0);
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No fields to update',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = new Database(req.env?.DB!);
    const updateIdx = values.length + 1;
    await db.run(
      `UPDATE User SET ${updates.join(', ')} WHERE id = ?${updateIdx}`,
      [...values, req.user.id]
    );

    const updated = await db.getUserById(req.user.id);
    
    if (!updated) {
      return new Response(JSON.stringify({
        error: 'Failed to update user',
        code: 'UPDATE_FAILED',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const settings = {
      userId: updated.id,
      timezone: updated.timezone || 'UTC',
      theme: updated.theme || 'light',
      email: updated.email,
      notifications: {
        email: updated.emailNotifications !== false,
        push: updated.pushNotifications !== false,
      },
    };

    return new Response(JSON.stringify({ data: settings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return new Response(JSON.stringify({
      error: 'Failed to update settings',
      code: 'INTERNAL_ERROR',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}



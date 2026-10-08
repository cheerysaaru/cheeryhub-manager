import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface CreateReminderPayload {
  title: string;
  description?: string;
  reminderDate: string;
  reminderTime?: string;
  repeatType?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  enabled?: boolean;
}

interface ReminderOwnerRow {
  userId: string;
}

interface UpdateReminderPayload {
  title?: string;
  description?: string;
  reminderDate?: string;
  reminderTime?: string;
  repeatType?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  enabled?: boolean;
}

export async function listReminders(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const db = new Database(req.env.DB);
    const reminders = await db.all(
      `SELECT id, userId, title, description, reminderDate, reminderTime, repeatType, enabled, createdAt, updatedAt
       FROM Reminder WHERE userId = ?1
       ORDER BY reminderDate ASC`,
      [req.user.id],
    );

    return new Response(JSON.stringify({ data: reminders }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error listing reminders:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to list reminders",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function createReminder(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    title,
    description,
    reminderDate,
    reminderTime,
    repeatType,
    enabled,
  } = req.body as CreateReminderPayload;

  if (!title || !reminderDate) {
    return new Response(
      JSON.stringify({
        error: "title and reminderDate are required",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const db = new Database(req.env.DB);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO Reminder (id, userId, title, description, reminderDate, reminderTime, repeatType, enabled, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [
        id,
        req.user.id,
        title,
        description || null,
        reminderDate,
        reminderTime || null,
        repeatType || "NONE",
        enabled !== false,
        now,
        now,
      ],
    );

    const reminder = await db.first(
      "SELECT id, userId, title, description, reminderDate, reminderTime, repeatType, enabled, createdAt, updatedAt FROM Reminder WHERE id = ?1",
      [id],
    );

    return new Response(JSON.stringify({ data: reminder }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating reminder:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create reminder",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function updateReminder(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const id = req.params?.id;
  const {
    title,
    description,
    reminderDate,
    reminderTime,
    repeatType,
    enabled,
  } = req.body as UpdateReminderPayload;

  try {
    if (!id) {
      return new Response(
        JSON.stringify({
          error: "Reminder ID is required",
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const db = new Database(req.env.DB);
    const existing = await db.first<ReminderOwnerRow>(
      "SELECT userId FROM Reminder WHERE id = ?1",
      [id],
    );

    if (!existing) {
      return new Response(
        JSON.stringify({
          error: "Reminder not found",
          code: "NOT_FOUND",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (existing.userId !== req.user.id) {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push("title = ?1");
      values.push(title);
    }
    if (description !== undefined) {
      updates.push("description = ?2");
      values.push(description);
    }
    if (reminderDate !== undefined) {
      updates.push("reminderDate = ?3");
      values.push(reminderDate);
    }
    if (reminderTime !== undefined) {
      updates.push("reminderTime = ?4");
      values.push(reminderTime);
    }
    if (reminderTime !== undefined) {
      updates.push("reminderTime = ?4");
      values.push(reminderTime);
    }
    if (repeatType !== undefined) {
      updates.push("repeatType = ?5");
      values.push(repeatType);
    }
    if (enabled !== undefined) {
      updates.push("enabled = ?6");
      values.push(enabled);
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No fields to update",
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const updateIdx = values.length + 1;
    updates.push(`updatedAt = ?${updateIdx}`);
    values.push(new Date().toISOString());

    await db.run(
      `UPDATE Reminder SET ${updates.join(", ")} WHERE id = ?${updateIdx + 1}`,
      [...values, id],
    );

    const updated = await db.first(
      "SELECT id, userId, title, description, reminderDate, reminderTime, repeatType, enabled, createdAt, updatedAt FROM Reminder WHERE id = ?1",
      [id],
    );

    return new Response(JSON.stringify({ data: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating reminder:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to update reminder",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function deleteReminder(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const id = req.params?.id;

  try {
    if (!id) {
      return new Response(
        JSON.stringify({
          error: "Reminder ID is required",
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const db = new Database(req.env.DB);
    const existing = await db.first<ReminderOwnerRow>(
      "SELECT userId FROM Reminder WHERE id = ?1",
      [id],
    );

    if (!existing) {
      return new Response(
        JSON.stringify({
          error: "Reminder not found",
          code: "NOT_FOUND",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (existing.userId !== req.user.id) {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    await db.run("DELETE FROM Reminder WHERE id = ?1", [id]);

    return new Response(JSON.stringify({ data: { id } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to delete reminder",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

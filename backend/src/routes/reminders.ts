import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface CreateReminderPayload {
  title: string;
  description?: string;
  scheduledFor: string;
}

interface ReminderOwnerRow {
  userId: string;
}

interface UpdateReminderPayload {
  title?: string;
  description?: string;
  scheduledFor?: string;
  status?: string;
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
    const db = new Database(req.env.DB!);
    const reminders = await db.all(
      `SELECT id, userId, title, description, scheduledFor, status, createdAt, updatedAt
       FROM Reminder WHERE userId = ?1 AND deletedAt IS NULL
       ORDER BY scheduledFor ASC`,
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

  const { title, description, scheduledFor } =
    req.body as CreateReminderPayload;

  if (!title || !scheduledFor) {
    return new Response(
      JSON.stringify({
        error: "title and scheduledFor are required",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const db = new Database(req.env.DB!);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO Reminder (id, userId, title, description, scheduledFor, status, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [
        id,
        req.user.id,
        title,
        description || null,
        scheduledFor,
        "pending",
        now,
        now,
      ],
    );

    const reminder = await db.first(
      "SELECT id, userId, title, description, scheduledFor, status, createdAt, updatedAt FROM Reminder WHERE id = ?1",
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
  const { title, description, scheduledFor, status } =
    req.body as UpdateReminderPayload;

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

    const db = new Database(req.env.DB!);
    const existing = await db.first<ReminderOwnerRow>(
      "SELECT userId FROM Reminder WHERE id = ?1 AND deletedAt IS NULL",
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
    if (scheduledFor !== undefined) {
      updates.push("scheduledFor = ?3");
      values.push(scheduledFor);
    }
    if (status !== undefined) {
      updates.push("status = ?4");
      values.push(status);
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
      "SELECT id, userId, title, description, scheduledFor, status, createdAt, updatedAt FROM Reminder WHERE id = ?1",
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

    const db = new Database(req.env.DB!);
    const existing = await db.first<ReminderOwnerRow>(
      "SELECT userId FROM Reminder WHERE id = ?1 AND deletedAt IS NULL",
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

    await db.run("UPDATE Reminder SET deletedAt = ?1 WHERE id = ?2", [
      new Date().toISOString(),
      id,
    ]);

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

import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface JournalEntry {
  id: string;
  userId: string;
  date: string;
  accomplishments?: string;
  lessons?: string;
  procrastination?: string;
  improvements?: string;
  gratitude?: string;
  passionScore?: number;
  createdAt: string;
  updatedAt: string;
}

interface JournalPayload {
  date: string;
  accomplishments?: string;
  lessons?: string;
  procrastination?: string;
  improvements?: string;
  gratitude?: string;
  passionScore?: number;
}

export async function listJournalEntries(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const entries = await db.all<JournalEntry>(
    'SELECT * FROM "JournalEntry" WHERE userId = ?1 ORDER BY date DESC',
    [req.user.id],
  );

  return new Response(JSON.stringify({ data: entries }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getJournalEntry(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);
  const entry = await db.first<JournalEntry>(
    'SELECT * FROM "JournalEntry" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!entry) {
    return new Response(
      JSON.stringify({ error: "Journal entry not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ data: entry }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createJournalEntry(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    date,
    accomplishments,
    lessons,
    procrastination,
    improvements,
    gratitude,
    passionScore,
  } = req.body as JournalPayload;

  if (!date) {
    return new Response(
      JSON.stringify({
        error: "Missing required field: date",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const entryId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO "JournalEntry" (id, userId, date, accomplishments, lessons, procrastination, improvements, gratitude, passionScore, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    [
      entryId,
      req.user.id,
      date,
      accomplishments ?? null,
      lessons ?? null,
      procrastination ?? null,
      improvements ?? null,
      gratitude ?? null,
      passionScore ?? null,
      now,
      now,
    ],
  );

  const entry = await db.first<JournalEntry>(
    'SELECT * FROM "JournalEntry" WHERE id = ?1',
    [entryId],
  );

  return new Response(JSON.stringify({ data: entry }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateJournalEntry(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const {
    date,
    accomplishments,
    lessons,
    procrastination,
    improvements,
    gratitude,
    passionScore,
  } = req.body as JournalPayload;

  const db = new Database(req.env.DB);
  const entry = await db.first<JournalEntry>(
    'SELECT * FROM "JournalEntry" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!entry) {
    return new Response(
      JSON.stringify({ error: "Journal entry not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const updates = [];
  const values = [];
  let updateIdx = 1;

  if (date !== undefined) {
    updates.push(`date = ?${updateIdx}`);
    values.push(date);
    updateIdx++;
  }
  if (accomplishments !== undefined) {
    updates.push(`accomplishments = ?${updateIdx}`);
    values.push(accomplishments);
    updateIdx++;
  }
  if (lessons !== undefined) {
    updates.push(`lessons = ?${updateIdx}`);
    values.push(lessons);
    updateIdx++;
  }
  if (procrastination !== undefined) {
    updates.push(`procrastination = ?${updateIdx}`);
    values.push(procrastination);
    updateIdx++;
  }
  if (improvements !== undefined) {
    updates.push(`improvements = ?${updateIdx}`);
    values.push(improvements);
    updateIdx++;
  }
  if (gratitude !== undefined) {
    updates.push(`gratitude = ?${updateIdx}`);
    values.push(gratitude);
    updateIdx++;
  }
  if (passionScore !== undefined) {
    updates.push(`passionScore = ?${updateIdx}`);
    values.push(passionScore);
    updateIdx++;
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

  const now = new Date().toISOString();
  updates.push(`updatedAt = ?${updateIdx}`);
  values.push(now);
  updateIdx++;
  values.push(id);

  await db.run(
    `UPDATE "JournalEntry" SET ${updates.join(", ")} WHERE id = ?${updateIdx}`,
    values,
  );

  const updated = await db.first<JournalEntry>(
    'SELECT * FROM "JournalEntry" WHERE id = ?1',
    [id],
  );

  return new Response(JSON.stringify({ data: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteJournalEntry(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const db = new Database(req.env.DB);
  const entry = await db.first<JournalEntry>(
    'SELECT * FROM "JournalEntry" WHERE id = ?1 AND userId = ?2',
    [id, req.user.id],
  );

  if (!entry) {
    return new Response(
      JSON.stringify({ error: "Journal entry not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  await db.run('DELETE FROM "JournalEntry" WHERE id = ?1', [id]);

  return new Response(
    JSON.stringify({ data: { message: "Journal entry deleted" } }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

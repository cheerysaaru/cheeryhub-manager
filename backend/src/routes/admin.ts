import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  xp: number;
  taskCount: number;
  habitCount: number;
}

export async function listUsers(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Check admin role
  const db = new Database(req.env.DB);
  const adminUser = await db.getUserById(req.user.id);
  if (!adminUser || adminUser.role !== "ADMIN") {
    return new Response(
      JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const users = await db.all<UserSummary>(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.createdAt, u.xp,
            (SELECT COUNT(*) FROM "Task" WHERE userId = u.id) as taskCount,
            (SELECT COUNT(*) FROM "Habit" WHERE userId = u.id AND deletedAt IS NULL) as habitCount
     FROM "User" u
     ORDER BY u.createdAt DESC`,
  );

  return new Response(JSON.stringify({ data: users }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getUserDetails(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const adminUser = await db.getUserById(req.user.id);
  if (!adminUser || adminUser.role !== "ADMIN") {
    return new Response(
      JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const user = await db.getUserById(id);

  if (!user) {
    return new Response(
      JSON.stringify({ error: "User not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Remove password hash
  const { passwordHash, password_hash, ...safeUser } = user;

  return new Response(JSON.stringify({ data: safeUser }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateUserRole(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const adminUser = await db.getUserById(req.user.id);
  if (!adminUser || adminUser.role !== "ADMIN") {
    return new Response(
      JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = req.params;
  const { role, status } = req.body as { role?: string; status?: string };

  const user = await db.getUserById(id);
  if (!user) {
    return new Response(
      JSON.stringify({ error: "User not found", code: "NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const updates = [];
  const values = [];
  let updateIdx = 1;

  if (role) {
    updates.push(`role = ?${updateIdx}`);
    values.push(role);
    updateIdx++;
  }
  if (status) {
    updates.push(`status = ?${updateIdx}`);
    values.push(status);
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

  values.push(new Date().toISOString());
  values.push(id);

  await db.run(
    `UPDATE "User" SET ${updates.join(", ")}, updatedAt = ?${updateIdx} WHERE id = ?${updateIdx + 1}`,
    values,
  );

  const updated = await db.getUserById(id);
  const {
    passwordHash: _ph,
    password_hash: _ph2,
    ...safeUpdated
  } = updated || {};

  return new Response(JSON.stringify({ data: safeUpdated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getSystemStats(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const adminUser = await db.getUserById(req.user.id);
  if (!adminUser || adminUser.role !== "ADMIN") {
    return new Response(
      JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const stats = await db.first<{
    userCount: number;
    taskCount: number;
    habitCount: number;
    goalCount: number;
    totalXp: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM "User") as userCount,
       (SELECT COUNT(*) FROM "Task" WHERE deletedAt IS NULL) as taskCount,
       (SELECT COUNT(*) FROM "Habit" WHERE deletedAt IS NULL) as habitCount,
       (SELECT COUNT(*) FROM "Goal" WHERE deletedAt IS NULL) as goalCount,
       (SELECT SUM(amount) FROM "XPTransaction" WHERE type = "earn") as totalXp`,
  );

  return new Response(JSON.stringify({ data: stats }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

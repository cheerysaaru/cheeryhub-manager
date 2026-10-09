import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { errorResponse, ok } from "../utils/response";
import { hashPassword } from "../utils/password";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
  timezone: string;
  taskCount: number;
  habitCount: number;
  goalCount: number;
  skillCount: number;
  transactionCount: number;
  journalCount: number;
}

const USER_ROLES = new Set(["USER", "ADMIN"]);
const USER_STATUSES = new Set(["ACTIVE", "DISABLED"]);

/** Enforce admin on every admin route using the verified session token. */
export function requireAdmin(req: AppRequest): Response | null {
  if (!req.user) {
    return errorResponse("Unauthorized", 401, "AUTH_REQUIRED");
  }
  if (req.user.role !== "ADMIN") {
    return errorResponse("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}

// Per-user cascade order (children before parent) - mirrors the bulk purge.
// GoalMilestone and BrandMilestone are intentionally excluded: they have no
// userId and are removed automatically when their parent (Goal/BrandProject) is
// deleted, via ON DELETE CASCADE.
const USER_CHILD_TABLES = [
  "HabitCompletion",
  "HabitDayEvent",
  "TaskCheckIn",
  "FocusSession",
  "JournalEntry",
  "Reminder",
  "XPTransaction",
  "DailyStats",
  "PasswordReset",
  "Notification",
  "Achievement",
  "Transaction",
  "Task",
  "Habit",
  "Goal",
  "Skill",
  "BrandProject",
  "UserSettings",
];

export async function listUsers(req: AppRequest): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const db = new Database(req.env.DB);
  const users = await db.all<UserRow>(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.createdAt, u.lastLoginAt,
            u.timezone,
            (SELECT COUNT(*) FROM "Task" WHERE userId = u.id AND deletedAt IS NULL) as taskCount,
            (SELECT COUNT(*) FROM "Habit" WHERE userId = u.id AND deletedAt IS NULL) as habitCount,
            (SELECT COUNT(*) FROM "Goal" WHERE userId = u.id) as goalCount,
            (SELECT COUNT(*) FROM "Skill" WHERE userId = u.id) as skillCount,
            (SELECT COUNT(*) FROM "Transaction" WHERE userId = u.id) as transactionCount,
            (SELECT COUNT(*) FROM "JournalEntry" WHERE userId = u.id) as journalCount
     FROM "User" u
     ORDER BY u.createdAt DESC`,
  );
  return ok({ users });
}

export async function getUserDetails(req: AppRequest): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const db = new Database(req.env.DB);
  const { id } = req.params;
  const user = await db.getUserById(id);
  if (!user) {
    return errorResponse("User not found", 404, "NOT_FOUND");
  }
  const { passwordHash: _ph, password_hash: _ph2, ...safeUser } = user;
  return ok(safeUser);
}

interface UpdatePayload {
  name?: string;
  email?: string;
  role?: string;
  status?: string;
}

export async function updateUserRole(req: AppRequest): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const db = new Database(req.env.DB);
  const { id } = req.params;
  const { name, email, role, status } = (req.body ?? {}) as UpdatePayload;

  if (role !== undefined && !USER_ROLES.has(role)) {
    return errorResponse(
      'role must be "USER" or "ADMIN"',
      400,
      "VALIDATION_ERROR",
    );
  }
  if (status !== undefined && !USER_STATUSES.has(status)) {
    return errorResponse(
      'status must be "ACTIVE" or "DISABLED"',
      400,
      "VALIDATION_ERROR",
    );
  }

  const user = await db.getUserById(id);
  if (!user) {
    return errorResponse("User not found", 404, "NOT_FOUND");
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (name !== undefined) {
    const trimmed = String(name).trim().slice(0, 100);
    if (!trimmed)
      return errorResponse("name cannot be empty", 400, "VALIDATION_ERROR");
    updates.push(`name = ?${idx}`);
    values.push(trimmed);
    idx += 1;
  }
  if (email !== undefined) {
    const normalizedEmail = String(email).trim().toLowerCase().slice(0, 254);
    if (!normalizedEmail.includes("@")) {
      return errorResponse(
        "a valid email is required",
        400,
        "VALIDATION_ERROR",
      );
    }
    const clash = await db.getUserByEmail(normalizedEmail);
    if (clash && clash.id !== id) {
      return errorResponse("That email is already in use", 409, "CONFLICT");
    }
    updates.push(`email = ?${idx}`);
    values.push(normalizedEmail);
    idx += 1;
  }
  if (role !== undefined) {
    updates.push(`role = ?${idx}`);
    values.push(role);
    idx += 1;
  }
  if (status !== undefined) {
    updates.push(`status = ?${idx}`);
    values.push(status);
    idx += 1;
  }
  if (updates.length === 0) {
    return errorResponse("No fields to update", 400, "VALIDATION_ERROR");
  }
  values.push(new Date().toISOString());
  values.push(id);
  await db.run(
    `UPDATE "User" SET ${updates.join(", ")}, updatedAt = ?${idx} WHERE id = ?${idx + 1}`,
    values,
  );
  const updated = await db.getUserById(id);
  const {
    passwordHash: _ph,
    password_hash: _ph2,
    ...safeUpdated
  } = updated ?? {};
  return ok(safeUpdated);
}

export async function deleteUser(req: AppRequest): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const db = new Database(req.env.DB);
  const { id } = req.params;
  const user = await db.getUserById(id);
  if (!user) {
    return errorResponse("User not found", 404, "NOT_FOUND");
  }

  // Delete this user's children first, then the user row.
  for (const table of USER_CHILD_TABLES) {
    await db.run(`DELETE FROM "${table}" WHERE userId = ?1`, [id]);
  }
  await db.run(`DELETE FROM "User" WHERE id = ?1`, [id]);
  return ok({ id, deleted: true });
}

export async function getSystemStats(req: AppRequest): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const db = new Database(req.env.DB);
  const stats = await db.first<{
    userCount: number;
    taskCount: number;
    habitCount: number;
    goalCount: number;
    totalXp: number | null;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM "User") as userCount,
       (SELECT COUNT(*) FROM "Task" WHERE deletedAt IS NULL) as taskCount,
       (SELECT COUNT(*) FROM "Habit" WHERE deletedAt IS NULL) as habitCount,
       (SELECT COUNT(*) FROM "Goal") as goalCount,
       (SELECT SUM(amount) FROM "XPTransaction") as totalXp`,
  );
  return ok({
    userCount: stats?.userCount ?? 0,
    taskCount: stats?.taskCount ?? 0,
    habitCount: stats?.habitCount ?? 0,
    goalCount: stats?.goalCount ?? 0,
    totalXp: stats?.totalXp ?? 0,
  });
}
interface CreatePayload {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

function validateCredentials(name: unknown, email: unknown, password: unknown) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    return "a valid name (max 100) is required";
  }
  if (typeof email !== "string" || !email.includes("@") || email.length > 254) {
    return "a valid email is required";
  }
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 200
  ) {
    return "password must be 8-200 characters";
  }
  return null;
}

export async function createUser(req: AppRequest): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const db = new Database(req.env.DB);
  const { name, email, password, role } = (req.body ?? {}) as CreatePayload;
  const invalid = validateCredentials(name, email, password);
  if (invalid) return errorResponse(invalid, 400, "VALIDATION_ERROR");
  if (role !== undefined && !USER_ROLES.has(role)) {
    return errorResponse(
      'role must be "USER" or "ADMIN"',
      400,
      "VALIDATION_ERROR",
    );
  }

  const normalizedEmail = (email as string).trim().toLowerCase();
  if (await db.getUserByEmail(normalizedEmail)) {
    return errorResponse("That email is already in use", 409, "CONFLICT");
  }
  const created = await db.createUser({
    name: (name as string).trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password as string),
    role: role ?? "USER",
    timezone: "UTC",
  });
  const { passwordHash: _ph, password_hash: _ph2, ...safe } = created;
  return ok(safe, 201);
}

interface ResetPayload {
  password?: string;
}

export async function resetUserPassword(req: AppRequest): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const db = new Database(req.env.DB);
  const { id } = req.params;
  const { password } = (req.body ?? {}) as ResetPayload;
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 200
  ) {
    return errorResponse(
      "password must be 8-200 characters",
      400,
      "VALIDATION_ERROR",
    );
  }
  const user = await db.getUserById(id);
  if (!user) return errorResponse("User not found", 404, "NOT_FOUND");
  await db.run(
    `UPDATE "User" SET passwordHash = ?1, updatedAt = ?2 WHERE id = ?3`,
    [await hashPassword(password), new Date().toISOString(), id],
  );
  return ok({ id, reset: true });
}

export async function setUserStatus(
  req: AppRequest,
  status: "ACTIVE" | "DISABLED",
): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const db = new Database(req.env.DB);
  const { id } = req.params;
  const user = await db.getUserById(id);
  if (!user) return errorResponse("User not found", 404, "NOT_FOUND");
  await db.run(`UPDATE "User" SET status = ?1, updatedAt = ?2 WHERE id = ?3`, [
    status,
    new Date().toISOString(),
    id,
  ]);
  return ok({ id, status });
}

export async function disableUser(req: AppRequest): Promise<Response> {
  return setUserStatus(req, "DISABLED");
}

export async function enableUser(req: AppRequest): Promise<Response> {
  return setUserStatus(req, "ACTIVE");
}

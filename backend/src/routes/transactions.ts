import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { ok, fail, errorResponse } from "../utils/response";

// The Finance tab works with the money `Transaction` table (income/expense),
// NOT the gamification XPTransaction table. This controller is fully scoped to
// the verified session user and validates every input.
interface Transaction {
  id: string;
  userId: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  amount: number;
  description?: string | null;
  source?: string | null;
  date: string;
  isRecurring: boolean;
  recurrencePattern?: string | null;
  createdAt: string;
  updatedAt: string;
}

const TRANSACTION_TYPES = new Set(["INCOME", "EXPENSE"]);
const MAX_CATEGORY = 40;
const MAX_DESCRIPTION = 500;
const MAX_SOURCE = 60;

function unauthorized() {
  return errorResponse("Unauthorized", 401, "AUTH_REQUIRED");
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.slice(0, max);
}

export async function listTransactions(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  try {
    const db = new Database(req.env.DB);
    const rows = await db.all<Transaction>(
      `SELECT id, userId, type, category, amount, description, source, date,
              isRecurring, recurrencePattern, createdAt, updatedAt
       FROM "Transaction" WHERE userId = ?1 ORDER BY date DESC, createdAt DESC LIMIT 500`,
      [req.user.id],
    );
    return ok(rows);
  } catch (error) {
    console.error("Error listing transactions:", error);
    return errorResponse("Failed to list transactions", 500, "INTERNAL_ERROR");
  }
}

interface ParsedTx {
  type: "INCOME" | "EXPENSE";
  category: string;
  amount: number;
  description: string | null;
  source: string | null;
  date: string;
  isRecurring: boolean;
  recurrencePattern: string | null;
}

type ParseResult = { ok: true; value: ParsedTx } | { ok: false; code: string };

function parseCreate(body: unknown): ParseResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const type = typeof b.type === "string" ? b.type.toUpperCase() : "";
  if (!TRANSACTION_TYPES.has(type)) {
    return { ok: false, code: 'type must be "INCOME" or "EXPENSE"' };
  }
  const amount = typeof b.amount === "number" ? b.amount : Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, code: "amount must be a positive number" };
  }
  const category = str(b.category, MAX_CATEGORY);
  if (!category) return { ok: false, code: "category is required" };
  const description = str(b.description, MAX_DESCRIPTION) ?? null;
  const source = str(b.source, MAX_SOURCE) ?? null;
  const date =
    typeof b.date === "string" && b.date.trim()
      ? b.date
      : new Date().toISOString();
  return {
    ok: true,
    value: {
      type: type as "INCOME" | "EXPENSE",
      category,
      amount,
      description,
      source,
      date,
      isRecurring: b.isRecurring === true,
      recurrencePattern: str(b.recurrencePattern, 40) ?? null,
    },
  };
}

export async function createTransaction(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const parsed = parseCreate(req.body);
  if (!parsed.ok) {
    return fail(parsed.code, 400);
  }
  try {
    const db = new Database(req.env.DB);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const v = parsed.value;
    await db.run(
      `INSERT INTO "Transaction"
         (id, userId, type, category, amount, description, source, date, isRecurring, recurrencePattern, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      [
        id,
        req.user.id,
        v.type,
        v.category,
        v.amount,
        v.description,
        v.source,
        v.date,
        v.isRecurring,
        v.recurrencePattern,
        now,
        now,
      ],
    );
    const row = await db.first<Transaction>(
      `SELECT id, userId, type, category, amount, description, source, date, isRecurring, recurrencePattern, createdAt, updatedAt
       FROM "Transaction" WHERE id = ?1`,
      [id],
    );
    return ok(row, 201);
  } catch (error) {
    console.error("Error creating transaction:", error);
    return errorResponse("Failed to create transaction", 500, "INTERNAL_ERROR");
  }
}

export async function updateTransaction(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  try {
    const db = new Database(req.env.DB);
    const owned = await db.first<{ userId: string }>(
      `SELECT userId FROM "Transaction" WHERE id = ?1`,
      [id],
    );
    if (!owned || owned.userId !== req.user.id) {
      return fail("Transaction not found", 404);
    }
    const parsed = parseCreate(req.body);
    if (!parsed.ok) return fail(parsed.code, 400);
    const v = parsed.value;
    const now = new Date().toISOString();
    await db.run(
      `UPDATE "Transaction" SET type = ?1, category = ?2, amount = ?3, description = ?4,
         source = ?5, date = ?6, isRecurring = ?7, recurrencePattern = ?8, updatedAt = ?9
       WHERE id = ?10`,
      [
        v.type,
        v.category,
        v.amount,
        v.description,
        v.source,
        v.date,
        v.isRecurring,
        v.recurrencePattern,
        now,
        id,
      ],
    );
    const row = await db.first<Transaction>(
      `SELECT id, userId, type, category, amount, description, source, date, isRecurring, recurrencePattern, createdAt, updatedAt
       FROM "Transaction" WHERE id = ?1`,
      [id],
    );
    return ok(row);
  } catch (error) {
    console.error("Error updating transaction:", error);
    return errorResponse("Failed to update transaction", 500, "INTERNAL_ERROR");
  }
}

export async function deleteTransaction(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  try {
    const db = new Database(req.env.DB);
    const owned = await db.first<{ userId: string }>(
      `SELECT userId FROM "Transaction" WHERE id = ?1`,
      [id],
    );
    if (!owned || owned.userId !== req.user.id) {
      return fail("Transaction not found", 404);
    }
    await db.run(`DELETE FROM "Transaction" WHERE id = ?1`, [id]);
    return ok({ id });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return errorResponse("Failed to delete transaction", 500, "INTERNAL_ERROR");
  }
}

interface ReportRow {
  totalIncome: number | null;
  totalExpense: number | null;
  count: number;
}

export async function weeklyReport(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  try {
    const db = new Database(req.env.DB);
    const now = new Date();
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay(),
    );
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const row = await db.first<ReportRow>(
      `SELECT
         SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as totalIncome,
         SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as totalExpense,
         COUNT(*) as count
       FROM "Transaction"
       WHERE userId = ?1 AND date >= ?2 AND date < ?3`,
      [req.user.id, weekStart.toISOString(), weekEnd.toISOString()],
    );
    return ok({
      totalIncome: row?.totalIncome ?? 0,
      totalExpense: row?.totalExpense ?? 0,
      net: (row?.totalIncome ?? 0) - (row?.totalExpense ?? 0),
      count: row?.count ?? 0,
      start: weekStart.toISOString().split("T")[0],
      end: weekEnd.toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("Error generating weekly report:", error);
    return errorResponse("Failed to generate report", 500, "INTERNAL_ERROR");
  }
}

export async function monthlyReport(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  try {
    const db = new Database(req.env.DB);
    const now = new Date();
    const year = Number.parseInt(
      String(req.query?.year ?? now.getFullYear()),
      10,
    );
    const month = Number.parseInt(
      String(req.query?.month ?? now.getMonth() + 1),
      10,
    );
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const row = await db.first<ReportRow>(
      `SELECT
         SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as totalIncome,
         SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as totalExpense,
         COUNT(*) as count
       FROM "Transaction"
       WHERE userId = ?1 AND date >= ?2 AND date < ?3`,
      [req.user.id, start.toISOString(), end.toISOString()],
    );
    const byCategory = await db.all<{
      category: string;
      type: string;
      total: number;
    }>(
      `SELECT category, type, SUM(amount) as total
       FROM "Transaction"
       WHERE userId = ?1 AND date >= ?2 AND date < ?3
       GROUP BY category, type
       ORDER BY total DESC`,
      [req.user.id, start.toISOString(), end.toISOString()],
    );
    return ok({
      year,
      month,
      totalIncome: row?.totalIncome ?? 0,
      totalExpense: row?.totalExpense ?? 0,
      net: (row?.totalIncome ?? 0) - (row?.totalExpense ?? 0),
      count: row?.count ?? 0,
      byCategory,
    });
  } catch (error) {
    console.error("Error generating monthly report:", error);
    return errorResponse("Failed to generate report", 500, "INTERNAL_ERROR");
  }
}

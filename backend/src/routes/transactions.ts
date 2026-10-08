import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface CreateTransactionPayload {
  amount: number;
  type: string;
  source: string;
  sourceId?: string;
  description?: string;
}

interface XpSummaryRow {
  earned: number | null;
  spent: number | null;
  totalTransactions: number;
}

export async function listTransactions(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = req.user.id;
  const db = new Database(req.env.DB!);

  try {
    const transactions = await db.all(
      `SELECT id, userId, amount, type, source, sourceId, description, createdAt
       FROM XPTransaction WHERE userId = ?1
       ORDER BY createdAt DESC LIMIT 100`,
      [userId],
    );

    return new Response(JSON.stringify({ data: transactions }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error listing transactions:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to list transactions",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function getTransactionsSummary(
  req: AppRequest,
): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = req.user.id;
  const db = new Database(req.env.DB!);

  try {
    const summary = await db.first<XpSummaryRow>(
      `SELECT
         SUM(CASE WHEN type = 'earn' THEN amount ELSE 0 END) as earned,
         SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END) as spent,
         COUNT(*) as totalTransactions
       FROM XPTransaction WHERE userId = ?1`,
      [userId],
    );

    const user = await db.getUserById(userId);

    return new Response(
      JSON.stringify({
        data: {
          xp: user?.xp || 0,
          earned: summary?.earned || 0,
          spent: summary?.spent || 0,
          totalTransactions: summary?.totalTransactions || 0,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error getting transactions summary:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get transactions summary",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function createTransaction(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { amount, type, source, sourceId, description } =
    req.body as CreateTransactionPayload;

  if (!amount || !type || !source) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: amount, type, source",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!["earn", "spend"].includes(type)) {
    return new Response(
      JSON.stringify({
        error: 'Type must be "earn" or "spend"',
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = req.user.id;
  const db = new Database(req.env.DB!);

  try {
    const transactionId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO XPTransaction (id, userId, amount, type, source, sourceId, description, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [transactionId, userId, amount, type, source, sourceId, description, now],
    );

    const transaction = await db.first(
      `SELECT id, userId, amount, type, source, sourceId, description, createdAt
       FROM XPTransaction WHERE id = ?1`,
      [transactionId],
    );

    return new Response(JSON.stringify({ data: transaction }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create transaction",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface XpTransaction {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  taskId?: string;
  habitId?: string;
  createdAt: string;
}

export async function getXpHistory(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const xpTransactions = await db.all<XpTransaction>(
    `SELECT * FROM "XPTransaction" WHERE userId = ?1 ORDER BY createdAt DESC LIMIT 100`,
    [req.user.id],
  );

  const totalXp = xpTransactions.reduce((sum, t) => sum + t.amount, 0);

  return new Response(
    JSON.stringify({
      data: {
        totalXp,
        transactions: xpTransactions,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function getXpChartData(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);

  // Last 30 days XP
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const dailyXp = await db.all<{ date: string; total: number }>(
    `SELECT date(createdAt) as date, SUM(amount) as total
     FROM "XPTransaction" 
     WHERE userId = ?1 AND date(createdAt) >= ?2
     GROUP BY date(createdAt)
     ORDER BY date ASC`,
    [req.user.id, startDate],
  );

  // By source/type
  const byReason = await db.all<{ reason: string; total: number }>(
    `SELECT reason, SUM(amount) as total
     FROM "XPTransaction"
     WHERE userId = ?1
     GROUP BY reason
     ORDER BY total DESC`,
    [req.user.id],
  );

  return new Response(
    JSON.stringify({
      data: {
        daily: dailyXp,
        byReason,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

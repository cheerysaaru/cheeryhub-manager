import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

interface CountRow {
  count: number;
}

interface TotalRow {
  total: number | null;
}

export async function getAnalytics(req: AppRequest): Promise<Response> {
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
  const db = new Database(req.env.DB);

  try {
    const user = await db.getUserById(userId);

    const tasksResult = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM Task WHERE userId = ? AND deletedAt IS NULL`,
      [userId],
    );

    const habitsResult = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM Habit WHERE userId = ? AND deletedAt IS NULL`,
      [userId],
    );

    const goalsResult = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM Goal WHERE userId = ?`,
      [userId],
    );

    const skillsResult = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM Skill WHERE userId = ?`,
      [userId],
    );

    // XP is stored as a signed amount (earn positive, spend negative) on
    // XPTransaction; there is no separate "type" column.
    const xpResult = await db.first<TotalRow>(
      `SELECT SUM(amount) as total FROM XPTransaction WHERE userId = ?`,
      [userId],
    );

    const now = new Date();
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay() + 1,
    )
      .toISOString()
      .split("T")[0];

    const completionsResult = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM HabitCompletion
       WHERE userId = ? AND date >= ?`,
      [userId, weekStart],
    );

    const today = new Date().toISOString().split("T")[0];
    const completedHabitsToday = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM HabitCompletion
       WHERE userId = ? AND date = ?`,
      [userId, today],
    );

    const completedTasksToday = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM Task
       WHERE userId = ? AND deletedAt IS NULL AND completedAt IS NOT NULL
       AND DATE(completedAt) = ?`,
      [userId, today],
    );

    const overdueTasksResult = await db.first<CountRow>(
      `SELECT COUNT(*) as count FROM Task
       WHERE userId = ? AND deletedAt IS NULL AND completedAt IS NULL
       AND dueAt IS NOT NULL AND dueAt < ?`,
      [userId, today],
    );

    const analytics = {
      user: {
        name: user?.name || "User",
        email: user?.email,
        xp: user?.xp || 0,
      },
      stats: {
        totalTasks: tasksResult?.count || 0,
        totalHabits: habitsResult?.count || 0,
        totalGoals: goalsResult?.count || 0,
        totalSkills: skillsResult?.count || 0,
        xpEarned: xpResult?.total || 0,
        thisWeekCompletions: completionsResult?.count || 0,
      },
      today: {
        completedHabits: completedHabitsToday?.count || 0,
        completedTasks: completedTasksToday?.count || 0,
        tasksOverdue: overdueTasksResult?.count || 0,
      },
    };

    return new Response(JSON.stringify({ data: analytics }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error getting analytics:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get analytics",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function getChartData(req: AppRequest): Promise<Response> {
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
  const type = (req.query?.type as string) || "xp";

  try {
    if (type === "xp") {
      // Get XP over time (last 30 days)
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const data = await db.all(
        `SELECT DATE(createdAt) as date, 
                SUM(CASE WHEN type = 'earn' THEN amount ELSE -amount END) as xp
         FROM XPTransaction
         WHERE userId = ?1 AND createdAt >= ?2
         GROUP BY DATE(createdAt)
         ORDER BY date ASC`,
        [userId, thirtyDaysAgo.toISOString()],
      );

      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else if (type === "habits") {
      // Get habit completion rate over time
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const data = await db.all(
        `SELECT DATE(date) as date, COUNT(*) as total,
                SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END) as completed
         FROM HabitCompletion
         WHERE userId = ?1 AND date >= ?2
         GROUP BY DATE(date)
         ORDER BY date ASC`,
        [userId, thirtyDaysAgo.toISOString()],
      );

      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        error: "Invalid type parameter",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error getting chart data:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get chart data",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

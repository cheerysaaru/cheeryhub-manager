import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

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
  const db = new Database(req.env?.DB!);

  try {
    const user = await db.getUserById(userId);

    // Count tasks
    const tasksResult = await db.first(
      `SELECT COUNT(*) as count FROM Task WHERE userId = ? AND deletedAt IS NULL`,
      [userId],
    );

    // Count habits
    const habitsResult = await db.first(
      `SELECT COUNT(*) as count FROM Habit WHERE userId = ? AND deletedAt IS NULL`,
      [userId],
    );

    // Count goals
    const goalsResult = await db.first(
      `SELECT COUNT(*) as count FROM Goal WHERE userId = ? AND deletedAt IS NULL`,
      [userId],
    );

    // Count skills
    const skillsResult = await db.first(
      `SELECT COUNT(*) as count FROM Skill WHERE userId = ? AND deletedAt IS NULL`,
      [userId],
    );

    // Get XP data
    const xpResult = await db.first(
      `SELECT SUM(CASE WHEN type = 'earn' THEN amount ELSE -amount END) as total
       FROM XPTransaction WHERE userId = ?`,
      [userId],
    );

    // Get this week's habit completions
    const now = new Date();
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay() + 1,
    );
    const completionsResult = await db.first(
      `SELECT COUNT(*) as count FROM HabitDayEvent
       WHERE habitId IN (SELECT id FROM Habit WHERE userId = ? AND deletedAt IS NULL)
       AND date >= ? AND status = 'checked_in'`,
      [userId, weekStart.toISOString().split("T")[0]],
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
        completedHabits: 0,
        completedTasks: 0,
        tasksOverdue: 0,
      },
    };

    // Get today's data
    const today = new Date().toISOString().split("T")[0];
    const completedHabitsToday = await db.first(
      `SELECT COUNT(*) as count FROM HabitDayEvent
       WHERE habitId IN (SELECT id FROM Habit WHERE userId = ? AND deletedAt IS NULL)
       AND date = ? AND status = 'checked_in'`,
      [userId, today],
    );

    const completedTasksToday = await db.first(
      `SELECT COUNT(*) as count FROM Task
       WHERE userId = ? AND deletedAt IS NULL AND completedAt IS NOT NULL
       AND DATE(completedAt) = ?`,
      [userId, today],
    );

    const overdueTasksResult = await db.first(
      `SELECT COUNT(*) as count FROM Task
       WHERE userId = ? AND deletedAt IS NULL AND completedAt IS NULL
       AND dueDate < ?`,
      [userId, today],
    );

    analytics.today.completedHabits = completedHabitsToday?.count || 0;
    analytics.today.completedTasks = completedTasksToday?.count || 0;
    analytics.today.tasksOverdue = overdueTasksResult?.count || 0;

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
  const db = new Database(req.env?.DB!);
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

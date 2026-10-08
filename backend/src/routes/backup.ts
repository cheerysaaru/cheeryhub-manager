import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

export async function exportData(req: AppRequest): Promise<Response> {
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
    const db = new Database(req.env?.DB!);
    const user = await db.getUserById(req.user.id);

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "User not found",
          code: "NOT_FOUND",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Export all user data
    const tasks = await db.all(
      "SELECT * FROM Task WHERE userId = ?1 ORDER BY createdAt DESC",
      [req.user.id],
    );

    const habits = await db.all(
      "SELECT * FROM Habit WHERE userId = ?1 ORDER BY createdAt DESC",
      [req.user.id],
    );

    const habitEvents = await db.all(
      `SELECT hde.* FROM HabitDayEvent hde
       JOIN Habit h ON hde.habitId = h.id
       WHERE h.userId = ?1
       ORDER BY hde.date DESC`,
      [req.user.id],
    );

    const goals = await db.all(
      "SELECT * FROM Goal WHERE userId = ?1 ORDER BY createdAt DESC",
      [req.user.id],
    );

    const skills = await db.all(
      "SELECT * FROM Skill WHERE userId = ?1 ORDER BY createdAt DESC",
      [req.user.id],
    );

    const notifications = await db.all(
      "SELECT * FROM Notification WHERE userId = ?1 ORDER BY createdAt DESC LIMIT 100",
      [req.user.id],
    );

    const transactions = await db.all(
      "SELECT * FROM XPTransaction WHERE userId = ?1 ORDER BY createdAt DESC",
      [req.user.id],
    );

    const backup = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        xp: user.xp,
        timezone: user.timezone,
        theme: user.theme,
        createdAt: user.createdAt,
      },
      data: {
        tasks,
        habits,
        habitEvents,
        goals,
        skills,
        notifications,
        transactions,
      },
      stats: {
        totalTasks: tasks.length,
        totalHabits: habits.length,
        totalGoals: goals.length,
        totalSkills: skills.length,
        totalNotifications: notifications.length,
        totalTransactions: transactions.length,
      },
    };

    // Return as downloadable JSON
    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cheeryhub-backup-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("Error exporting data:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to export data",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function getBackupHistory(req: AppRequest): Promise<Response> {
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
    const db = new Database(req.env?.DB!);
    // Return information about previous backups (in a real system, this would query a backup table)
    // For now, just return metadata
    const stats = await db.first(
      `SELECT
         (SELECT COUNT(*) FROM Task WHERE userId = ?1) as taskCount,
         (SELECT COUNT(*) FROM Habit WHERE userId = ?1) as habitCount,
         (SELECT COUNT(*) FROM Goal WHERE userId = ?1) as goalCount,
         (SELECT SUM(amount) FROM XPTransaction WHERE userId = ?1 AND type = 'earn') as totalXPEarned
       `,
      [req.user.id],
    );

    return new Response(
      JSON.stringify({
        data: {
          lastBackupDate: new Date().toISOString(),
          nextBackupDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          stats: {
            taskCount: stats?.taskCount || 0,
            habitCount: stats?.habitCount || 0,
            goalCount: stats?.goalCount || 0,
            totalXPEarned: stats?.totalXPEarned || 0,
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error getting backup history:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get backup history",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

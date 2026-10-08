import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

// Data shape interfaces
interface TaskData {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  priority?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  deadlineTime?: string;
  recurrence?: string;
  isMandatory?: boolean;
  reminderEnabled?: boolean;
  estimatedMinutes?: number;
  goalId?: string;
  skillId?: string;
  completedAt?: string;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
interface HabitData {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  frequency?: string;
  targetDays?: number;
  active?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
interface HabitEventData {
  id?: string;
  habitId?: string;
  date?: string;
  fromStatus?: string;
  toStatus?: string;
  pointsDelta?: number;
  createdAt?: string;
}
interface GoalData {
  id?: string;
  title?: string;
  description?: string;
  progress?: number;
  deadline?: string;
  targetDate?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}
interface SkillData {
  id?: string;
  name?: string;
  currentLevel?: number;
  targetLevel?: number;
  level?: number;
  description?: string;
  progress?: number;
  createdAt?: string;
  updatedAt?: string;
}
interface NotificationData {
  id?: string;
  userId?: string;
  type?: string;
  title?: string;
  body?: string;
  link?: string;
  readAt?: string;
  dedupeKey?: string;
  createdAt?: string;
}
interface TransactionData {
  id?: string;
  userId?: string;
  amount?: number;
  type?: string;
  source?: string;
  sourceId?: string;
  description?: string;
  createdAt?: string;
}

interface BackupStatsRow {
  taskCount: number | null;
  habitCount: number | null;
  goalCount: number | null;
  totalXPEarned: number | null;
}

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
    const db = new Database(req.env.DB!);
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
    const db = new Database(req.env.DB!);
    // Return information about previous backups (in a real system, this would query a backup table)
    // For now, just return metadata
    const stats = await db.first<BackupStatsRow>(
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

export async function importData(req: AppRequest): Promise<Response> {
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
    const db = new Database(req.env.DB);
    const backup = req.body as {
      user?: {
        email: string;
        name: string;
        xp?: number;
        timezone?: string;
        theme?: string;
      };
      data?: {
        tasks?: TaskData[];
        habits?: HabitData[];
        habitEvents?: HabitEventData[];
        goals?: GoalData[];
        skills?: SkillData[];
        notifications?: NotificationData[];
        transactions?: TransactionData[];
      };
    };

    if (!backup.data) {
      return new Response(
        JSON.stringify({
          error: "Invalid backup format",
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();
    const imported = {
      tasks: 0,
      habits: 0,
      habitEvents: 0,
      goals: 0,
      skills: 0,
    };

    // Import tasks
    if (backup.data.tasks?.length) {
      for (const task of backup.data.tasks) {
        if (!task.id || !task.title) continue;
        await db.run(
          `INSERT OR REPLACE INTO Task (id, userId, title, description, category, status, priority, scheduledDate, scheduledTime, deadlineTime, recurrence, isMandatory, reminderEnabled, estimatedMinutes, goalId, skillId, completedAt, deletedAt, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)`,
          [
            task.id,
            req.user.id,
            task.title,
            task.description,
            task.category,
            task.status || "TODO",
            task.priority || "MEDIUM",
            task.scheduledDate,
            task.scheduledTime,
            task.deadlineTime,
            task.recurrence || "NONE",
            task.isMandatory || false,
            task.reminderEnabled || false,
            task.estimatedMinutes,
            task.goalId,
            task.skillId,
            task.completedAt,
            task.deletedAt,
            task.createdAt || now,
            task.updatedAt || now,
          ],
        );
        imported.tasks++;
      }
    }

    // Import habits
    if (backup.data.habits?.length) {
      for (const habit of backup.data.habits) {
        if (!habit.id || !habit.title) continue;
        await db.run(
          `INSERT OR REPLACE INTO Habit (id, userId, name, title, description, frequency, targetDays, active, deletedAt, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
          [
            habit.id,
            req.user.id,
            habit.name || habit.title,
            habit.title,
            habit.description,
            habit.frequency || "daily",
            habit.targetDays || 7,
            habit.active !== false,
            habit.deletedAt,
            habit.createdAt || now,
            habit.updatedAt || now,
          ],
        );
        imported.habits++;
      }
    }

    // Import habit events
    if (backup.data.habitEvents?.length) {
      for (const event of backup.data.habitEvents) {
        if (!event.id || !event.habitId || !event.date) continue;
        await db.run(
          `INSERT OR REPLACE INTO HabitDayEvent (id, userId, habitId, date, fromStatus, toStatus, pointsDelta, createdAt)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
          [
            event.id,
            req.user.id,
            event.habitId,
            event.date,
            event.fromStatus,
            event.toStatus,
            event.pointsDelta || 0,
            event.createdAt || now,
          ],
        );
        imported.habitEvents++;
      }
    }

    // Import goals
    if (backup.data.goals?.length) {
      for (const goal of backup.data.goals) {
        if (!goal.id || !goal.title) continue;
        await db.run(
          `INSERT OR REPLACE INTO Goal (id, userId, title, description, progress, deadline, status, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
          [
            goal.id,
            req.user.id,
            goal.title,
            goal.description,
            goal.progress || 0,
            goal.deadline || goal.targetDate,
            goal.status || "ACTIVE",
            goal.createdAt || now,
            goal.updatedAt || now,
          ],
        );
        imported.goals++;
      }
    }

    // Import skills
    if (backup.data.skills?.length) {
      for (const skill of backup.data.skills) {
        if (!skill.id || !skill.name) continue;
        await db.run(
          `INSERT OR REPLACE INTO Skill (id, userId, name, currentLevel, targetLevel, level, description, progress, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
          [
            skill.id,
            req.user.id,
            skill.name,
            skill.currentLevel || 1,
            skill.targetLevel || 5,
            skill.level || skill.currentLevel || 1,
            skill.description,
            skill.progress || 0,
            skill.createdAt || now,
            skill.updatedAt || now,
          ],
        );
        imported.skills++;
      }
    }

    return new Response(
      JSON.stringify({
        data: { message: "Backup imported successfully", imported },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error importing data:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to import data",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

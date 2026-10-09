import type { AppRequest, AppEnv } from "./types/index";
import { verifyAuth } from "./middleware/auth";
import { friendlyDbError } from "./middleware/session";
import { ensureSchema } from "./db/bootstrap";
import * as authRoutes from "./routes/auth";
import * as authPasswordRoutes from "./routes/auth-password";
import * as healthRoutes from "./routes/health";
import * as tasksRoutes from "./routes/tasks";
import * as habitsRoutes from "./routes/habits";
import * as goalsRoutes from "./routes/goals";
import * as skillsRoutes from "./routes/skills";
import * as notificationsRoutes from "./routes/notifications";
import * as remindersRoutes from "./routes/reminders";
import * as transactionsRoutes from "./routes/transactions";
import * as settingsRoutes from "./routes/settings";
import * as streaksRoutes from "./routes/streaks";
import * as analyticsRoutes from "./routes/analytics";
import * as brandRoutes from "./routes/brand";
import * as backupRoutes from "./routes/backup";
import * as journalRoutes from "./routes/journal";
import * as focusRoutes from "./routes/focus";
import * as xpRoutes from "./routes/xp";
import * as pointsRoutes from "./routes/points";
import * as adminRoutes from "./routes/admin";
import * as achievementsRoutes from "./routes/achievements";

const getCorsHeaders = (origin: string): Record<string, string> => {
  const allowedOrigins = [
    "https://cheeryhub.space",
    "https://www.cheeryhub.space",
    "https://cheerysaaru.github.io",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ];

  const isAllowed = allowedOrigins.includes(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed
      ? origin
      : "https://cheeryhub.space",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Cookie, Accept",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
};

const parseUrl = (url: string) => {
  const parsed = new URL(url);
  return {
    pathname: parsed.pathname,
    searchParams: parsed.searchParams,
  };
};

const parseJsonBody = async (request: Request): Promise<unknown> => {
  try {
    if (
      request.method === "GET" ||
      request.method === "DELETE" ||
      request.method === "OPTIONS" ||
      request.method === "HEAD"
    ) {
      return undefined;
    }
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return undefined;
    }
    return await request.json().catch(() => undefined);
  } catch (error) {
    console.error("[parseJsonBody]", error);
    return undefined;
  }
};

async function handleRequest(
  request: Request,
  env: AppEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const origin = request.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Guarantee the columns/tables the current code needs exist even when the
    // CI migration step couldn't reach the remote DB. Idempotent + cached.
    await ensureSchema(env.DB);

    const { pathname, searchParams } = parseUrl(request.url);
    const body = await parseJsonBody(request);

    // Create app request
    const appReq: AppRequest = {
      method: request.method,
      url: request.url,
      pathname,
      searchParams,
      body,
      env,
      headers: request.headers,
      params: {},
    };

    let response: Response | undefined;

    // Public routes
    if (pathname === "/api/health" && request.method === "GET") {
      response = await healthRoutes.health(appReq);
    } else if (pathname === "/api/auth/register" && request.method === "POST") {
      response = await authRoutes.register(appReq);
    } else if (pathname === "/api/auth/login" && request.method === "POST") {
      response = await authRoutes.login(appReq);
    } else if (pathname === "/api/auth/logout" && request.method === "POST") {
      response = await authRoutes.logout(appReq);
    } else if (pathname === "/api/auth/refresh" && request.method === "POST") {
      response = await authRoutes.refresh(appReq);
    } else if (pathname === "/api/auth/me" && request.method === "GET") {
      // Me endpoint - check auth first
      const authResult = await verifyAuth(appReq);
      if (authResult instanceof Response) {
        response = authResult;
      } else {
        Object.assign(appReq, authResult);
        response = await authRoutes.me(appReq);
      }
    }

    // Protected routes - require auth first
    else {
      const authResult = await verifyAuth(appReq);

      if (authResult instanceof Response) {
        // Auth failed
        return new Response(authResult.body, {
          status: authResult.status,
          headers: corsHeaders,
        });
      }

      // Auth succeeded, update request with user
      Object.assign(appReq, authResult);

      // Tasks routes
      if (pathname === "/api/tasks" && request.method === "GET") {
        response = await tasksRoutes.listTasks(appReq);
      } else if (pathname === "/api/tasks/trash" && request.method === "GET") {
        response = await tasksRoutes.listTrashTasks(appReq);
      } else if (pathname === "/api/tasks" && request.method === "POST") {
        response = await tasksRoutes.createTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+$/) &&
        request.method === "GET"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.getTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.updateTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.deleteTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/complete$/) &&
        (request.method === "POST" || request.method === "PATCH")
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.completeTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/mark-not-completed$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.markNotCompletedTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/checkin$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.checkInTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/extend$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.extendTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/timer\/start$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.startTaskTimer(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/timer\/stop$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.stopTaskTimer(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/timer$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.startTaskTimer(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/restore$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.restoreTask(appReq);
      } else if (
        pathname.match(/^\/api\/tasks\/[^/]+\/permanent$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await tasksRoutes.permanentDeleteTask(appReq);
      }

      // Habits routes
      else if (pathname === "/api/habits" && request.method === "GET") {
        response = await habitsRoutes.listHabits(appReq);
      } else if (pathname === "/api/habits" && request.method === "POST") {
        response = await habitsRoutes.createHabit(appReq);
      } else if (
        pathname.match(/^\/api\/habits\/[^/]+$/) &&
        request.method === "GET"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await habitsRoutes.getHabit(appReq);
      } else if (
        pathname.match(/^\/api\/habits\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await habitsRoutes.updateHabit(appReq);
      } else if (
        pathname.match(/^\/api\/habits\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await habitsRoutes.deleteHabit(appReq);
      } else if (
        pathname.match(/^\/api\/habits\/[^/]+\/complete$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await habitsRoutes.completeHabit(appReq);
      } else if (
        pathname.match(/^\/api\/habits\/[^/]+\/today$/) &&
        request.method === "DELETE"
      ) {
        appReq.params.id = pathname.split("/")[3];
        response = await habitsRoutes.clearHabitToday(appReq);
      } else if (
        pathname.match(/^\/api\/habits\/[^/]+\/fail$/) &&
        request.method === "POST"
      ) {
        appReq.params.id = pathname.split("/")[3];
        response = await habitsRoutes.failHabit(appReq);
      } else if (
        pathname.match(/^\/api\/habits\/[^/]+\/skip$/) &&
        request.method === "POST"
      ) {
        appReq.params.id = pathname.split("/")[3];
        response = await habitsRoutes.skipHabit(appReq);
      }

      // Goals routes
      else if (pathname === "/api/goals" && request.method === "GET") {
        response = await goalsRoutes.listGoals(appReq);
      } else if (pathname === "/api/goals" && request.method === "POST") {
        response = await goalsRoutes.createGoal(appReq);
      } else if (
        pathname.match(/^\/api\/goals\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await goalsRoutes.updateGoal(appReq);
      } else if (
        pathname.match(/^\/api\/goals\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await goalsRoutes.deleteGoal(appReq);
      }

      // Streaks routes
      else if (pathname === "/api/streaks" && request.method === "GET") {
        response = await streaksRoutes.getStreaks(appReq);
      } else if (
        pathname.match(/^\/api\/streaks\/[^/]+\/check-in$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await streaksRoutes.checkIn(appReq);
      }

      // Analytics routes
      else if (pathname === "/api/analytics" && request.method === "GET") {
        response = await analyticsRoutes.getAnalytics(appReq);
      }

      // Notifications routes
      else if (pathname === "/api/notifications" && request.method === "GET") {
        response = await notificationsRoutes.listNotifications(appReq);
      } else if (
        pathname.match(/^\/api\/notifications\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await notificationsRoutes.updateNotification(appReq);
      } else if (
        pathname.match(/^\/api\/notifications\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await notificationsRoutes.deleteNotification(appReq);
      }

      // Skills, Settings, Transactions, Reminders, Brand, Backup routes
      else if (pathname === "/api/skills" && request.method === "GET") {
        response = await skillsRoutes.listSkills(appReq);
      } else if (pathname === "/api/skills" && request.method === "POST") {
        response = await skillsRoutes.createSkill(appReq);
      } else if (pathname === "/api/settings" && request.method === "GET") {
        response = await settingsRoutes.getSettings(appReq);
      } else if (pathname === "/api/settings" && request.method === "PUT") {
        response = await settingsRoutes.updateSettings(appReq);
      } else if (pathname === "/api/transactions" && request.method === "GET") {
        response = await transactionsRoutes.listTransactions(appReq);
      } else if (
        pathname === "/api/transactions" &&
        request.method === "POST"
      ) {
        response = await transactionsRoutes.createTransaction(appReq);
      } else if (
        pathname === "/api/transactions/report/weekly" &&
        request.method === "GET"
      ) {
        response = await transactionsRoutes.weeklyReport(appReq);
      } else if (
        pathname === "/api/transactions/report/monthly" &&
        request.method === "GET"
      ) {
        response = await transactionsRoutes.monthlyReport(appReq);
      } else if (
        pathname.match(/^\/api\/transactions\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await transactionsRoutes.updateTransaction(appReq);
      } else if (
        pathname.match(/^\/api\/transactions\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await transactionsRoutes.deleteTransaction(appReq);
      } else if (pathname === "/api/reminders" && request.method === "GET") {
        response = await remindersRoutes.listReminders(appReq);
      } else if (pathname === "/api/reminders" && request.method === "POST") {
        response = await remindersRoutes.createReminder(appReq);
      } else if (
        pathname.match(/^\/api\/reminders\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await remindersRoutes.updateReminder(appReq);
      } else if (
        pathname.match(/^\/api\/reminders\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await remindersRoutes.deleteReminder(appReq);
      } else if (pathname === "/api/brand" && request.method === "GET") {
        response = await brandRoutes.listBrandProjects(appReq);
      } else if (pathname === "/api/brand" && request.method === "POST") {
        response = await brandRoutes.createBrandProject(appReq);
      } else if (
        pathname.match(/^\/api\/brand\/[^/]+\/milestones$/) &&
        request.method === "POST"
      ) {
        appReq.params.projectId = pathname.split("/")[3];
        response = await brandRoutes.createBrandMilestone(appReq);
      } else if (
        pathname.match(/^\/api\/brand\/[^/]+\/milestones\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        appReq.params.projectId = pathname.split("/")[3];
        appReq.params.milestoneId = pathname.split("/")[5];
        response = await brandRoutes.updateBrandMilestone(appReq);
      } else if (
        pathname.match(/^\/api\/brand\/[^/]+\/milestones\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        appReq.params.projectId = pathname.split("/")[3];
        appReq.params.milestoneId = pathname.split("/")[5];
        response = await brandRoutes.deleteBrandMilestone(appReq);
      } else if (
        pathname.match(/^\/api\/brand\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        appReq.params.id = pathname.split("/")[3];
        response = await brandRoutes.updateBrandProject(appReq);
      } else if (
        pathname.match(/^\/api\/brand\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        appReq.params.id = pathname.split("/")[3];
        response = await brandRoutes.deleteBrandProject(appReq);
      } else if (
        pathname === "/api/backup/export" &&
        request.method === "POST"
      ) {
        response = await backupRoutes.exportData(appReq);
      } else if (
        pathname === "/api/backup/import" &&
        request.method === "POST"
      ) {
        response = await backupRoutes.importData(appReq);
      } else if (pathname === "/api/auth/forgot" && request.method === "POST") {
        response = await authPasswordRoutes.forgotPassword(appReq);
      } else if (pathname === "/api/auth/reset" && request.method === "POST") {
        response = await authPasswordRoutes.resetPassword(appReq);
      } else if (pathname === "/api/journal" && request.method === "GET") {
        response = await journalRoutes.listJournalEntries(appReq);
      } else if (pathname === "/api/journal" && request.method === "POST") {
        response = await journalRoutes.createJournalEntry(appReq);
      } else if (
        pathname.match(/^\/api\/journal\/[^/]+$/) &&
        request.method === "GET"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await journalRoutes.getJournalEntry(appReq);
      } else if (
        pathname.match(/^\/api\/journal\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await journalRoutes.updateJournalEntry(appReq);
      } else if (
        pathname.match(/^\/api\/journal\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await journalRoutes.deleteJournalEntry(appReq);
      } else if (pathname === "/api/focus" && request.method === "GET") {
        response = await focusRoutes.listFocusSessions(appReq);
      } else if (pathname === "/api/focus" && request.method === "POST") {
        response = await focusRoutes.createFocusSession(appReq);
      } else if (
        pathname.match(/^\/api\/focus\/[^/]+$/) &&
        request.method === "GET"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await focusRoutes.getFocusSession(appReq);
      } else if (
        pathname.match(/^\/api\/focus\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await focusRoutes.updateFocusSession(appReq);
      } else if (
        pathname.match(/^\/api\/focus\/[^/]+\/complete$/) &&
        request.method === "POST"
      ) {
        const id = pathname.split("/")[3];
        appReq.params.id = id;
        response = await focusRoutes.completeFocusSession(appReq);
      } else if (pathname === "/api/analytics/xp" && request.method === "GET") {
        response = await xpRoutes.getXpHistory(appReq);
      } else if (pathname === "/api/xp" && request.method === "GET") {
        response = await xpRoutes.getXpHistory(appReq);
      } else if (pathname === "/api/points" && request.method === "GET") {
        response = await pointsRoutes.getPoints(appReq);
      } else if (
        pathname === "/api/analytics/charts" &&
        request.method === "GET"
      ) {
        response = await xpRoutes.getXpChartData(appReq);
      } else if (pathname === "/api/admin/users" && request.method === "GET") {
        response = await adminRoutes.listUsers(appReq);
      } else if (pathname === "/api/admin/users" && request.method === "POST") {
        response = await adminRoutes.createUser(appReq);
      } else if (
        pathname.match(/^\/api\/admin\/users\/[^/]+\/reset-password$/) &&
        request.method === "POST"
      ) {
        appReq.params.id = pathname.split("/")[4];
        response = await adminRoutes.resetUserPassword(appReq);
      } else if (
        pathname.match(/^\/api\/admin\/users\/[^/]+\/disable$/) &&
        request.method === "POST"
      ) {
        appReq.params.id = pathname.split("/")[4];
        response = await adminRoutes.disableUser(appReq);
      } else if (
        pathname.match(/^\/api\/admin\/users\/[^/]+\/enable$/) &&
        request.method === "POST"
      ) {
        appReq.params.id = pathname.split("/")[4];
        response = await adminRoutes.enableUser(appReq);
      } else if (
        pathname.match(/^\/api\/admin\/users\/[^/]+$/) &&
        request.method === "GET"
      ) {
        const id = pathname.split("/")[4];
        appReq.params.id = id;
        response = await adminRoutes.getUserDetails(appReq);
      } else if (
        pathname.match(/^\/api\/admin\/users\/[^/]+$/) &&
        request.method === "PUT"
      ) {
        const id = pathname.split("/")[4];
        appReq.params.id = id;
        response = await adminRoutes.updateUserRole(appReq);
      } else if (
        pathname.match(/^\/api\/admin\/users\/[^/]+$/) &&
        request.method === "DELETE"
      ) {
        const id = pathname.split("/")[4];
        appReq.params.id = id;
        response = await adminRoutes.deleteUser(appReq);
      } else if (pathname === "/api/admin/stats" && request.method === "GET") {
        response = await adminRoutes.getSystemStats(appReq);
      } else if (pathname === "/api/achievements" && request.method === "GET") {
        response = await achievementsRoutes.listAchievements(appReq);
      } else if (
        pathname === "/api/achievements/unlock" &&
        request.method === "POST"
      ) {
        response = await achievementsRoutes.unlockAchievement(appReq);
      }
    }

    // No route matched
    if (!response) {
      return new Response(
        JSON.stringify({ error: "Not Found", code: "NOT_FOUND" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Add CORS headers to response
    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[handleRequest]", error);
    // Never leak raw D1/constraint text to the client.
    const friendly = friendlyDbError(error);
    return new Response(
      JSON.stringify({
        error: { code: friendly.code, message: friendly.message },
        code: friendly.code,
      }),
      {
        status: friendly.status,
        headers: corsHeaders,
      },
    );
  }
}

/**
 * Guarantees the single API error shape `{ error: { code, message } }` for
 * every error response, regardless of how the individual handler wrote it.
 * Legacy bodies (`{ error: "msg", code }`) are upgraded in place.
 */
async function normalizeErrorResponse(response: Response): Promise<Response> {
  if (response.status < 400) return response;
  const headers = new Headers(response.headers);
  if (!headers.get("Content-Type")?.includes("application/json")) {
    return response;
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    return response;
  }
  if (!text) {
    headers.set("Content-Type", "application/json");
    return new Response(
      JSON.stringify({
        error: { code: `HTTP_${response.status}`, message: "Request failed" },
        code: `HTTP_${response.status}`,
      }),
      { status: response.status, headers },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(text, { status: response.status, headers });
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    (!("error" in (parsed as Record<string, unknown>)) ||
      typeof (parsed as { error: unknown }).error === "string")
  ) {
    const body = parsed as { error: string; code?: string };
    const code = body.code ?? `HTTP_${response.status}`;
    const message = body.error;
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ error: { code, message }, code }), {
      status: response.status,
      headers,
    });
  }
  return new Response(text, { status: response.status, headers });
}

export default {
  async fetch(
    request: Request,
    env: AppEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      return await normalizeErrorResponse(
        await handleRequest(request, env, ctx),
      );
    } catch (error) {
      console.error("[fetch]", error);
      return new Response(
        JSON.stringify({
          error: { code: "WORKER_ERROR", message: "Worker Error" },
          code: "WORKER_ERROR",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};

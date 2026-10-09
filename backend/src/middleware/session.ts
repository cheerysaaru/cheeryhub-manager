import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { errorResponse } from "../utils/response";

export type SessionResult =
  { ok: true; userId: string } | { ok: false; response: Response };

/**
 * Resolves the verified session to a real, active User row before any
 * user-owned write. The env-based admin (a distinct AdminSession) has no User
 * row by design, so it cannot own task/commitment/etc. data and is rejected
 * with a clear 401 pointing at the admin console.
 */
export async function resolveSessionUser(
  req: AppRequest,
): Promise<SessionResult> {
  if (!req.user) {
    return {
      ok: false,
      response: errorResponse("Unauthorized", 401, "AUTH_REQUIRED"),
    };
  }
  if (req.user.admin) {
    return {
      ok: false,
      response: errorResponse(
        "This admin account has no personal data. Use the admin console.",
        401,
        "ADMIN_NO_DATA",
      ),
    };
  }
  const db = new Database(req.env.DB);
  const user = await db.getUserById(req.user.id);
  if (!user || (user.status && user.status !== "ACTIVE")) {
    return {
      ok: false,
      response: errorResponse(
        "Your session is no longer valid. Please log in again.",
        401,
        "SESSION_INVALID",
      ),
    };
  }
  return { ok: true, userId: req.user.id };
}

/**
 * Maps raw D1/SQLite constraint errors to safe, human messages. Foreign-key
 * failures (e.g. a missing User row) mean the session is no longer valid;
 * other constraint violations mean a data conflict. Never leaks D1_ERROR text.
 */
export function friendlyDbError(error: unknown): {
  message: string;
  status: number;
  code: string;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const constraint =
    /FOREIGN KEY|SQLITE_CONSTRAINT|D1_ERROR|constraint failed|UNIQUE/i.test(
      raw,
    );
  if (/FOREIGN KEY/i.test(raw)) {
    return {
      message: "Your session is no longer valid. Please log in again.",
      status: 401,
      code: "SESSION_INVALID",
    };
  }
  if (/UNIQUE/i.test(raw)) {
    return {
      message: "That record already exists.",
      status: 409,
      code: "CONFLICT",
    };
  }
  if (constraint) {
    return {
      message: "That action conflicts with existing data.",
      status: 400,
      code: "CONSTRAINT_ERROR",
    };
  }
  return {
    message: "Something went wrong. Please try again.",
    status: 500,
    code: "INTERNAL_ERROR",
  };
}

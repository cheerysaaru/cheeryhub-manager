import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import {
  calculatePoints,
  evaluateEditableDays,
  pointsJson,
} from "../lib/points";

/**
 * GET /api/points
 *
 * Recalculates every editable day first (dashboard load is the trigger for
 * deriving missed penalties), then returns the summary: totals, level and the
 * most recent events.
 */
export async function getPoints(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return pointsJson({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
  }

  const db = new Database(req.env.DB);
  await evaluateEditableDays(db, req.user.id);
  const points = await calculatePoints(db, req.user.id);

  return pointsJson({ data: points });
}

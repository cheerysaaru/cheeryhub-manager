import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { ok, fail, errorResponse } from "../utils/response";

// The Brand tab manages brand projects (with milestones), matching the
// frontend `BrandProject` model. Everything is scoped to the session user.
interface BrandProject {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  milestones: BrandMilestone[];
}

interface BrandMilestone {
  id: string;
  brandProjectId: string;
  title: string;
  description?: string | null;
  completed: boolean;
  completedAt?: string | null;
  createdAt: string;
}

const STATUSES = new Set(["IDEA", "ACTIVE", "PAUSED", "COMPLETED"]);

function unauthorized() {
  return errorResponse("Unauthorized", 401, "AUTH_REQUIRED");
}

function projectColumns() {
  return "id, userId, title, description, status, progress, createdAt, updatedAt";
}

async function milestonesFor(
  db: Database,
  projectId: string,
): Promise<BrandMilestone[]> {
  return db.all<BrandMilestone>(
    'SELECT id, brandProjectId, title, description, completed, completedAt, createdAt FROM "BrandMilestone" WHERE brandProjectId = ?1 ORDER BY createdAt ASC',
    [projectId],
  );
}

export async function listBrandProjects(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  try {
    const db = new Database(req.env.DB);
    const projects = await db.all<BrandProject>(
      `SELECT ${projectColumns()} FROM "BrandProject" WHERE userId = ?1 ORDER BY createdAt DESC`,
      [req.user.id],
    );
    const withMilestones = await Promise.all(
      projects.map(async (p) => ({
        ...p,
        milestones: await milestonesFor(db, p.id),
      })),
    );
    return ok(withMilestones);
  } catch (error) {
    console.error("Error listing brand projects:", error);
    return errorResponse(
      "Failed to list brand projects",
      500,
      "INTERNAL_ERROR",
    );
  }
}

interface ProjectPayload {
  title?: string;
  description?: string;
  status?: string;
  progress?: number;
}

export async function createBrandProject(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { title, description, status, progress } = (req.body ??
    {}) as ProjectPayload;
  if (typeof title !== "string" || !title.trim() || title.length > 200) {
    return fail("title is required (max 200)", 400);
  }
  if (status !== undefined && !STATUSES.has(status)) {
    return fail("invalid status", 400);
  }
  try {
    const db = new Database(req.env.DB);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO "BrandProject" (id, userId, title, description, status, progress, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [
        id,
        req.user.id,
        title.trim(),
        description ?? null,
        status ?? "IDEA",
        progress ?? 0,
        now,
        now,
      ],
    );
    const project = await db.first<BrandProject>(
      `SELECT ${projectColumns()} FROM "BrandProject" WHERE id = ?1`,
      [id],
    );
    return ok({ ...project, milestones: [] }, 201);
  } catch (error) {
    console.error("Error creating brand project:", error);
    return errorResponse(
      "Failed to create brand project",
      500,
      "INTERNAL_ERROR",
    );
  }
}

export async function updateBrandProject(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const { title, description, status, progress } = (req.body ??
    {}) as ProjectPayload;
  if (status !== undefined && !STATUSES.has(status)) {
    return fail("invalid status", 400);
  }
  try {
    const db = new Database(req.env.DB);
    const owned = await db.first<{ userId: string }>(
      'SELECT userId FROM "BrandProject" WHERE id = ?1',
      [id],
    );
    if (!owned || owned.userId !== req.user.id) {
      return fail("Project not found", 404);
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (title !== undefined) {
      sets.push(`title = ?${idx++}`);
      values.push(String(title).trim().slice(0, 200) || "Untitled");
    }
    if (description !== undefined) {
      sets.push(`description = ?${idx++}`);
      values.push(description ?? null);
    }
    if (status !== undefined) {
      sets.push(`status = ?${idx++}`);
      values.push(status);
    }
    if (progress !== undefined) {
      const p = Number(progress);
      sets.push(`progress = ?${idx++}`);
      values.push(
        Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0,
      );
    }
    if (sets.length > 0) {
      values.push(new Date().toISOString());
      values.push(id);
      await db.run(
        `UPDATE "BrandProject" SET ${sets.join(", ")}, updatedAt = ?${idx} WHERE id = ?${idx + 1}`,
        values,
      );
    }
    const updated = await db.first<BrandProject>(
      `SELECT ${projectColumns()} FROM "BrandProject" WHERE id = ?1`,
      [id],
    );
    return ok({ ...updated, milestones: await milestonesFor(db, id) });
  } catch (error) {
    console.error("Error updating brand project:", error);
    return errorResponse(
      "Failed to update brand project",
      500,
      "INTERNAL_ERROR",
    );
  }
}

export async function deleteBrandProject(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  try {
    const db = new Database(req.env.DB);
    const owned = await db.first<{ userId: string }>(
      'SELECT userId FROM "BrandProject" WHERE id = ?1',
      [id],
    );
    if (!owned || owned.userId !== req.user.id) {
      return fail("Project not found", 404);
    }
    await db.run('DELETE FROM "BrandMilestone" WHERE brandProjectId = ?1', [
      id,
    ]);
    await db.run('DELETE FROM "BrandProject" WHERE id = ?1', [id]);
    return ok({ id });
  } catch (error) {
    console.error("Error deleting brand project:", error);
    return errorResponse(
      "Failed to delete brand project",
      500,
      "INTERNAL_ERROR",
    );
  }
}

interface MilestonePayload {
  title?: string;
  description?: string;
}

export async function createBrandMilestone(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { projectId } = req.params;
  const { title, description } = (req.body ?? {}) as MilestonePayload;
  if (typeof title !== "string" || !title.trim() || title.length > 200) {
    return fail("title is required (max 200)", 400);
  }
  try {
    const db = new Database(req.env.DB);
    const project = await db.first<{ userId: string }>(
      'SELECT userId FROM "BrandProject" WHERE id = ?1',
      [projectId],
    );
    if (!project || project.userId !== req.user.id) {
      return fail("Project not found", 404);
    }
    const id = crypto.randomUUID();
    await db.run(
      'INSERT INTO "BrandMilestone" (id, brandProjectId, title, description, completed, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
      [
        id,
        projectId,
        title.trim(),
        description ?? null,
        false,
        new Date().toISOString(),
      ],
    );
    const milestone = await db.first<BrandMilestone>(
      'SELECT id, brandProjectId, title, description, completed, completedAt, createdAt FROM "BrandMilestone" WHERE id = ?1',
      [id],
    );
    return ok(milestone, 201);
  } catch (error) {
    console.error("Error creating brand milestone:", error);
    return errorResponse("Failed to create milestone", 500, "INTERNAL_ERROR");
  }
}
interface MilestoneUpdatePayload {
  title?: string;
  description?: string;
  completed?: boolean;
}

export async function updateBrandMilestone(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { projectId, milestoneId } = req.params;
  const { title, description, completed } = (req.body ??
    {}) as MilestoneUpdatePayload;
  try {
    const db = new Database(req.env.DB);
    const project = await db.first<{ userId: string }>(
      'SELECT userId FROM "BrandProject" WHERE id = ?1',
      [projectId],
    );
    if (!project || project.userId !== req.user.id) {
      return fail("Project not found", 404);
    }
    const existing = await db.first<BrandMilestone>(
      'SELECT id FROM "BrandMilestone" WHERE id = ?1 AND brandProjectId = ?2',
      [milestoneId, projectId],
    );
    if (!existing) return fail("Milestone not found", 404);

    const sets = [];
    const values = [];
    let idx = 1;
    if (title !== undefined) {
      sets.push(`title = ?${idx++}`);
      values.push(String(title).trim().slice(0, 200) || "Untitled");
    }
    if (description !== undefined) {
      sets.push(`description = ?${idx++}`);
      values.push(description ?? null);
    }
    if (completed !== undefined) {
      sets.push(`completed = ?${idx++}`);
      values.push(completed ? 1 : 0);
      sets.push(`completedAt = ?${idx++}`);
      values.push(completed ? new Date().toISOString() : null);
    }
    if (sets.length > 0) {
      values.push(milestoneId);
      await db.run(
        `UPDATE "BrandMilestone" SET ${sets.join(", ")} WHERE id = ?${idx}`,
        values,
      );
    }
    const updated = await db.first<BrandMilestone>(
      'SELECT id, brandProjectId, title, description, completed, completedAt, createdAt FROM "BrandMilestone" WHERE id = ?1',
      [milestoneId],
    );
    return ok(updated);
  } catch (error) {
    console.error("Error updating brand milestone:", error);
    return errorResponse("Failed to update milestone", 500, "INTERNAL_ERROR");
  }
}

export async function deleteBrandMilestone(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { projectId, milestoneId } = req.params;
  try {
    const db = new Database(req.env.DB);
    const project = await db.first<{ userId: string }>(
      'SELECT userId FROM "BrandProject" WHERE id = ?1',
      [projectId],
    );
    if (!project || project.userId !== req.user.id) {
      return fail("Project not found", 404);
    }
    await db.run(
      'DELETE FROM "BrandMilestone" WHERE id = ?1 AND brandProjectId = ?2',
      [milestoneId, projectId],
    );
    return ok({ id: milestoneId });
  } catch (error) {
    console.error("Error deleting brand milestone:", error);
    return errorResponse("Failed to delete milestone", 500, "INTERNAL_ERROR");
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { resolveSessionUser } from "../middleware/session";
import {
  POINTS_ACHIEVEMENT_MANUAL,
  POINTS_SPORT_SESSION,
  dayKeyInPointsZone,
} from "../../../shared/points";
import { refreshPoints } from "../lib/points";

const JSON_HEADERS = { "Content-Type": "application/json" };
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_CHARS = 900_000;

interface SportRow {
  id: string;
  userId: string;
  name: string;
  daysPerWeek: number;
  restSeconds: number;
  durationMonths: number | null;
  untilStopped: number;
  dailyCommitments: number;
  commitmentDays: string | null;
  habitId: string | null;
  active: number;
  startedAt: string;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExerciseRow {
  id: string;
  sportId: string;
  name: string;
  sets: number;
  reps: string;
  orderIndex: number;
}

interface PhotoRow {
  id: string;
  sportId: string;
  image: string;
  label: string | null;
  createdAt: string;
}

interface SessionRow {
  id: string;
  sportId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completedExercises: string | null;
  createdAt: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function unauthorized(): Response {
  return json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401);
}

function parseDays(value: unknown): number[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  }
  if (typeof value === "string") {
    try {
      return parseDays(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function daysLabel(days: number[]): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.map((day) => names[day]).join(", ");
}

async function getSport(db: Database, id: string, userId: string): Promise<SportRow | null> {
  return db.first<SportRow>('SELECT * FROM "Sport" WHERE id = ?1 AND userId = ?2', [id, userId]);
}

async function getExercises(db: Database, sportId: string): Promise<ExerciseRow[]> {
  return db.all<ExerciseRow>(
    'SELECT * FROM "SportExercise" WHERE sportId = ?1 ORDER BY orderIndex ASC, rowid ASC',
    [sportId],
  );
}

async function getPhotos(db: Database, sportId: string): Promise<PhotoRow[]> {
  return db.all<PhotoRow>(
    'SELECT * FROM "SportPhoto" WHERE sportId = ?1 ORDER BY createdAt ASC',
    [sportId],
  );
}

async function getSessions(db: Database, sportId: string): Promise<SessionRow[]> {
  return db.all<SessionRow>(
    'SELECT * FROM "SportSession" WHERE sportId = ?1 ORDER BY startedAt DESC',
    [sportId],
  );
}

function analysisFor(sport: SportRow, sessions: SessionRow[], photos: PhotoRow[]) {
  const totalWorkouts = sessions.length;
  const totalSeconds = sessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds || 0), 0);
  const averageSeconds = totalWorkouts > 0 ? Math.round(totalSeconds / totalWorkouts) : 0;
  const start = new Date(sport.stoppedAt || sport.startedAt || Date.now());
  const startMs = Number.isFinite(start.getTime()) ? start.getTime() : Date.now();
  let plannedEnd = Date.now();
  if (sport.durationMonths && sport.durationMonths > 0) {
    const planned = new Date(startMs);
    planned.setUTCMonth(planned.getUTCMonth() + sport.durationMonths);
    plannedEnd = Math.min(plannedEnd, planned.getTime());
  }
  const daysElapsed = Math.max(1, Math.ceil((plannedEnd - startMs) / DAY_MS));
  const weeksElapsed = Math.max(1, Math.ceil(daysElapsed / 7));
  const plannedSessions = Math.max(1, weeksElapsed * Math.max(1, sport.daysPerWeek));
  const consistency = Math.min(100, Math.round((totalWorkouts / plannedSessions) * 100));
  const firstPhoto = photos[0]
    ? { id: photos[0].id, image: photos[0].image, createdAt: photos[0].createdAt, label: photos[0].label }
    : null;
  const latestPhoto = photos.length > 0
    ? {
        id: photos[photos.length - 1].id,
        image: photos[photos.length - 1].image,
        createdAt: photos[photos.length - 1].createdAt,
        label: photos[photos.length - 1].label,
      }
    : null;
  const finishedInDays = Math.max(1, Math.ceil((new Date(sport.stoppedAt || Date.now()).getTime() - startMs) / DAY_MS));
  return {
    totalWorkouts,
    totalSeconds,
    totalMinutes: Math.round(totalSeconds / 60),
    averageSeconds,
    averageMinutes: Math.round(averageSeconds / 60),
    consistency,
    plannedSessions,
    finishedInDays,
    firstPhoto,
    latestPhoto,
  };
}

async function buildSport(db: Database, sport: SportRow) {
  const exercises = await getExercises(db, sport.id);
  const photos = await getPhotos(db, sport.id);
  const sessions = await getSessions(db, sport.id);
  const analysis = analysisFor(sport, sessions, photos);
  const latest = photos[photos.length - 1];
  const photoDue = Boolean(sport.active) && (!latest || Date.now() - new Date(latest.createdAt).getTime() >= 7 * DAY_MS);
  return {
    ...sport,
    commitmentDays: parseDays(sport.commitmentDays),
    exercises,
    photos,
    sessions,
    analysis,
    photoDue,
  };
}

export async function listSports(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const db = new Database(req.env.DB);
  const sports = await db.all<SportRow>(
    'SELECT * FROM "Sport" WHERE userId = ?1 ORDER BY active DESC, createdAt DESC',
    [req.user.id],
  );
  const result = [];
  for (const sport of sports) result.push(await buildSport(db, sport));
  return json({ data: result });
}

export async function createSport(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const session = await resolveSessionUser(req);
  if (!session.ok) return session.response;
  const body = (req.body ?? {}) as any;
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 60) {
    return json({ error: "Sport name is required (max 60 characters)", code: "VALIDATION_ERROR" }, 400);
  }
  const daysPerWeek = Math.max(1, Math.min(7, Number(body.daysPerWeek) || 3));
  const restSeconds = Math.max(0, Math.min(900, Number(body.restSeconds) || 60));
  const untilStopped = Boolean(body.untilStopped);
  const durationMonths = untilStopped ? null : Math.max(1, Math.min(24, Number(body.durationMonths) || 1));
  const dailyCommitments = Boolean(body.dailyCommitments);
  const commitmentDays = dailyCommitments ? parseDays(body.commitmentDays) : [];
  const exercises = Array.isArray(body.exercises) ? body.exercises : [];
  if (exercises.length === 0) {
    return json({ error: "Add at least one exercise", code: "VALIDATION_ERROR" }, 400);
  }
  if (dailyCommitments && commitmentDays.length === 0) {
    return json({ error: "Pick at least one commitment day", code: "VALIDATION_ERROR" }, 400);
  }
  const firstPhoto =
    typeof body.photo === "string"
      ? body.photo
      : typeof body.firstPhoto === "string"
        ? body.firstPhoto
        : "";
  if (firstPhoto.length > MAX_PHOTO_CHARS) {
    return json({ error: "The photo is too large. Please use a smaller image.", code: "VALIDATION_ERROR" }, 400);
  }

  const db = new Database(req.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let habitId: string | null = null;

  if (dailyCommitments) {
    habitId = crypto.randomUUID();
    await db.run(
      `INSERT INTO "Habit" (id, userId, name, title, description, frequency, targetDays, active, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9)`,
      [
        habitId,
        session.userId,
        `${name} commitment`,
        `${name} commitment`,
        `Daily commitment for ${name} on ${daysLabel(commitmentDays)}`,
        `CUSTOM:${commitmentDays.join(",")}`,
        commitmentDays.length,
        now,
        now,
      ],
    );
  }

  await db.run(
    `INSERT INTO "Sport" (id, userId, name, daysPerWeek, restSeconds, durationMonths, untilStopped, dailyCommitments, commitmentDays, habitId, active, startedAt, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12, ?13)`,
    [
      id,
      session.userId,
      name,
      daysPerWeek,
      restSeconds,
      durationMonths,
      untilStopped ? 1 : 0,
      dailyCommitments ? 1 : 0,
      JSON.stringify(commitmentDays),
      habitId,
      now,
      now,
      now,
    ],
  );
  const batch: Array<{ sql: string; params: unknown[] }> = [];
  exercises.forEach((exercise: any, index: number) => {
    const exerciseName = String(exercise?.name ?? "").trim();
    if (!exerciseName) return;
    batch.push({
      sql: `INSERT INTO "SportExercise" (id, sportId, name, sets, reps, orderIndex) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      params: [
        crypto.randomUUID(),
        id,
        exerciseName.slice(0, 80),
        Math.max(1, Math.min(20, Number(exercise.sets) || 3)),
        String(exercise.reps ?? "10").slice(0, 30),
        index,
      ],
    });
  });
  if (firstPhoto) {
    batch.push({
      sql: `INSERT INTO "SportPhoto" (id, sportId, userId, image, label, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      params: [crypto.randomUUID(), id, session.userId, firstPhoto, "Starting photo", now],
    });
  }
  if (batch.length > 0) await db.batch(batch);
  const sport = await db.first<SportRow>('SELECT * FROM "Sport" WHERE id = ?1', [id]);
  return json({ data: await buildSport(db, sport as SportRow) }, 201);
}

export async function addSportPhoto(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const sport = await getSport(db, id, req.user.id);
  if (!sport) return json({ error: "Sport not found", code: "NOT_FOUND" }, 404);
  const body = (req.body ?? {}) as { image?: string; label?: string };
  const image = typeof body.image === "string" ? body.image : "";
  if (!image) return json({ error: "A photo is required", code: "VALIDATION_ERROR" }, 400);
  if (image.length > MAX_PHOTO_CHARS) {
    return json({ error: "The photo is too large. Please use a smaller image.", code: "VALIDATION_ERROR" }, 400);
  }
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO "SportPhoto" (id, sportId, userId, image, label, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [crypto.randomUUID(), id, req.user.id, image, String(body.label ?? "").slice(0, 60) || "Progress photo", now],
  );
  const photos = await getPhotos(db, id);
  return json({ data: photos }, 201);
}

export async function saveSportSession(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const sport = await getSport(db, id, req.user.id);
  if (!sport) return json({ error: "Sport not found", code: "NOT_FOUND" }, 404);
  const body = (req.body ?? {}) as any;
  const startedAt = new Date(body.startedAt || Date.now());
  const endedAt = new Date(body.endedAt || Date.now());
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt < startedAt) {
    return json({ error: "Invalid workout times", code: "VALIDATION_ERROR" }, 400);
  }
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const completedExercises = Array.isArray(body.completedExercises) ? body.completedExercises.map(String) : [];
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  await db.run(
    `INSERT INTO "SportSession" (id, sportId, userId, startedAt, endedAt, durationSeconds, completedExercises, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      sessionId,
      id,
      req.user.id,
      startedAt.toISOString(),
      endedAt.toISOString(),
      durationSeconds,
      JSON.stringify(completedExercises),
      now,
    ],
  );
  const dayKey = dayKeyInPointsZone(endedAt);
  await db.run(
    `INSERT OR IGNORE INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
     VALUES (?1, ?2, 'EARN', ?3, 'SPORT_SESSION_COMPLETED', ?4, ?5, ?6)`,
    [crypto.randomUUID(), req.user.id, POINTS_SPORT_SESSION, `${id}:${dayKey}`, dayKey, now],
  );
  const points = await refreshPoints(db, req.user.id, [dayKey]);
  const sessions = await getSessions(db, id);
  return json({ data: { sessionId, durationSeconds, sessions }, points }, 201);
}

export async function stopSport(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const sport = await getSport(db, id, req.user.id);
  if (!sport) return json({ error: "Sport not found", code: "NOT_FOUND" }, 404);
  const now = new Date();
  const nowIso = now.toISOString();
  if (sport.active) {
    await db.run('UPDATE "Sport" SET active = 0, stoppedAt = ?1, updatedAt = ?1 WHERE id = ?2', [nowIso, id]);
    if (sport.habitId) {
      await db.run('UPDATE "Habit" SET active = 0, updatedAt = ?1 WHERE id = ?2', [nowIso, sport.habitId]);
    }
  }
  const stopped: SportRow = { ...sport, active: 0, stoppedAt: sport.stoppedAt || nowIso, updatedAt: nowIso };
  const built = await buildSport(db, stopped);
  const analysis = built.analysis;
  const key = `sport_${id}`;
  const description = `Finished in ${analysis.finishedInDays} days Â· ${analysis.totalWorkouts} workouts Â· ${analysis.averageMinutes} min average Â· ${analysis.consistency}% consistency`;
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM "Achievement" WHERE userId = ?1 AND key = ?2',
    [req.user.id, key],
  );
  if (!existing) {
    await db.run(
      `INSERT INTO "Achievement" (id, userId, key, name, description, icon, unlockedAt, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [crypto.randomUUID(), req.user.id, key, `${sport.name} challenge`, description, "ðŸ‹ï¸", nowIso, nowIso],
    );
    await db.run(
      `INSERT OR IGNORE INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
       VALUES (?1, ?2, 'EARN', ?3, 'ACHIEVEMENT', ?4, ?5, ?6)`,
      [
        crypto.randomUUID(),
        req.user.id,
        POINTS_ACHIEVEMENT_MANUAL,
        key,
        dayKeyInPointsZone(now),
        nowIso,
      ],
    );
  } else {
    await db.run('UPDATE "Achievement" SET description = ?1, unlockedAt = ?2 WHERE id = ?3', [
      description,
      nowIso,
      existing.id,
    ]);
  }
  const points = await refreshPoints(db, req.user.id, [dayKeyInPointsZone(now)]);
  return json({ data: built, points });
}

export async function deleteSport(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const sport = await getSport(db, id, req.user.id);
  if (!sport) return json({ error: "Sport not found", code: "NOT_FOUND" }, 404);
  if (sport.habitId) {
    await db.run('DELETE FROM "HabitCompletion" WHERE habitId = ?1', [sport.habitId]);
    await db.run('DELETE FROM "Habit" WHERE id = ?1', [sport.habitId]);
  }
  await db.run('DELETE FROM "PointEvent" WHERE userId = ?1 AND (sourceId LIKE ?2 OR sourceId = ?3)', [
    req.user.id,
    `${id}:%`,
    `sport_${id}`,
  ]);
  await db.run('DELETE FROM "Achievement" WHERE userId = ?1 AND key = ?2', [req.user.id, `sport_${id}`]);
  await db.batch([
    { sql: 'DELETE FROM "SportExercise" WHERE sportId = ?1', params: [id] },
    { sql: 'DELETE FROM "SportPhoto" WHERE sportId = ?1', params: [id] },
    { sql: 'DELETE FROM "SportSession" WHERE sportId = ?1', params: [id] },
    { sql: 'DELETE FROM "Sport" WHERE id = ?1', params: [id] },
  ]);
  return json({ data: { deleted: true } });
}

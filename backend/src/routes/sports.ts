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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"];

/** weekday 0=Sun..6=Sat */
type WorkoutDay = {
  weekday: number;
  title: string;
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    restSec?: number;
  }>;
};

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
  workoutDays: string | null;
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
    return [...new Set(value.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
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

function parseWorkoutDays(value: unknown): WorkoutDay[] {
  if (Array.isArray(value)) {
    return value.map((d: any) => ({
      weekday: Number(d?.weekday) ?? 0,
      title: String(d?.title ?? "").trim(),
      exercises: Array.isArray(d?.exercises)
        ? d.exercises.map((e: any) => ({
            name: String(e?.name ?? "").trim(),
            sets: Math.max(1, Math.min(30, Number(e?.sets) || 3)),
            reps: String(e?.reps ?? "10").trim(),
            restSec: typeof e?.restSec === "number" ? e.restSec : undefined,
          }))
        : [],
    })).filter((d: WorkoutDay) => d.title || d.exercises.length > 0);
  }
  if (typeof value === "string") {
    try {
      return parseWorkoutDays(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function daysLabel(days: number[]): string {
  return days.map((d) => DAY_NAMES[d]).join(", ");
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
  return db.all<PhotoRow>('SELECT * FROM "SportPhoto" WHERE sportId = ?1 ORDER BY createdAt ASC', [sportId]);
}

async function getSessions(db: Database, sportId: string): Promise<SessionRow[]> {
  return db.all<SessionRow>('SELECT * FROM "SportSession" WHERE sportId = ?1 ORDER BY startedAt DESC', [sportId]);
}

function analysisFor(sport: SportRow, sessions: SessionRow[], photos: PhotoRow[]) {
  const totalWorkouts = sessions.length;
  const totalSeconds = sessions.reduce((sum, s) => sum + Math.max(0, s.durationSeconds || 0), 0);
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
  const latest = photos[photos.length - 1];
  const first = photos[0];
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
    firstPhoto: first ? { id: first.id, image: first.image, createdAt: first.createdAt, label: first.label } : null,
    latestPhoto: latest ? { id: latest.id, image: latest.image, createdAt: latest.createdAt, label: latest.label } : null,
  };
}

async function buildSport(db: Database, sport: SportRow) {
  const exercises = await getExercises(db, sport.id);
  const photos = await getPhotos(db, sport.id);
  const sessions = await getSessions(db, sport.id);
  const analysis = analysisFor(sport, sessions, photos);
  const latest = photos[photos.length - 1];
  const photoDue = Boolean(sport.active) && (!latest || Date.now() - new Date(latest.createdAt).getTime() >= 7 * DAY_MS);
  const workoutDays = parseWorkoutDays(sport.workoutDays);
  // Migrate legacy flat exercises onto first workout day if no structured days exist
  if (workoutDays.length === 0 && exercises.length > 0) {
    const days = parseDays(sport.commitmentDays);
    const primaryDay = days.length > 0 ? days[0] : 1; // default Tuesday
    workoutDays.push({
      weekday: primaryDay,
      title: "",
      exercises: exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })),
    });
  }
  return {
    ...sport,
    commitmentDays: parseDays(sport.commitmentDays),
    workoutDays,
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
  const sports = await db.all<SportRow>('SELECT * FROM "Sport" WHERE userId = ?1 ORDER BY active DESC, createdAt DESC', [req.user.id]);
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
  const firstPhoto =
    typeof body.photo === "string"
      ? body.photo
      : typeof body.firstPhoto === "string"
        ? body.firstPhoto
        : "";
  if (firstPhoto.length > MAX_PHOTO_CHARS) {
    return json({ error: "The photo is too large. Please use a smaller image.", code: "VALIDATION_ERROR" }, 400);
  }

  // Parse per-day workout plan
  const workoutDaysRaw = body.workoutDays;
  let workoutDaysJson: string | null = null;
  if (Array.isArray(workoutDaysRaw)) {
    const validated: WorkoutDay[] = workoutDaysRaw.map((d: any) => ({
      weekday: Math.max(0, Math.min(6, Number(d?.weekday) || 0)),
      title: String(d?.title ?? "").trim(),
      exercises: (Array.isArray(d?.exercises) ? d.exercises : []).map((e: any) => ({
        name: String(e?.name ?? "").trim(),
        sets: Math.max(1, Math.min(20, Number(e?.sets) || 3)),
        reps: String(e?.reps ?? "10").trim(),
        restSec: typeof e?.restSec === "number" ? e.restSec : undefined,
      })).filter((e: any) => e.name),
    })).filter((d: WorkoutDay) => d.title || d.exercises.length > 0);
    if (validated.length > 0) workoutDaysJson = JSON.stringify(validated);
  }

  // Legacy flat exercises fallback
  const exercises = Array.isArray(body.exercises) ? body.exercises : [];
  if (workoutDaysJson === null && exercises.length === 0) {
    return json({ error: "Add at least one exercise (either in workoutDays or exercises)", code: "VALIDATION_ERROR" }, 400);
  }

  if (dailyCommitments && commitmentDays.length === 0) {
    return json({ error: "Pick at least one commitment day", code: "VALIDATION_ERROR" }, 400);
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
        habitId, session.userId, `${name} commitment`, `${name} commitment`,
        `Daily commitment for ${name} on ${daysLabel(commitmentDays)}`,
        `CUSTOM:${commitmentDays.join(",")}`, commitmentDays.length, now, now,
      ],
    );
  }

  await db.run(
    `INSERT INTO "Sport" (id, userId, name, daysPerWeek, restSeconds, durationMonths, untilStopped, dailyCommitments,
     commitmentDays, habitId, active, startedAt, workoutDays, createdAt, updatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12, ?13, ?14)`,
    [
      id, session.userId, name, daysPerWeek, restSeconds, durationMonths,
      untilStopped ? 1 : 0, dailyCommitments ? 1 : 0, JSON.stringify(commitmentDays),
      habitId, now, workoutDaysJson, now, now,
    ],
  );

  // Migrate legacy flat exercises into first workout day if no structured plan
  if (workoutDaysJson === null && exercises.length > 0) {
    const days = parseDays(body.commitmentDays);
    const primaryDay = days.length > 0 ? days[0] : 1;
    const plan: WorkoutDay[] = [{
      weekday: primaryDay,
      title: "",
      exercises: exercises
        .filter((e: any) => String(e?.name ?? "").trim())
        .map((e: any, i: number) => ({
          name: String(e.name ?? "").trim(),
          sets: Math.max(1, Math.min(20, Number(e.sets) || 3)),
          reps: String(e.reps ?? "10").trim(),
        })),
    }];
    workoutDaysJson = JSON.stringify(plan);
    await db.run('UPDATE "Sport" SET workoutDays = ?1 WHERE id = ?2', [workoutDaysJson, id]);
    // Insert legacy SportExercise rows for compatibility
    const batch: Array<{ sql: string; params: unknown[] }> = exercises
      .filter((e: any) => String(e?.name ?? "").trim())
      .map((e: any, i: number) => ({
        sql: `INSERT INTO "SportExercise" (id, sportId, name, sets, reps, orderIndex) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        params: [crypto.randomUUID(), id, String(e.name).trim(), Math.max(1, Math.min(20, Number(e.sets) || 3)), String(e.reps ?? "10").trim(), i],
      }));
    if (batch.length > 0) await db.batch(batch);
  }

  if (firstPhoto) {
    await db.run(
      `INSERT INTO "SportPhoto" (id, sportId, userId, image, label, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      [crypto.randomUUID(), id, session.userId, firstPhoto, "Starting photo", now],
    );
  }

  const sport = await db.first<SportRow>('SELECT * FROM "Sport" WHERE id = ?1', [id]);
  return json({ data: await buildSport(db, sport as SportRow) }, 201);
}

export async function updateWorkoutDays(req: AppRequest): Promise<Response> {
  if (!req.user) return unauthorized();
  const { id } = req.params;
  const db = new Database(req.env.DB);
  const sport = await getSport(db, id, req.user.id);
  if (!sport) return json({ error: "Sport not found", code: "NOT_FOUND" }, 404);
  const body = (req.body ?? {}) as any;
  const workoutDaysRaw = body.workoutDays;
  if (!Array.isArray(workoutDaysRaw)) {
    return json({ error: "workoutDays must be an array", code: "VALIDATION_ERROR" }, 400);
  }
  const validated: WorkoutDay[] = workoutDaysRaw.map((d: any) => ({
    weekday: Math.max(0, Math.min(6, Number(d?.weekday) || 0)),
    title: String(d?.title ?? "").trim(),
    exercises: (Array.isArray(d?.exercises) ? d.exercises : []).map((e: any) => ({
      name: String(e?.name ?? "").trim(),
      sets: Math.max(1, Math.min(20, Number(e?.sets) || 3)),
      reps: String(e?.reps ?? "10").trim(),
      restSec: typeof e?.restSec === "number" ? e.restSec : undefined,
    })).filter((e: any) => e.name),
  })).filter((d: WorkoutDay) => d.title || d.exercises.length > 0);

  if (validated.length === 0) {
    return json({ error: "At least one training day with content is required", code: "VALIDATION_ERROR" }, 400);
  }

  const now = new Date().toISOString();
  await db.run('UPDATE "Sport" SET workoutDays = ?1, updatedAt = ?2 WHERE id = ?3', [JSON.stringify(validated), now, id]);
  const updated = await db.first<SportRow>('SELECT * FROM "Sport" WHERE id = ?1', [id]);
  return json({ data: await buildSport(db, updated as SportRow) });
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
    [sessionId, id, req.user.id, startedAt.toISOString(), endedAt.toISOString(), durationSeconds, JSON.stringify(completedExercises), now],
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
  const description = `Finished in ${analysis.finishedInDays} days · ${analysis.totalWorkouts} workouts · ${analysis.averageMinutes} min average · ${analysis.consistency}% consistency`;
  const existing = await db.first<{ id: string }>('SELECT id FROM "Achievement" WHERE userId = ?1 AND key = ?2', [req.user.id, key]);
  if (!existing) {
    await db.run(
      `INSERT INTO "Achievement" (id, userId, key, name, description, icon, unlockedAt, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [crypto.randomUUID(), req.user.id, key, `${sport.name} challenge`, description, "\u{1F3C6}", nowIso, nowIso],
    );
    await db.run(
      `INSERT OR IGNORE INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
       VALUES (?1, ?2, 'EARN', ?3, 'ACHIEVEMENT', ?4, ?5, ?6)`,
      [crypto.randomUUID(), req.user.id, POINTS_ACHIEVEMENT_MANUAL, key, dayKeyInPointsZone(now), nowIso],
    );
  } else {
    await db.run('UPDATE "Achievement" SET description = ?1, unlockedAt = ?2 WHERE id = ?3', [description, nowIso, existing.id]);
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
    req.user.id, `${id}:%`, `sport_${id}`,
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

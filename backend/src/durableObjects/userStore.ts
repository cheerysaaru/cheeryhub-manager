// Per-user store, backed by SQLite. Pure functions over a tiny Sql interface so
// the exact same logic runs inside the Durable Object (workerd) and in Vitest
// (node:sqlite). Each user owns one UserDO whose SQLite holds an `entities`
// table: (type, id) -> row JSON. One row per entity, never mixed between users.

export interface Sql {
  /** Run a statement with no bind params (DDL). */
  exec(sql: string): unknown;
  /** SELECT -> rows as plain objects. */
  query<T>(sql: string, params?: unknown[]): T[];
  /** INSERT/UPDATE/DELETE with bind params. */
  run(sql: string, params?: unknown[]): unknown;
}

export function initStore(sql: Sql): void {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS entities (
       type TEXT NOT NULL,
       id TEXT NOT NULL,
       data TEXT NOT NULL,
       updatedAt TEXT,
       PRIMARY KEY (type, id)
     )`,
  );
  sql.exec("CREATE INDEX IF NOT EXISTS entities_type_idx ON entities(type)");
}

/** Entity types the DO stores (per-user, single-user scope). */
export const ENTITY_TYPES = [
  "tasks",
  "habits",
  "habit_completions",
  "habit_day_events",
  "goals",
  "goal_milestones",
  "skills",
  "projects",
  "project_milestones",
  "transactions",
  "achievements",
  "point_events",
  "xp_transactions",
  "settings",
] as const;

export function list<T>(sql: Sql, type: string): T[] {
  return sql
    .query<{ data: string }>(
      "SELECT data FROM entities WHERE type = ? ORDER BY rowid DESC",
      [type],
    )
    .map((row) => JSON.parse(row.data) as T);
}

export function get<T>(sql: Sql, type: string, id: string): T | null {
  const row = sql.query<{ data: string }>(
    "SELECT data FROM entities WHERE type = ? AND id = ?",
    [type, id],
  )[0];
  return row ? (JSON.parse(row.data) as T) : null;
}

export function put(
  sql: Sql,
  type: string,
  row: Record<string, unknown>,
): void {
  const id = String(row.id);
  sql.run(
    "INSERT OR REPLACE INTO entities (type, id, data, updatedAt) VALUES (?, ?, ?, ?)",
    [type, id, JSON.stringify(row), new Date().toISOString()],
  );
}

export function remove(sql: Sql, type: string, id: string): void {
  sql.run("DELETE FROM entities WHERE type = ? AND id = ?", [type, id]);
}

export function getCounts(sql: Sql): Record<string, number> {
  const rows = sql.query<{ type: string; n: number }>(
    "SELECT type, COUNT(*) AS n FROM entities GROUP BY type",
  );
  const out: Record<string, number> = {};
  for (const t of ENTITY_TYPES) out[t] = 0;
  for (const row of rows) out[row.type] = row.n;
  return out;
}

export interface ImportResult {
  imported: Record<string, number>;
  skipped: Record<string, number>;
}

// rows keyed by entity type; rows must each have an `id`. Idempotent
// (INSERT OR REPLACE keyed by type+id).
export function importAll(
  sql: Sql,
  data: Record<string, Array<Record<string, unknown>>>,
): ImportResult {
  initStore(sql);
  const imported: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  for (const [type, rows] of Object.entries(data)) {
    if (!Array.isArray(rows)) continue;
    imported[type] = 0;
    skipped[type] = 0;
    for (const row of rows) {
      if (!row || typeof row !== "object" || row.id == null) {
        skipped[type] += 1;
        continue;
      }
      put(sql, type, row);
      imported[type] += 1;
    }
  }
  return { imported, skipped };
}

/** Net points across the point-events ledger (positive earn, negative spend). */
export function totalPoints(sql: Sql): number {
  const rows = sql.query<{ data: string }>(
    "SELECT data FROM entities WHERE type = ?",
    ["point_events"],
  );
  return rows.reduce((sum, r) => {
    const e = JSON.parse(r.data) as { amount?: number; delta?: number };
    const v = typeof e.amount === "number" ? e.amount : e.delta;
    return sum + (typeof v === "number" ? v : 0);
  }, 0);
}

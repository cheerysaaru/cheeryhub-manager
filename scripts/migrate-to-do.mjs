#!/usr/bin/env node
/**
 * Migrate per-user rows from a backup into each user's Durable Object.
 *
 *   node scripts/migrate-to-do.mjs --source backups/<timestamp> --dry-run
 *   node scripts/migrate-to-do.mjs --source backups/<timestamp> --real \
 *       --api https://api.cheeryhub.space/api --secret "$MIGRATION_SECRET"
 *
 * --dry-run (default) is local-only: it reads the backup JSON and prints the
 * per-user, per-table counts that would land in each DO. It never writes.
 * --real posts the roster to the worker's /api/internal/migrate route, which
 * imports into each DO and FAILS (409) if any written count mismatches the
 * backup. This script never contacts production unless --api points there.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const get = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

const source = get("source", "");
const dryRun = !flag("real");
const api = get("api", "http://127.0.0.1:8787/api");
const secret = get("secret", process.env.MIGRATION_SECRET ?? "");

if (!source) {
  console.error(
    "Usage: scripts/migrate-to-do.mjs --source <backup-dir> [--dry-run|--real] [--api URL] [--secret S]",
  );
  process.exit(1);
}
const dir = path.resolve(source);
if (!fs.existsSync(dir)) {
  console.error(`Backup dir not found: ${dir}`);
  process.exit(1);
}

// Load the backup: User.json (registry) + one JSON array per table.
const users = JSON.parse(fs.readFileSync(path.join(dir, "User.json"), "utf8"));
const tables = fs
  .readdirSync(dir)
  .filter(
    (f) => f.endsWith(".json") && f !== "User.json" && f !== "_manifest.json",
  )
  .map((f) => f.replace(/\.json$/, ""));

const rowsByTable = {};
for (const t of tables) {
  rowsByTable[t] = JSON.parse(
    fs.readFileSync(path.join(dir, `${t}.json`), "utf8"),
  );
}

const USER_OWNED = [
  "Task",
  "Habit",
  "HabitCompletion",
  "HabitDayEvent",
  "Goal",
  "GoalMilestone",
  "Skill",
  "BrandProject",
  "BrandMilestone",
  "Transaction",
  "Achievement",
  "PointEvent",
  "XPTransaction",
  "FocusSession",
  "JournalEntry",
  "Reminder",
];
const snake = (t) => t.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

// Group every owned row under its owner's user id.
const perUser = {};
for (const table of USER_OWNED) {
  const rows = rowsByTable[table] ?? [];
  for (const row of rows) {
    const uid = row.userId ?? row.id;
    if (!uid) continue;
    perUser[uid] ??= {};
    (perUser[uid][snake(table)] ??= []).push(row);
  }
}

const report = {};
for (const u of users) {
  report[u.id] = perUser[u.id] ?? {};
}

function countsOf(data) {
  const c = {};
  for (const [t, rows] of Object.entries(data)) c[t] = rows.length;
  return c;
}

const perUserCounts = Object.fromEntries(
  Object.entries(report).map(([id, data]) => [id, countsOf(data)]),
);

console.log(dryRun ? "== DRY RUN (no writes) ==" : "== REAL MIGRATION ==");
console.log(`Source: ${dir}`);
console.table(perUserCounts);

if (dryRun) {
  const roster = Object.entries(report).map(([id, data]) => ({ id, data }));
  process.stdout.write(
    "\nDry-run complete. Re-run with --real to write into Durable Objects after confirmation.\n",
  );
  // Keep roster available for the real call below.
  globalThis.__roster = roster;
  if (flag("print-json")) console.log(JSON.stringify({ users: roster }));
  process.exit(0);
}

if (!secret) {
  console.error("MIGRATION_SECRET is required for --real (env or --secret).");
  process.exit(1);
}
const roster = Object.entries(report).map(([id, data]) => ({ id, data }));
const res = await fetch(`${api}/internal/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-migration-secret": secret },
  body: JSON.stringify({ users: roster, dryRun: false }),
});
const body = await res.json().catch(() => null);
if (!res.ok) {
  console.error(
    `Migration stopped: HTTP ${res.status}`,
    JSON.stringify(body, null, 2),
  );
  process.exit(2);
}
console.log("Migration OK. Written per user/table:");
console.log(JSON.stringify(body.written, null, 2));
if (Array.isArray(body?.mismatches) && body.mismatches.length) {
  console.error("Count mismatches detected:", body.mismatches);
  process.exit(2);
}
console.log("All counts match the backup.");

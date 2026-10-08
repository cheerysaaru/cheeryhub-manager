#!/usr/bin/env node
/**
 * purge-user-data.mjs — delete all regular users and their related rows from
 * the local D1 database in foreign-key-safe order. It NEVER drops tables or the
 * schema; it only deletes rows.
 *
 * Usage:
 *   node scripts/purge-user-data.mjs --dry-run          # print per-table counts only
 *   node scripts/purge-user-data.mjs --dry-run --db cheeryhub-staging-db
 *   node scripts/purge-user-data.mjs --yes              # ACTUALLY delete (children first)
 *
 * The admin is not stored in the "User" table, so deleting all User rows does
 * not remove the admin. This targets the LOCAL database used by `wrangler dev`.
 * Add `--remote` only with extreme care.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_CLI = path.join(
  ROOT,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const BACKEND_DIR = path.join(ROOT, "backend");
const BACKUPS_DIR = path.join(ROOT, "backups");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const get = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : fallback;
};

const dryRun = flag("dry-run");
const confirmed = flag("yes");
const remote = flag("remote");
const exportOnly = flag("export");
const db = get("db", "cheeryhub-staging-db");
const env = get("env", "staging");

// Child-first order: a row is deleted before the row it depends on.
const TABLES = [
  "HabitCompletion",
  "HabitDayEvent",
  "TaskCheckIn",
  "FocusSession",
  "JournalEntry",
  "Reminder",
  "XPTransaction",
  "DailyStats",
  "PasswordReset",
  "Notification",
  "Achievement",
  "Transaction",
  "GoalMilestone",
  "BrandMilestone",
  "Task",
  "Habit",
  "Goal",
  "Skill",
  "BrandProject",
  "UserSettings",
  "User",
];

function wranglerD1(sql) {
  const args = [
    WRANGLER_CLI,
    "d1",
    "execute",
    db,
    remote ? "--remote" : "--local",
    "--env",
    env,
    "--command",
    sql,
  ];
  try {
    const out = execFileSync(process.execPath, args, {
      cwd: BACKEND_DIR,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
    });
    // wrangler prints a banner to stdout before the JSON array; slice the array.
    const start = out.indexOf("[");
    const end = out.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("no JSON array in wrangler output");
    }
    return JSON.parse(out.slice(start, end + 1));
  } catch (error) {
    const stderr = error.stderr?.toString?.() ?? "";
    throw new Error(`wrangler d1 execute failed: ${stderr || error.message}`);
  }
}

function counts() {
  const sql = TABLES.map(
    (t) => `SELECT '${t}' AS tbl, COUNT(*) AS n FROM "${t}";`,
  ).join("\n");
  const results = wranglerD1(sql);
  const map = {};
  for (const chunk of results) {
    for (const row of chunk.results ?? []) map[row.tbl] = row.n;
  }
  return TABLES.map((t) => ({ table: t, n: map[t] ?? 0 }));
}

/** Dump every user-owned table to backups/<timestamp>.json and return the path. */
function exportBackup() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const sql = TABLES.map((t) => `SELECT * FROM "${t}";`).join("\n");
  const results = wranglerD1(sql);
  const data = {};
  TABLES.forEach((t, i) => {
    data[t] = results[i]?.results ?? [];
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUPS_DIR, `user-data-backup-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ db, exportedAt: new Date().toISOString(), data }, null, 2),
  );
  return file;
}

console.log(`Database: ${db} (${remote ? "remote" : "local"})`);

if (exportOnly) {
  const file = exportBackup();
  console.log(`Backup written to ${file}`);
  process.exit(0);
}

const rows = counts();
let total = 0;
for (const { table, n } of rows) {
  total += n;
  console.log(`  ${table.padEnd(18)} ${n}`);
}
console.log(`TOTAL rows (user-owned tables): ${total}`);

if (dryRun) {
  console.log("\n--dry-run: no rows were deleted.");
  process.exit(0);
}

if (total === 0) {
  console.log("\nNothing to delete.");
  process.exit(0);
}

if (!confirmed) {
  console.error(
    "\nRefusing to delete without --yes. Re-run with `--yes` after you confirm.",
  );
  console.error(
    "Tip: run `node scripts/purge-user-data.mjs --dry-run` first to review counts.",
  );
  process.exit(1);
}

// Always back up before any destructive run.
const backupFile = exportBackup();
console.log(`Backup written to ${backupFile}`);

// Delete children-first in one batch.
const sql = TABLES.map((t) => `DELETE FROM "${t}";`).join("\n");
wranglerD1(`PRAGMA foreign_keys=ON;\n${sql}`);
console.log(`\nDeleted ${total} rows across ${TABLES.length} tables.`);

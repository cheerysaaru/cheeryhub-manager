// One-off: generate idempotent DDL (CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN)
// from backend/migrations/*.sql + the 0006 additions, and write it into
// src/db/bootstrap.ts. Keeps the deployed worker's schema source of truth.
import fs from "node:fs";
import path from "node:path";

const MIG = path.resolve("backend/migrations");
const files = fs
  .readdirSync(MIG)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const createTables = [];
const addColumns = [];

function stripStatement(sql) {
  // Remove trailing semicolon and leading SQL comments/whitespace.
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .trim()
    .replace(/;\s*$/, "");
}

for (const f of files) {
  const content = fs.readFileSync(path.join(MIG, f), "utf8");
  // CREATE TABLE statements (handles nested parens/commas by scanning).
  const re = /CREATE TABLE(?: IF NOT EXISTS)?\s+"([^"]+)"\s*\(/g;
  let m;
  while ((m = re.exec(content))) {
    const table = m[1];
    const startIdx = m.index;
    // find matching close paren for the table body
    let depth = 0;
    let i = content.indexOf("(", startIdx);
    let end = i;
    for (; i < content.length; i++) {
      if (content[i] === "(") depth++;
      else if (content[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const header = content.slice(startIdx, end + 1);
    const stmt = stripStatement(header).replace(
      /CREATE TABLE(?! IF NOT EXISTS)/,
      "CREATE TABLE IF NOT EXISTS",
    );
    createTables.push(stmt);
  }
  // ALTER TABLE "X" ADD COLUMN "y" ...
  const alt = /ALTER TABLE "([^"]+)" ADD COLUMN "([^"]+)" ([^;]+);/g;
  let a;
  while ((a = alt.exec(content))) {
    addColumns.push({
      table: a[1],
      column: a[2],
      ddl: `ALTER TABLE "${a[1]}" ADD COLUMN "${a[2]}" ${a[3].trim()}`,
    });
  }
}

// 0006 additions (mirror prisma/migrations/0006 + prior manual apply).
const extraColumns = [
  {
    table: "Habit",
    column: "title",
    ddl: 'ALTER TABLE "Habit" ADD COLUMN "title" TEXT',
  },
  {
    table: "Habit",
    column: "targetDays",
    ddl: 'ALTER TABLE "Habit" ADD COLUMN "targetDays" INTEGER NOT NULL DEFAULT 7',
  },
  {
    table: "Goal",
    column: "targetDate",
    ddl: 'ALTER TABLE "Goal" ADD COLUMN "targetDate" DATETIME',
  },
  {
    table: "Goal",
    column: "deadline",
    ddl: 'ALTER TABLE "Goal" ADD COLUMN "deadline" DATETIME',
  },
  {
    table: "Skill",
    column: "level",
    ddl: 'ALTER TABLE "Skill" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1',
  },
  {
    table: "Skill",
    column: "description",
    ddl: 'ALTER TABLE "Skill" ADD COLUMN "description" TEXT',
  },
];
const extraTables = [
  `CREATE TABLE IF NOT EXISTS "Achievement" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "icon" TEXT, "unlockedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
];
// de-dupe by table name
const seen = new Set();
const tables = [...createTables];
for (const t of createTables) {
  const name = /"([^"]+)"/.exec(t)?.[1];
  if (name) seen.add(name);
}
for (const t of extraTables) {
  const name = /"([^"]+)"/.exec(t)?.[1];
  if (!seen.has(name)) {
    tables.push(t);
    seen.add(name);
  }
}
const cols = [...addColumns];
const colSeen = new Set(addColumns.map((c) => `${c.table}.${c.column}`));
for (const c of extraColumns) {
  const k = `${c.table}.${c.column}`;
  if (!colSeen.has(k)) {
    cols.push(c);
    colSeen.add(k);
  }
}

// Filter COLUMNS whose table has a UNIQUE index etc. are fine as ADD COLUMN.
const ts = `// AUTO-GENERATED from backend/migrations/*.sql + 0006 additions.
// Idempotent schema bootstrap: run once per isolate on cold start so the
// deployed worker is correct even when the D1 migration step could not run.
const CREATE_TABLES = ${JSON.stringify(tables, null, 2)};

const ADD_COLUMNS = ${JSON.stringify(cols, null, 2)};

let bootstrapped = null;

export function ensureSchema(db) {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      for (const stmt of CREATE_TABLES) {
        try { await db.prepare(stmt).run(); } catch { /* exists */ }
      }
      for (const { ddl } of ADD_COLUMNS) {
        try { await db.prepare(ddl).run(); } catch { /* duplicate column */ }
      }
      try {
        await db.prepare('UPDATE "Habit" SET "title" = "name" WHERE "title" IS NULL').run();
      } catch { /* ignore */ }
    })();
  }
  return bootstrapped;
}
`;

fs.writeFileSync(path.resolve("src_generated_bootstrap.ts"), ts);
console.log("tables:", tables.length, "addColumns:", cols.length);
console.log(
  tables
    .map((t) => (/CREATE TABLE IF NOT EXISTS "([^"]+)"/.exec(t) || [])[1])
    .join(", "),
);

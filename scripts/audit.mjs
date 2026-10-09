// Read-only audit of the local D1 SQLite file for the per-user-DO migration.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dir = "backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sqlite") && f.startsWith("fc5b"))
  .map((f) => path.join(dir, f))[0];

const db = new DatabaseSync(file, { readOnly: true });

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  )
  .all()
  .map((r) => r.name);

const lines = [];
lines.push("# Audit before per-user Durable Object migration");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Source (local D1): ${file}`);
lines.push("");
lines.push("## Tables and row counts");
lines.push("");
lines.push("| Table | Rows |");
lines.push("| --- | --- |");
const counts = {};
for (const t of tables) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  counts[t] = n;
  lines.push(`| ${t} | ${n} |`);
}

// Users
lines.push("");
lines.push("## Users");
lines.push("");
lines.push(
  "| id | name | email | role | status | createdAt | lastLoginAt | tasks | commitments | goals | achievements | pointEvents |",
);
lines.push(
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
);
let users = [];
if (counts["User"]) {
  users = db.prepare('SELECT * FROM "User"').all();
}
const colCount = (table, uidCol, uid) => {
  if (!counts[table]) return 0;
  try {
    return db
      .prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE "${uidCol}" = ?`)
      .get(uid).n;
  } catch {
    return -1;
  }
};
for (const u of users) {
  const taskN = colCount("Task", "userId", u.id);
  const habitN = colCount("Habit", "userId", u.id);
  const goalN = colCount("Goal", "userId", u.id);
  const achN = colCount("Achievement", "userId", u.id);
  const peN = colCount("PointEvent", "userId", u.id);
  lines.push(
    `| ${u.id} | ${u.name ?? ""} | ${u.email ?? ""} | ${u.role ?? ""} | ${u.status ?? ""} | ${u.createdAt ?? ""} | ${u.lastLoginAt ?? ""} | ${taskN} | ${habitN} | ${goalN} | ${achN} | ${peN} |`,
  );
}

const out = lines.join("\n") + "\n";
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/audit-before-migration.md", out);
console.log(out);

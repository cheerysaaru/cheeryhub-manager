// Export every table of the local D1 SQLite file to backups/<timestamp>/*.json.
// Non-destructive. Abort if nothing to export.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dir = "backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const src = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sqlite") && f.startsWith("fc5b"))
  .map((f) => path.join(dir, f))[0];
if (!src) {
  console.error("No local D1 sqlite file found.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join("backups", stamp);
fs.mkdirSync(outDir, { recursive: true });

const db = new DatabaseSync(src, { readOnly: true });
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
  )
  .all()
  .map((r) => r.name);

let total = 0;
for (const t of tables) {
  const rows = db.prepare(`SELECT * FROM "${t}"`).all();
  fs.writeFileSync(
    path.join(outDir, `${t}.json`),
    JSON.stringify(rows, null, 2),
  );
  total += rows.length;
  console.log(`${t}: ${rows.length} rows`);
}
fs.writeFileSync(
  path.join(outDir, "_manifest.json"),
  JSON.stringify(
    {
      source: src,
      generatedAt: new Date().toISOString(),
      tables,
      totalRows: total,
    },
    null,
    2,
  ),
);
console.log(`\nBacked up ${tables.length} tables (${total} rows) to ${outDir}`);

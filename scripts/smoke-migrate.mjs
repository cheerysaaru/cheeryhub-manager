// Non-destructive runtime smoke: dry-run the migration route (no DO writes),
// then confirm the worker rejects a bad secret.
const API = "http://127.0.0.1:8787/api";
const payload = {
  users: [{ id: "smoke-user", data: { tasks: [{ id: "t1", title: "x" }] } }],
  dryRun: true,
};
const ok = await fetch(`${API}/internal/migrate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-migration-secret": "local-migration-secret",
  },
  body: JSON.stringify(payload),
});
console.log("dry-run migrate:", ok.status, JSON.stringify(await ok.json()));
const bad = await fetch(`${API}/internal/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-migration-secret": "nope" },
  body: JSON.stringify(payload),
});
console.log("bad secret:", bad.status, await bad.text());

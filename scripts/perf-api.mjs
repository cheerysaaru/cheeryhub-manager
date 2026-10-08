/**
 * API latency harness. Logs in, then times every hot GET endpoint (plus two
 * representative mutations) and reports p50/p95/max.
 * Run: node scripts/perf-api.mjs [BASE_URL]
 */
const BASE =
  process.argv[2] ?? process.env.PERF_BASE ?? "http://localhost:4000";
const EMAIL = process.env.PERF_EMAIL ?? "perf@local.test";
const PASSWORD = process.env.PERF_PASSWORD ?? "PerfPass123!";
const WARMUP = 3;
const RUNS = 30;

const GET_ENDPOINTS = [
  "/api/auth/me",
  "/api/tasks",
  "/api/habits",
  "/api/goals",
  "/api/skills",
  "/api/reminders",
  "/api/brand",
  "/api/notifications",
  "/api/analytics",
  "/api/xp",
  "/api/streaks",
  "/api/transactions",
  "/api/transactions/report/weekly",
  "/api/transactions/report/monthly",
  "/api/journal",
  "/api/focus/history",
  "/api/settings",
];

async function login() {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(
      `login failed: ${response.status} ${await response.text()}`,
    );
  }
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.find((c) => c.startsWith("auth_token="));
  if (!cookie) throw new Error("no auth_token cookie in login response");
  return cookie.split(";")[0];
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

async function timeEndpoint(cookie, method, path, body) {
  const durations = [];
  let status = 0;
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const started = performance.now();
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        cookie,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    await response.arrayBuffer();
    const elapsed = performance.now() - started;
    status = response.status;
    if (i >= WARMUP) durations.push(elapsed);
  }
  durations.sort((a, b) => a - b);
  return {
    method,
    path,
    status,
    p50: +percentile(durations, 50).toFixed(1),
    p95: +percentile(durations, 95).toFixed(1),
    max: +durations[durations.length - 1].toFixed(1),
  };
}

const only = process.argv[3]
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const endpoints = only
  ? GET_ENDPOINTS.filter((p) => only.includes(p))
  : GET_ENDPOINTS;
const includePost = !only || only.includes("/api/tasks");

const cookie = await login();
const results = [];

for (const path of endpoints) {
  results.push(await timeEndpoint(cookie, "GET", path));
}

// Mutations: create a task (and leave it — this runs against perf.db).
if (includePost) {
  results.push(
    await timeEndpoint(cookie, "POST", "/api/tasks", {
      title: `Perf probe ${Date.now()}`,
      priority: "MEDIUM",
    }),
  );
}

results.sort((a, b) => b.p95 - a.p95);

console.log(`\nBASE=${BASE}  warmup=${WARMUP} runs=${RUNS}\n`);
console.log("method  p50ms  p95ms  maxms  status  endpoint");
for (const r of results) {
  console.log(
    `${r.method.padEnd(7)} ${String(r.p50).padStart(5)} ${String(r.p95).padStart(6)} ${String(r.max).padStart(6)}  ${String(r.status).padEnd(6)} ${r.path}`,
  );
}

const overBudget = results.filter((r) => r.p95 > 200);
console.log(`\nOver 200ms p95 target: ${overBudget.length}/${results.length}`);

// Verifies every dashboard API call through the Vite dev proxy (5173) and
// reports method, URL, status, and the real server message.
const BASE = process.env.API ?? "http://localhost:5173/api"; // via Vite proxy
const DIRECT = process.env.DIRECT ?? "http://127.0.0.1:8787/api"; // direct to worker

async function req(base, method, path, token, body) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = null;
  try {
    d = await r.json();
  } catch {
    d = null;
  }
  const msg =
    d && d.error && typeof d.error === "object" && d.error.message
      ? d.error.message
      : typeof d?.error === "string"
        ? d.error
        : d?.data !== undefined
          ? "data"
          : "";
  return { status: r.status, msg: String(msg).slice(0, 70), data: d };
}

const email = `proxy_${Date.now()}@example.com`;
await req(DIRECT, "POST", "/auth/register", null, {
  name: "Proxy",
  email,
  password: "password123",
  timezone: "UTC",
});
const token = (
  await req(DIRECT, "POST", "/auth/login", null, {
    email,
    password: "password123",
  })
).data?.data?.token;

const report = (m, p, r) =>
  console.log(`${m.padEnd(6)} ${p.padEnd(38)} ${r.status}  ${r.msg}`);

console.log("== dashboard reads (through Vite proxy 5173) ==");
for (const p of [
  "/tasks",
  "/habits",
  "/analytics",
  "/xp",
  "/streaks",
  "/notifications",
]) {
  report("GET", p, await req(BASE, "GET", p, token));
}

console.log("== add task (POST) + complete (PATCH) ==");
const task = await req(BASE, "POST", "/tasks", token, {
  title: "Proxy Task",
  priority: "MEDIUM",
});
report("POST", "/tasks", task);
const tid = task.data?.data?.id;
report(
  "PATCH",
  `/tasks/${tid}/complete`,
  await req(BASE, "PATCH", `/tasks/${tid}/complete`, token),
);
report(
  "POST",
  `/tasks/${tid}/mark-not-completed`,
  await req(BASE, "POST", `/tasks/${tid}/mark-not-completed`, token),
);
report(
  "POST",
  `/tasks/${tid}/timer/start`,
  await req(BASE, "POST", `/tasks/${tid}/timer/start`, token),
);
report(
  "POST",
  `/tasks/${tid}/timer/stop`,
  await req(BASE, "POST", `/tasks/${tid}/timer/stop`, token),
);

console.log("== add commitment (POST) + check-in states ==");
const habit = await req(BASE, "POST", "/habits", token, {
  name: "Proxy Commitment",
  frequency: "daily",
});
report("POST", "/habits", habit);
const hid = habit.data?.data?.id;
report(
  "POST",
  `/habits/${hid}/complete`,
  await req(BASE, "POST", `/habits/${hid}/complete`, token, {
    date: new Date().toISOString().split("T")[0],
  }),
);
report(
  "POST",
  `/habits/${hid}/fail`,
  await req(BASE, "POST", `/habits/${hid}/fail`, token, {}),
);
report(
  "POST",
  `/habits/${hid}/skip`,
  await req(BASE, "POST", `/habits/${hid}/skip`, token, {}),
);
report(
  "DELETE",
  `/habits/${hid}/today`,
  await req(BASE, "DELETE", `/habits/${hid}/today`, token, {}),
);

console.log("== goals ==");
report(
  "POST",
  "/goals",
  await req(BASE, "POST", "/goals", token, {
    title: "Proxy Goal",
    deadline: "2026-12-31",
  }),
);

console.log("== unknown route (must be JSON 404) ==");
const nf = await req(BASE, "GET", "/nope", token);
report("GET", "/nope", nf);
console.log("   body:", JSON.stringify(nf.data));

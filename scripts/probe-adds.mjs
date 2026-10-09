// Tests each tab's create (POST) with the fields the frontend sends, to find
// failing adds. Uses the running local worker.
const API = process.env.API ?? "http://127.0.0.1:8787/api";
const email = `add_${Date.now()}@example.com`;
async function req(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}
await req("POST", "/auth/register", null, {
  name: "Add",
  email,
  password: "password123",
  timezone: "UTC",
});
const token = (
  await req("POST", "/auth/login", null, { email, password: "password123" })
).data.data.token;

const cases = [
  ["commitment", "/habits", { name: "C1", frequency: "daily" }],
  ["commitment-no-frequency", "/habits", { name: "C2" }],
  ["task", "/tasks", { title: "T1", priority: "MEDIUM" }],
  ["goal", "/goals", { title: "G1", description: "d", deadline: "2026-12-31" }],
  ["goal-targetDate", "/goals", { title: "G2", targetDate: "2026-12-31" }],
  ["skill", "/skills", { name: "S1", level: 3, description: "d" }],
  ["journal", "/journal", { date: "2026-10-08", accomplishments: "a" }],
  ["focus", "/focus", { durationMinutes: 25 }],
  [
    "reminder",
    "/reminders",
    { title: "R1", reminderDate: "2026-10-09T10:00:00.000Z" },
  ],
  ["brand", "/brand", { title: "B1", status: "IDEA" }],
  [
    "transaction",
    "/transactions",
    { type: "INCOME", category: "SALARY", amount: 10 },
  ],
];
for (const [label, path, body] of cases) {
  const r = await req("POST", path, token, body);
  console.log(
    label.padEnd(22),
    r.status,
    r.status >= 400 ? JSON.stringify(r.data).slice(0, 90) : "OK",
  );
}

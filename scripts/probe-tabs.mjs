// Probe every tab's backend endpoints with a fresh user and report status.
const API = process.env.API ?? "http://127.0.0.1:8787/api";
const email = `probe_${Date.now()}@example.com`;

async function j(method, path, token, body) {
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
  } catch {
    data = null;
  }
  const count = Array.isArray(data?.data)
    ? data.data.length
    : data?.data && typeof data.data === "object"
      ? `obj(${Object.keys(data.data).length})`
      : "-";
  return {
    status: res.status,
    count,
    msg: data?.error?.message ?? data?.error ?? "",
  };
}

const reg = await j("POST", "/auth/register", null, {
  name: "Probe",
  email,
  password: "password123",
  timezone: "Asia/Kolkata",
});
console.log("register", reg.status);
const token = (
  await (
    await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    })
  ).json()
).data.token;

const gets = {
  Dashboard: ["/tasks", "/habits", "/analytics", "/achievements", "/streaks"],
  Goals: ["/goals"],
  Skills: ["/skills"],
  Achievements: ["/achievements"],
  Focus: ["/focus"],
  Journal: ["/journal"],
  Reminders: ["/reminders"],
  Analytics: ["/analytics", "/analytics/xp", "/analytics/charts"],
  Brand: ["/brand"],
  Finance: ["/transactions"],
  Settings: ["/settings"],
  Admin: ["/admin/users", "/admin/stats"],
  Notifications: ["/notifications"],
};

for (const [tab, paths] of Object.entries(gets)) {
  const results = [];
  for (const p of paths) {
    const r = await j("GET", p, token);
    results.push(`${p}=${r.status}${r.status >= 400 ? "(" + r.msg + ")" : ""}`);
  }
  console.log(tab.padEnd(14), results.join("  "));
}

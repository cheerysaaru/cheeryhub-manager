// Verifies admin login/enforcement, finance CRUD+reports, commitment check-in
// idempotency + streak, and the unified error shape, against the running worker.
const API = process.env.API ?? "http://127.0.0.1:4000/api";

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

const email = `e2e_${Date.now()}@example.com`;
await req("POST", "/auth/register", null, {
  name: "E2E",
  email,
  password: "password123",
  timezone: "UTC",
});
const login = await req("POST", "/auth/login", null, {
  email,
  password: "password123",
});
const token = login.data.data.token;

// Admin denied for a normal user.
const denied = await req("GET", "/admin/users", token);
console.log(
  "admin denied (normal user):",
  denied.status,
  denied.status === 403 ? "OK" : "FAIL",
);

// Admin login via env secrets.
const ok = await req("POST", "/auth/admin-login", null, {
  username: "User",
  password: "Abi@2006",
});
console.log(
  "admin login correct creds:",
  ok.status,
  ok.data?.data?.user?.role ?? "",
);
const bad = await req("POST", "/auth/admin-login", null, {
  username: "User",
  password: "wrong",
});
console.log(
  "admin login wrong creds:",
  bad.status,
  bad.status === 401 ? "OK" : "FAIL",
);
const adminToken = ok.data?.data?.token;

const me = await req("GET", "/auth/me", adminToken);
console.log(
  "admin /auth/me role:",
  me.data?.data?.role,
  me.status === 200 ? "OK" : "FAIL",
);

const users = await req("GET", "/admin/users", adminToken);
console.log(
  "admin list users:",
  users.status,
  "count:",
  users.data?.data?.length ?? 0,
);
const stats = await req("GET", "/admin/stats", adminToken);
console.log(
  "admin stats:",
  stats.status,
  stats.data?.data?.userCount != null ? "OK" : "FAIL",
);

// Finance CRUD + reports.
const create = await req("POST", "/transactions", token, {
  type: "INCOME",
  category: "SALARY",
  amount: 1000,
  description: "pay",
  source: "acme",
});
console.log(
  "create transaction:",
  create.status,
  create.data?.data?.type ?? "",
);
const txId = create.data?.data?.id;
const badTx = await req("POST", "/transactions", token, {
  type: "BOGUS",
  category: "X",
  amount: 5,
});
console.log(
  "create transaction invalid type:",
  badTx.status,
  JSON.stringify(badTx.data),
);
const list = await req("GET", "/transactions", token);
console.log(
  "list transactions:",
  list.status,
  "type:",
  list.data?.data?.[0]?.type ?? "",
);
const weekly = await req("GET", "/transactions/report/weekly", token);
console.log(
  "weekly report:",
  weekly.status,
  "income:",
  weekly.data?.data?.totalIncome ?? 0,
);
const monthly = await req(
  "GET",
  "/transactions/report/monthly?year=2026&month=10",
  token,
);
console.log(
  "monthly report:",
  monthly.status,
  "count:",
  monthly.data?.data?.count ?? 0,
);
await req("DELETE", `/transactions/${txId}`, token);

// Commitment check-in idempotency + streak.
const habit = await req("POST", "/habits", token, {
  name: "Checkin Habit",
  frequency: "daily",
});
const habitId = habit.data?.data?.id;
const first = await req("POST", `/habits/${habitId}/complete`, token, {
  date: new Date().toISOString().split("T")[0],
});
const second = await req("POST", `/habits/${habitId}/complete`, token, {
  date: new Date().toISOString().split("T")[0],
});
console.log(
  "check-in 1 alreadyCheckedIn:",
  first.data?.data?.alreadyCheckedIn,
  "streak:",
  first.data?.data?.currentStreak,
);
console.log(
  "check-in 2 alreadyCheckedIn:",
  second.data?.data?.alreadyCheckedIn,
  "total:",
  second.data?.data?.totalCompletions,
  "sameCount:",
  first.data?.data?.totalCompletions === second.data?.data?.totalCompletions,
);

// Unified error shape on a 400.
console.log("unified shape:", JSON.stringify(badTx.data));

// Admin user management actions.
const created = await req("POST", "/admin/users", adminToken, {
  name: "Managed",
  email: `managed_${Date.now()}@example.com`,
  password: "password123",
  role: "USER",
});
console.log(
  "admin create user:",
  created.status,
  created.data?.data?.email ?? "",
);
const newId = created.data?.data?.id;
const reset = await req(
  "POST",
  `/admin/users/${newId}/reset-password`,
  adminToken,
  { password: "newpassword123" },
);
console.log(
  "admin reset password:",
  reset.status,
  reset.data?.data?.reset ?? "",
);
const disable = await req("POST", `/admin/users/${newId}/disable`, adminToken);
console.log("admin disable:", disable.status, disable.data?.data?.status ?? "");
const enable = await req("POST", `/admin/users/${newId}/enable`, adminToken);
console.log("admin enable:", enable.status, enable.data?.data?.status ?? "");
const del = await req("DELETE", `/admin/users/${newId}`, adminToken);
console.log("admin delete user:", del.status, del.data?.data?.deleted ?? "");

// req7: adding a commitment as a regular user succeeds; as admin returns a clean
// error (never raw D1_ERROR). Hits the running worker directly.
const API = process.env.API ?? "http://127.0.0.1:8787/api";
async function req(method, path, token, body) {
  const r = await fetch(`${API}${path}`, {
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
  return {
    status: r.status,
    text: await Promise.resolve(JSON.stringify(d)),
    data: d,
  };
}

const email = `fk_${Date.now()}@example.com`;
await req("POST", "/auth/register", null, {
  name: "FK",
  email,
  password: "password123",
  timezone: "UTC",
});
const userToken = (
  await req("POST", "/auth/login", null, { email, password: "password123" })
).data?.data?.token;

const userCreate = await req("POST", "/habits", userToken, {
  name: "Regular Commitment",
  frequency: "daily",
});
console.log(
  "regular user create commitment:",
  userCreate.status,
  userCreate.status === 201 ? "OK" : userCreate.text.slice(0, 120),
);

const adminLogin = await req("POST", "/auth/admin-login", null, {
  username: "User",
  password: "Abi@2006",
});
const adminToken = adminLogin.data?.data?.token;

const adminCreate = await req("POST", "/habits", adminToken, {
  name: "Admin Commitment",
  frequency: "daily",
});
console.log(
  "admin create commitment:",
  adminCreate.status,
  "message:",
  adminCreate.data?.error?.message ?? "",
);
console.log(
  "no raw D1 leaked:",
  !/D1_ERROR|SQLITE_CONSTRAINT|FOREIGN KEY/.test(adminCreate.text)
    ? "OK"
    : "LEAK!",
);

const adminTask = await req("POST", "/tasks", adminToken, {
  title: "Admin Task",
});
console.log(
  "admin create task:",
  adminTask.status,
  "message:",
  adminTask.data?.error?.message ?? "",
);
const adminGoal = await req("POST", "/goals", adminToken, {
  title: "Admin Goal",
});
console.log(
  "admin create goal:",
  adminGoal.status,
  "message:",
  adminGoal.data?.error?.message ?? "",
);

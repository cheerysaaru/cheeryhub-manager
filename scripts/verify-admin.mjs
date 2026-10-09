const API = "http://127.0.0.1:8787/api";
async function j(m, p, t, b) {
  const r = await fetch(`${API}${p}`, {
    method: m,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const email = `adminchk_${Date.now()}@example.com`;
const reg = await j("POST", "/auth/register", null, {
  name: "A",
  email,
  password: "password123",
  timezone: "Asia/Colombo",
});
console.log("register:", reg.status);
const ok = await j("POST", "/auth/login", null, {
  username: "User",
  password: "Abi1414",
});
console.log(
  "admin User/Abi1414:",
  ok.status,
  "role=",
  ok.data?.data?.user?.role,
);
const old = await j("POST", "/auth/login", null, {
  username: "User",
  password: "Abi@2006",
});
console.log(
  "admin User/Abi@2006:",
  old.status,
  "msg=",
  old.data?.error?.message ?? ok.data?.error,
);
const badUser = await j("POST", "/auth/login", null, {
  username: email,
  password: "nope",
});
console.log(
  "regular wrong pw:",
  badUser.status,
  "msg=",
  badUser.data?.error?.message,
);
const sameMsg = old.data?.error?.message === badUser.data?.error?.message;
console.log(
  "same generic message for admin-wrong vs user-wrong:",
  sameMsg ? "OK" : "DIFFERENT",
);

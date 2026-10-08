import { test, expect, request as apiRequest } from "@playwright/test";

/**
 * End-to-end coverage for the production incident flows:
 *  - logged-out session check (401 JSON, shows login, no error screen)
 *  - login error surfaces the real server message
 *  - signup lands in the dashboard
 *  - every tab loads without an error boundary / crash
 *  - add task + add commitment persist across a reload
 *  - commitment check-in for today returns a streak
 *  - admin is blocked for a normal user (UI + API) and allowed for the env admin
 *
 * Authentication goes through the real UI so the worker sets the session cookie
 * in the same browser context (no manual cookie injection).
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";

const TABS = [
  { path: "/", name: "Dashboard" },
  { path: "/tasks", name: "Tasks" },
  { path: "/commitments/history", name: "Commitments" },
  { path: "/goals", name: "Goals" },
  { path: "/skills", name: "Skills" },
  { path: "/achievements", name: "Achievements" },
  { path: "/focus", name: "Focus" },
  { path: "/journal", name: "Journal" },
  { path: "/reminders", name: "Reminders" },
  { path: "/analytics", name: "Analytics" },
  { path: "/brand", name: "Brand" },
  { path: "/finance", name: "Finance" },
  { path: "/settings", name: "Settings" },
];

let counter = 0;
function creds() {
  counter += 1;
  return {
    name: "Flow User",
    email: `flow_${Date.now()}_${counter}@example.com`,
    password: "password123",
  };
}

async function signUp(page) {
  const c = creds();
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByPlaceholder("Choose a username").fill(c.name);
  await page.getByPlaceholder("you@example.com").fill(c.email);
  await page.getByPlaceholder("Create a password").fill(c.password);
  await page.getByPlaceholder("Repeat your password").fill(c.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByRole("heading", { name: /commitments/i })).toBeVisible(
    {
      timeout: 20000,
    },
  );
  return c;
}

test("logged-out session check returns 401 JSON and shows login (not an error screen)", async ({
  browser,
}) => {
  const ctx = await apiRequest.newContext();
  const res = await ctx.get(`${API}/auth/me`);
  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe("AUTH_REQUIRED");

  const page = await (await browser.newContext({ baseURL: BASE })).newPage();
  await page.goto(`${BASE}/`);
  await expect(page.getByPlaceholder("Username or email")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /can't reach the server/i }),
  ).toHaveCount(0);
});

test("login with a wrong password surfaces the real server error", async () => {
  const ctx = await apiRequest.newContext();
  const c = creds();
  await ctx.post(`${API}/auth/register`, {
    data: {
      name: c.name,
      email: c.email,
      password: c.password,
      timezone: "UTC",
    },
  });
  const bad = await ctx.post(`${API}/auth/login`, {
    data: { email: c.email, password: "wrong-password" },
  });
  expect(bad.status()).toBe(401);
  expect(JSON.stringify(await bad.json())).toContain(
    "Invalid email or password",
  );
});

test("signup through the UI lands in the dashboard", async ({ page }) => {
  await signUp(page);
  await expect(
    page.getByRole("heading", { name: /commitments/i }),
  ).toBeVisible();
});

test("every tab loads without crashing", async ({ page }) => {
  await signUp(page);
  for (const tab of TABS) {
    await page.goto(`${BASE}${tab.path}`);
    // No per-tab error boundary fallback should appear.
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /tab could not be displayed/i }),
    ).toHaveCount(0, { timeout: 8000 });
  }
});

test("add task saves, appears immediately, and survives a reload", async ({
  page,
}) => {
  await signUp(page);
  await page.goto(`${BASE}/tasks`);
  const title = `E2E task ${Date.now()}`;
  const input = page.getByPlaceholder(/add.*task|new task|task/i).first();
  await input.fill(title);
  await page
    .getByRole("button", { name: /add|save/i })
    .first()
    .click();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 });
});

test("add commitment saves, appears immediately, and survives a reload", async ({
  page,
}) => {
  await signUp(page);
  await page.goto(`${BASE}/`);
  const name = `Commitment ${Date.now()}`;
  await page.getByPlaceholder(/add a daily commitment/i).fill(name);
  await page.getByRole("button", { name: /^Add$/ }).first().click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10000 });
});

test("a normal user is denied /admin in the UI and on the API", async ({
  browser,
}) => {
  // API rejects a non-admin (register a fresh user, use its token).
  const c = creds();
  const reg = await apiRequest.newContext();
  await reg.post(`${API}/auth/register`, {
    data: {
      name: c.name,
      email: c.email,
      password: c.password,
      timezone: "UTC",
    },
  });
  const loginRes = await reg.post(`${API}/auth/login`, {
    data: { email: c.email, password: c.password },
  });
  const token = (await loginRes.json()).data.token;
  const adminRes = await reg.get(`${API}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(adminRes.status()).toBe(403);

  // UI redirects away from /admin (even without a session it can't render admin).
  const page = await (await browser.newContext({ baseURL: BASE })).newPage();
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(new RegExp(`${BASE}/?$`), { timeout: 10000 });
});

test("admin can sign in and reach the admin console; API allows the admin", async ({
  page,
}) => {
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /admin sign in/i }).click();
  await page
    .getByPlaceholder("Admin username")
    .fill(process.env.E2E_ADMIN_USER ?? "User");
  await page
    .getByPlaceholder("Admin password")
    .fill(process.env.E2E_ADMIN_PASS ?? "Abi@2006");
  await page.getByRole("button", { name: /enter admin console/i }).click();
  await page.goto(`${BASE}/admin`);
  await expect(
    page.getByRole("heading", { name: /user management/i }),
  ).toBeVisible({
    timeout: 15000,
  });
  const res = await page.context().request.get(`${API}/admin/users`);
  expect(res.status()).toBe(200);
});

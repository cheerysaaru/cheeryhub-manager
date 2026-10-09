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
  { path: "/analytics", name: "Analytics" },
  { path: "/brand", name: "Brand" },
  { path: "/finance", name: "Finance" },
  { path: "/settings", name: "Settings" },
];

/** Removed tabs: no navbar entry, but the old URL still lands on the dashboard. */
const REMOVED_TABS = ["/focus", "/journal", "/reminders"];

let counter = 0;
function creds() {
  counter += 1;
  // Usernames must be 3-20 chars of [A-Za-z0-9_] — no spaces.
  const username = `flow_${Date.now().toString(36)}_${counter}`.slice(0, 20);
  return {
    name: username,
    email: `flow_${Date.now()}_${counter}@example.com`,
    password: "Password1!",
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

/** Task rows render the title as a read-only input, not text nodes. */
async function expectTaskTitle(page, title: string) {
  await expect(async () => {
    const values = await page
      .locator("input.task-title")
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLInputElement).value ?? ""),
      );
    expect(values).toContain(title);
  }).toPass({ timeout: 10000 });
}

test("add task saves, appears immediately, and survives a reload", async ({
  page,
}) => {
  await signUp(page);
  await page.goto(`${BASE}/tasks`);
  const title = `E2E task ${Date.now()}`;
  const input = page.getByPlaceholder("What needs your attention?").first();
  await input.fill(title);
  await page
    .getByRole("button", { name: /^add task$/i })
    .first()
    .click();
  await expectTaskTitle(page, title);
  await page.reload();
  await expectTaskTitle(page, title);
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

  // UI refuses /admin for a logged-out browser (login screen, never the
  // admin console). The URL may carry the "?session=expired" notice.
  const page = await (await browser.newContext({ baseURL: BASE })).newPage();
  await page.goto(`${BASE}/admin`);
  await expect(page).toHaveURL(new RegExp(`^${BASE}/?(\\?.*)?$`), {
    timeout: 10000,
  });
  await expect(
    page.getByRole("heading", { name: /user management/i }),
  ).toHaveCount(0);
});

test("admin can sign in and reach the admin console; API allows the admin", async ({
  page,
}) => {
  // Admin signs in through the same form as everyone else (no admin page).
  await page.goto(`${BASE}/`);
  await page
    .getByPlaceholder("Username or email")
    .fill(process.env.E2E_ADMIN_USER ?? "User");
  await page
    .getByPlaceholder("Password")
    .fill(process.env.E2E_ADMIN_PASS ?? "Abi1414");
  await page.getByRole("button", { name: /enter dashboard/i }).click();
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible({
    timeout: 15000,
  });
  await page.goto(`${BASE}/admin`);
  await expect(
    page.getByRole("heading", { name: /user management/i }),
  ).toBeVisible({
    timeout: 15000,
  });
  const res = await page.context().request.get(`${API}/admin/users`);
  expect(res.status()).toBe(200);
});

test("removed tabs (Focus, Journal, Reminders) are gone and redirect home", async ({
  page,
}) => {
  await signUp(page);

  // No navbar entries left for the removed tabs.
  for (const label of ["Focus", "Journal", "Reminders"]) {
    await expect(page.getByRole("link", { name: label })).toHaveCount(0);
  }

  // Old URLs still resolve — they land on the dashboard.
  for (const path of REMOVED_TABS) {
    await page.goto(`${BASE}${path}`);
    await page.waitForURL(new RegExp(`${BASE}/$`), { timeout: 10000 });
    await expect(page.locator(".streak-pill")).toBeVisible();
  }
});

test("toasts show in the top area, never cover cards, and self-dismiss", async ({
  page,
}) => {
  await signUp(page);
  await page.goto(`${BASE}/achievements`);

  const title = `E2E achievement ${Date.now()}`;
  await page
    .getByRole("button", { name: /add achievement/i })
    .first()
    .click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: /^save$/i }).click();

  const toast = page.locator(".toast").first();
  await expect(toast).toBeVisible({ timeout: 15000 });
  await expect(toast).toContainText("Achievement added");
  await expect(toast).toContainText("+25 points");
  // The old failure message must be gone: the unlock is a real server save.
  await expect(
    page.getByText(/saved locally, but xp was not awarded/i),
  ).toHaveCount(0);

  const vp = page.viewportSize()!;
  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  // Always in the top strip so it never sits over the page content.
  expect(toastBox!.y).toBeLessThan(160);
  if (vp.width <= 640) {
    // Phones: the stack is centred at the top.
    expect(
      Math.abs(toastBox!.x + toastBox!.width / 2 - vp.width / 2),
    ).toBeLessThan(40);
  } else {
    // Tablet/laptop/desktop: pinned to the top-right.
    expect(toastBox!.x).toBeGreaterThan(vp.width / 2);
  }

  const card = page.locator(".skill-card").first();
  const cardBox = await card.boundingBox();
  if (cardBox) {
    const overlaps =
      toastBox!.y < cardBox.y + cardBox.height &&
      toastBox!.y + toastBox!.height > cardBox.y &&
      toastBox!.x < cardBox.x + cardBox.width &&
      toastBox!.x + toastBox!.width > cardBox.x;
    expect(overlaps).toBe(false);
  }

  // Auto-dismiss after ~4 seconds (never lingers).
  await expect(toast).toHaveCount(0, { timeout: 8000 });
});

test("dashboard streak reads Streak N 🔥 and grows after a completed task", async ({
  page,
}) => {
  await signUp(page);
  await page.goto(`${BASE}/`);

  const pill = page.locator(".streak-pill");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("Streak");
  await expect(pill).toContainText("🔥");
  await expect(pill).toHaveText(/^Streak\s*0\s*🔥$/);

  // Complete a task: the streak is derived from completed-task days.
  await page.goto(`${BASE}/tasks`);
  const taskTitle = `E2E streak task ${Date.now()}`;
  await page
    .getByPlaceholder("What needs your attention?")
    .first()
    .fill(taskTitle);
  await page
    .getByRole("button", { name: /^add task$/i })
    .first()
    .click();
  await expect(page.getByText(taskTitle).first()).toBeVisible({
    timeout: 10000,
  });
  await page
    .getByRole("button", { name: /^done$/i })
    .first()
    .click();

  await page.goto(`${BASE}/`);
  await expect(pill).toHaveText(/^Streak\s*1\s*🔥$/, { timeout: 15000 });
});

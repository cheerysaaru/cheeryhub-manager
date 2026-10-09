import { test, expect, request as apiRequest } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8787/api";
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "User";
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? "Abi1414";

test("public login page shows no admin link and keeps only the 3 actions", async ({
  browser,
}) => {
  const page = await (await browser.newContext({ baseURL: BASE })).newPage();
  await page.goto(`${BASE}/`);
  await expect(page.getByPlaceholder("Username or email")).toBeVisible();
  // The 3 allowed actions only.
  await expect(
    page.getByRole("button", { name: /enter dashboard/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /create an account/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /forgot password/i }),
  ).toBeVisible();
  // No admin sign-in anywhere.
  await expect(page.getByText(/admin sign in/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /admin console/i }),
  ).toHaveCount(0);
});

test("regular user does not see the Admin nav item and is redirected off /admin", async ({
  browser,
}) => {
  const api = await apiRequest.newContext();
  const email = `nav_${Date.now()}@example.com`;
  await api.post(`${API}/auth/register`, {
    data: {
      name: "Nav User",
      email,
      password: "password123",
      timezone: "Asia/Colombo",
    },
  });
  // Log in through the normal form (same path as admin, which sets the session).
  const page = await (await browser.newContext({ baseURL: BASE })).newPage();
  await page.goto(`${BASE}/`);
  await page.getByPlaceholder("Username or email").fill(email);
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: /enter dashboard/i }).click();
  // Confirm logged in via the logout button.
  await expect(
    page.getByRole("button", { name: /log ?out|sign ?out/i }),
  ).toBeVisible({ timeout: 20000 });
  // No Admin tab for a regular user.
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  // Direct /admin navigation is redirected to the dashboard.
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(new RegExp(`${BASE}/?$`), { timeout: 10000 });
});

test("admin logs in via the normal form and sees the Admin tab", async ({
  browser,
}) => {
  const page = await (await browser.newContext({ baseURL: BASE })).newPage();
  await page.goto(`${BASE}/`);
  await page.getByPlaceholder("Username or email").fill(ADMIN_USER);
  await page.getByPlaceholder("Password").fill(ADMIN_PASS);
  await page.getByRole("button", { name: /enter dashboard/i }).click();
  // Admin lands in the dashboard with the Admin nav item visible.
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(
    page.getByRole("heading", { name: /user management/i }),
  ).toBeVisible({
    timeout: 10000,
  });
});

test("same generic error for a wrong admin password and a wrong user", async () => {
  const api = await apiRequest.newContext();
  const adminWrong = await api.post(`${API}/auth/login`, {
    data: { username: ADMIN_USER, password: "definitely-wrong" },
  });
  const userMissing = await api.post(`${API}/auth/login`, {
    data: {
      username: `no_such_${Date.now()}@example.com`,
      password: "whatever",
    },
  });
  expect(adminWrong.status()).toBe(401);
  expect(userMissing.status()).toBe(401);
  const a = await adminWrong.json();
  const u = await userMissing.json();
  expect(a.error?.message ?? a.error).toBe(u.error?.message ?? u.error);
});

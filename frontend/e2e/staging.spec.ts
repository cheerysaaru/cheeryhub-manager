import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("register, create and complete a task, log out, and reject a bad password", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) =>
    browserErrors.push(`pageerror: ${error.message}`),
  );

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const username = `qa${suffix}`;
  const email = `qa-${suffix}@example.test`;
  const password = "StagePass9!";
  const taskTitle = `Staging task ${suffix}`;

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /keep your days/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  await page.goto("/tasks");
  await expect(page.getByText("No tasks yet")).toBeVisible();
  await page.getByLabel("Task title").first().fill(taskTitle);
  await page.getByRole("button", { name: "Add Task" }).click();
  const taskRow = page.locator(".task-row").first();
  await expect(taskRow).toBeVisible();
  await expect(taskRow.locator("input.task-title")).toHaveValue(taskTitle);
  const completion = page.waitForResponse(
    (response) => response.url().includes("/complete"),
    { timeout: 30_000 },
  );
  await Promise.all([
    completion,
    taskRow.getByRole("button", { name: "Done" }).click(),
  ]);
  const completionResponse = await completion;
  const completionBody = await completionResponse.text();
  expect(completionResponse.status(), completionBody).toBe(200);
  await taskRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to trash" })
    .click();
  await expect(taskRow).toHaveCount(0);

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("button", { name: "Enter dashboard" }),
  ).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("WrongPassword9!");
  await page.getByRole("button", { name: "Enter dashboard" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /invalid username or password/i,
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/goals");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: "Enter dashboard" }),
  ).toBeVisible();
  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

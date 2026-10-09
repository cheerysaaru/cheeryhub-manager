import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";

let userCounter = 0;
function generateCreds() {
  userCounter += 1;
  const timestamp = Date.now().toString().slice(-8);
  return {
    name: `U${timestamp}${userCounter}`,
    email: `t${timestamp}_${userCounter}@example.com`,
    password: "Password123!",
  };
}

async function dismissGreeting(page) {
  // Wait for greeting modal to appear
  const modal = page.locator('[role="dialog"][aria-label="Daily greeting"]');
  try {
    await modal.waitFor({ state: "visible", timeout: 10000 });
    console.log("Greeting modal found, dismissing...");
    // Use evaluate to remove the modal from DOM
    await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"][aria-label="Daily greeting"]');
      if (modal) {
        modal.remove();
      }
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        overlay.remove();
      }
    });
    console.log("Greeting modal removed via evaluate");
    await page.waitForTimeout(500);
  } catch (e) {
    console.log("Greeting modal did not appear or already dismissed:", e instanceof Error ? e.message : String(e));
  }
}

test("signup, add commitment, verify dashboard", async ({ page }) => {
  const c = generateCreds();
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByPlaceholder("Choose a username").fill(c.name);
  await page.getByPlaceholder("you@example.com").fill(c.email);
  await page.getByPlaceholder("Create a password").fill(c.password);
  await page.getByPlaceholder("Repeat your password").fill(c.password);
  await page.getByRole("button", { name: /create account/i }).click();
  
  // Wait for dashboard to load
  await expect(page.getByRole("heading", { name: /daily commitments/i })).toBeVisible({ timeout: 60000 });
  
  console.log("Dashboard loaded successfully");
  console.log("URL:", page.url());
  
  // Dismiss greeting popup
  await dismissGreeting(page);
  
  // Add a commitment
  await page.getByPlaceholder(/add a daily commitment/i).fill("Test Commitment");
  await page.getByRole("button", { name: /^Add$/ }).first().click();
  await expect(page.locator(".commitment-card strong").filter({ hasText: "Test Commitment" })).toBeVisible({ timeout: 10000 });
  
  console.log("Commitment added");
  
  // Verify week strip has 7 days
  const dayTiles = page.locator(".day-check");
  const count = await dayTiles.count();
  console.log(`Week strip has ${count} day tiles`);
  expect(count).toBe(7);
  
  // Check no horizontal scroll
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  console.log(`No horizontal scroll: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`);
  
  // Check header is flush
  const header = page.locator(".app-header");
  const headerBox = await header.boundingBox();
  expect(headerBox?.y).toBeLessThanOrEqual(2);
  console.log(`Header flush: top=${headerBox?.y}px`);
  
  // Capture screenshots at key viewports
  const viewportName = test.info().project.name;
  if (["Mobile Portrait 390x844", "Mobile Landscape 844x390", "Laptop 1440x900", "Mobile Portrait 360x740"].includes(viewportName)) {
    const safeName = viewportName.replace(/\s+/g, "-").toLowerCase();
    await page.screenshot({ 
      path: `test-results/screenshots/dashboard-${safeName}.png`, 
      fullPage: true 
    });
    console.log(`Screenshot saved: dashboard-${safeName}.png`);
  }
});
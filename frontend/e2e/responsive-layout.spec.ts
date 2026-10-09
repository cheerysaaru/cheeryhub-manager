import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";

const VIEWPORTS = [
  { name: "Mobile 320x568", width: 320, height: 568 },
  { name: "Mobile 360x740", width: 360, height: 740 },
  { name: "Mobile 390x844", width: 390, height: 844 },
  { name: "Mobile 412x915", width: 412, height: 915 },
  { name: "Tablet 600x960", width: 600, height: 960 },
  { name: "Tablet 768x1024", width: 768, height: 1024 },
  { name: "Tablet Landscape 1024x768", width: 1024, height: 768 },
  { name: "Laptop 1280x800", width: 1280, height: 800 },
  { name: "Laptop 1440x900", width: 1440, height: 900 },
  { name: "Desktop 1920x1080", width: 1920, height: 1080 },
  { name: "Ultra-wide 2560x1440", width: 2560, height: 1440 },
  { name: "Mobile Landscape 844x390", width: 844, height: 390 },
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("login page - no horizontal overflow", async ({ page }) => {
      await page.goto(`${BASE}/`);
      await page.waitForLoadState("networkidle");

      // Check no horizontal scroll on document
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const clientWidth = await page.evaluate(
        () => document.documentElement.clientWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Check body also doesn't overflow
      const bodyScrollWidth = await page.evaluate(
        () => document.body.scrollWidth,
      );
      const bodyClientWidth = await page.evaluate(
        () => document.body.clientWidth,
      );
      expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1);

      // Take screenshot
      await page.screenshot({
        path: `test-results/screenshots/login-${vp.name.replace(/\s+/g, "-").toLowerCase()}.png`,
        fullPage: true,
      });
    });

    test("login page - auth card centered and responsive", async ({ page }) => {
      await page.goto(`${BASE}/`);
      await page.waitForLoadState("networkidle");

      const authCard = page.locator(".auth-card");
      await expect(authCard).toBeVisible();

      // Auth card should not overflow viewport
      const cardBox = await authCard.boundingBox();
      const viewport = page.viewportSize();
      if (cardBox && viewport) {
        expect(cardBox.x).toBeGreaterThanOrEqual(0);
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(
          viewport.width + 1,
        );
      }

      await page.screenshot({
        path: `test-results/screenshots/auth-card-${vp.name.replace(/\s+/g, "-").toLowerCase()}.png`,
      });
    });

    test("login page - form inputs don't overflow", async ({ page }) => {
      await page.goto(`${BASE}/`);
      await page.waitForLoadState("networkidle");

      // Click register to see the form with more inputs
      await page.getByRole("button", { name: /create an account/i }).click();
      await page.waitForTimeout(300);

      const inputs = page.locator("input, textarea");
      const count = await inputs.count();
      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const box = await input.boundingBox();
        const viewport = page.viewportSize();
        if (box && viewport) {
          expect(box.x).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }

      await page.screenshot({
        path: `test-results/screenshots/register-form-${vp.name.replace(/\s+/g, "-").toLowerCase()}.png`,
        fullPage: true,
      });
    });
  });
}

test.describe("Global overflow guard at all viewports", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} - no horizontal scroll on document`, async ({ page }) => {
      test.use({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`${BASE}/`);
      await page.waitForLoadState("networkidle");

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    });
  }
});

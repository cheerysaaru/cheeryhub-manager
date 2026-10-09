import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./frontend/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "Mobile Portrait 320x568",
      use: { ...devices["iPhone SE"], viewport: { width: 320, height: 568 } },
    },
    {
      name: "Mobile Portrait 360x740",
      use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 } },
    },
    {
      name: "Mobile Portrait 390x844",
      use: {
        ...devices["iPhone 12 Pro"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "Mobile Portrait 412x915",
      use: {
        ...devices["iPhone 14 Pro Max"],
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: "Tablet Portrait 600x960",
      use: {
        ...devices["Galaxy Tab S4"],
        viewport: { width: 600, height: 960 },
      },
    },
    {
      name: "Tablet Portrait 768x1024",
      use: { ...devices["iPad"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "Tablet Landscape 1024x768",
      use: { ...devices["iPad"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "Laptop 1280x800",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "Laptop 1440x900",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "Desktop 1920x1080",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "Ultra-wide 2560x1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 2560, height: 1440 },
      },
    },
    {
      name: "Mobile Landscape 844x390",
      use: {
        ...devices["iPhone 12 Pro"],
        viewport: { width: 844, height: 390 },
      },
    },
  ],
});

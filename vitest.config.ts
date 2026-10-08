import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["backend/src/**/*.test.ts", "frontend/src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the real local stack (Next proxy + FastAPI + Postgres).
 * Start with: docker compose up / make db + migrate + backend + frontend
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

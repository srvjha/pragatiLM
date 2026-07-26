import { defineConfig, devices } from "@playwright/test";

/**
 * Assumes the API is already running on 4000, because the client project does
 * not own the server. `npm run dev` in server/ first, or the tests fail with a
 * clear network error rather than a mystery.
 */
export default defineConfig({
  testDir: "./e2e",
  // These tests upload real files and wait for real indexing, which is slower
  // than the 30s default allows for.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

import { defineConfig } from "@playwright/test";

// API-only suite: real HTTP against the Next dev server and a real Postgres.
// No browser is launched (tests use the `request` fixture).
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI
    ? [["list"], ["junit", { outputFile: "test-results/api-junit.xml" }]]
    : "list",
  use: {
    baseURL: process.env.API_BASE_URL ?? "http://localhost:3000",
    extraHTTPHeaders: { Accept: "application/json" },
  },
  webServer: process.env.API_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});

import { defineConfig, devices } from "@playwright/test"

import { APP_PORT, FAKE_OPENAI_PORT, FLAGS_OFF_PORT } from "./e2e/support/local-env"

/**
 * LOCAL ONLY. `npm run test:e2e` builds once with local env, seeds the local
 * Supabase e2e user, and runs against `next start`. See docs/testing.md.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  testIgnore: /\.state\//,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/support/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.state/storage.json" },
      dependencies: ["setup"],
      testIgnore: [/\.state\//, /mobile\.spec\.ts$/, /flags-off\.spec\.ts$/, /auth\.spec\.ts$/],
    },
    {
      name: "signed-out",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /auth\.spec\.ts$/,
    },
    {
      name: "flags-off",
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${FLAGS_OFF_PORT}`, storageState: "e2e/.state/storage.json" },
      dependencies: ["setup"],
      testMatch: /flags-off\.spec\.ts$/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: "e2e/.state/storage.json" },
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts$/,
    },
  ],
  webServer: [
    {
      command: "npx tsx e2e/support/fake-openai.ts",
      url: `http://127.0.0.1:${FAKE_OPENAI_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npx tsx e2e/support/serve.ts start on",
      url: `http://127.0.0.1:${APP_PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npx tsx e2e/support/serve.ts start off",
      url: `http://127.0.0.1:${FLAGS_OFF_PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})

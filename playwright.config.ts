import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:8765",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-e2e.ps1",
    url: "http://127.0.0.1:8765/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

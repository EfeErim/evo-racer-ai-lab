import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.EVORACER_E2E_PORT ?? "8765";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    baseURL: e2eBaseUrl,
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
    url: `${e2eBaseUrl}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

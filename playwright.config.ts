import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Every spec shares one Python service and local data root.
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8765",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Serves the built UI from dist/ with a fresh local data root.
    command:
      "rmdir /s /q .runtime_tmp\\e2e-data 2>nul & .venv\\Scripts\\python -m evo_racer.launcher --no-browser --data-root .runtime_tmp\\e2e-data --static-root dist",
    url: "http://127.0.0.1:8765/health",
    timeout: 30_000,
  },
});

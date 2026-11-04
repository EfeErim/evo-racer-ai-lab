import { expect, test } from "@playwright/test";

test("Track recovers failed preset and local-library startup reads without reload", async ({
  page,
}) => {
  let presetRequests = 0;
  let trackLibraryRequests = 0;
  await page.route("**/v1/tracks/presets", async (route) => {
    presetRequests += 1;
    if (presetRequests <= 2) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "PRESET_RECOVERY_TEST_FAILURE" }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/v1/tracks/library", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    trackLibraryRequests += 1;
    if (trackLibraryRequests <= 2) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "TRACK_LIBRARY_RECOVERY_TEST_FAILURE" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect.poll(() => presetRequests).toBe(1);
  await expect.poll(() => trackLibraryRequests).toBe(1);
  await page.getByRole("button", { name: "Customize setup" }).click();

  await expect.poll(() => presetRequests).toBe(2);
  await expect.poll(() => trackLibraryRequests).toBe(2);
  await expect(
    page.getByText("Preset track request failed with status 503."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  const builder = page.getByTestId("track-builder");
  await builder.getByRole("tab", { name: /Library/ }).click();
  await expect(
    builder.getByText("Track library request failed with status 503."),
  ).toBeVisible();
  await expect(
    builder.getByText("Loading local library…", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Retry preset previews" }).click();
  await builder.getByRole("button", { name: "Retry local library" }).click();

  await expect.poll(() => presetRequests).toBe(3);
  await expect.poll(() => trackLibraryRequests).toBe(3);
  await expect(page.locator(".choice-card .track-geometry")).toHaveCount(3);
  await expect(
    builder.getByText("Track library request failed with status 503."),
  ).toHaveCount(0);
  await expect(
    builder.getByText("Loading local library…", { exact: true }),
  ).toHaveCount(0);
  await expect(
    builder.getByText("Local track library refreshed.", { exact: true }),
  ).toBeVisible();
});

test("Saved runs recovers a failed startup read without reload", async ({
  page,
}) => {
  let runLibraryRequests = 0;
  await page.route("**/v1/runs/library", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    runLibraryRequests += 1;
    if (runLibraryRequests <= 2) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "RUN_LIBRARY_RECOVERY_TEST_FAILURE" }),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        runSchemaVersion: 1,
        trackSchemaVersion: 1,
        runs: [
          {
            runId: "run-library-retry",
            status: "running",
            algorithm: "fixed-ga",
            trackId: "easy-oval",
            trackName: "Easy Oval",
            seed: 19,
            generation: 1,
            totalGenerations: 8,
            resumable: true,
            championFitness: null,
            championProgress: null,
          },
        ],
        isolated: [],
      }),
    });
  });

  await page.goto("/");
  await expect.poll(() => runLibraryRequests).toBe(1);
  const savedRuns = page.locator("details.saved-runs-panel");
  await expect(savedRuns).toHaveAttribute("open", "");
  await expect(
    page.getByText("Run library request failed with status 503."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry saved runs" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: "01 Welcome" }).click();
  await expect.poll(() => runLibraryRequests).toBe(2);
  await expect(savedRuns).toHaveAttribute("open", "");
  await expect(
    page.getByText("Run library request failed with status 503."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry saved runs" }).click();
  await expect.poll(() => runLibraryRequests).toBe(3);
  await expect(page.getByText("Loading local run files…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry saved runs" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(
    page.getByText("Run library request failed with status 503."),
  ).toHaveCount(0);
});

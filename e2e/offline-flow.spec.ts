import { expect, test } from "@playwright/test";

test("Welcome explains the racing loop and provides a local motion control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const journey = page.locator('[aria-label="How EvoRacer works"]');
  await expect(
    journey.getByText("Choose a track", { exact: true }),
  ).toBeVisible();
  await expect(
    journey.getByText("Watch evolution", { exact: true }),
  ).toBeVisible();
  await expect(
    journey.getByText("Compare the champion", { exact: true }),
  ).toBeVisible();

  const motion = page.getByRole("button", { name: "Reduce motion" });
  await expect(motion).toHaveAttribute("aria-pressed", "false");
  await expect(motion).toBeEnabled();
  await motion.click();
  await expect(
    page.getByRole("button", { name: "Motion reduced", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const recommended = page.getByRole("button", {
    name: "Review recommended setup",
  });
  const recommendedBox = await recommended.boundingBox();
  expect(recommendedBox?.height).toBeGreaterThanOrEqual(44);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const systemMotion = page.getByRole("button", {
    name: "Motion reduced by Windows",
  });
  await expect(systemMotion).toBeDisabled();
  await expect(systemMotion).toHaveAttribute("aria-pressed", "true");
});

test("track builder previews invalid drafts, repairs them, and generates technical layouts", async ({
  page,
}) => {
  let generationAttempts = 0;
  let trackLibraryRequests = 0;
  let markInitialTrackLibraryCaptured: (() => void) | undefined;
  let releaseInitialTrackLibrary: (() => void) | undefined;
  let markInitialTrackLibraryFinished: (() => void) | undefined;
  let markFreshTrackLibraryFinished: (() => void) | undefined;
  const initialTrackLibraryCaptured = new Promise<void>((resolve) => {
    markInitialTrackLibraryCaptured = resolve;
  });
  const initialTrackLibraryRelease = new Promise<void>((resolve) => {
    releaseInitialTrackLibrary = resolve;
  });
  const initialTrackLibraryFinished = new Promise<void>((resolve) => {
    markInitialTrackLibraryFinished = resolve;
  });
  const freshTrackLibraryFinished = new Promise<void>((resolve) => {
    markFreshTrackLibraryFinished = resolve;
  });
  await page.route("**/v1/tracks/library", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    trackLibraryRequests += 1;
    const response = await route.fetch();
    if (trackLibraryRequests === 1) {
      markInitialTrackLibraryCaptured?.();
      await initialTrackLibraryRelease;
      await route.fulfill({ response });
      markInitialTrackLibraryFinished?.();
      return;
    }
    await route.fulfill({ response });
    markFreshTrackLibraryFinished?.();
  });
  await page.route("**/v1/tracks/generate", async (route) => {
    generationAttempts += 1;
    if (generationAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "TRANSIENT_GENERATION_TEST_FAILURE" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await initialTrackLibraryCaptured;
  await page.getByRole("button", { name: "Customize setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a track." }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", {
      name: "Easy Oval. Easy. Wide turns and a forgiving layout for a first experiment.",
      exact: true,
    }),
  ).toBeChecked();
  await expect(page.locator(".track-preview .track-geometry")).toHaveCount(3);

  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  const builder = page.getByTestId("track-builder");
  await expect(
    builder.getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  await expect(
    builder.getByRole("heading", { name: "Track Builder", exact: true }),
  ).toBeFocused();

  const buildTab = builder.getByRole("tab", { name: /Build/ });
  const generateTab = builder.getByRole("tab", { name: /Generate/ });
  const libraryTab = builder.getByRole("tab", { name: /Library/ });
  await expect(buildTab).toHaveAttribute("tabindex", "0");
  await expect(generateTab).toHaveAttribute("tabindex", "-1");
  await buildTab.focus();
  await buildTab.press("ArrowRight");
  await expect(generateTab).toHaveAttribute("aria-selected", "true");
  await expect(generateTab).toBeFocused();
  await generateTab.press("End");
  await expect(libraryTab).toHaveAttribute("aria-selected", "true");
  await expect(libraryTab).toBeFocused();
  await libraryTab.press("Home");
  await expect(buildTab).toHaveAttribute("aria-selected", "true");
  await expect(buildTab).toBeFocused();

  const roadWidth = builder.getByLabel("Road width");
  await roadWidth.focus();
  await roadWidth.evaluate((input: HTMLInputElement) => {
    input.value = "10.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(
    builder.getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  await expect(roadWidth).toBeFocused();

  await builder
    .locator('[data-editor-drag-kind="straight-short"]')
    .dragTo(builder.locator('[data-track-drop-index="2"]'));
  await expect(builder.locator(".sequence-piece")).toHaveCount(9);
  await expect(builder.locator(".sequence-piece").nth(2)).toContainText(
    "Short straight",
  );
  await expect(builder.getByText("Needs changes")).toBeVisible();
  await expect(
    builder.locator(".builder-canvas .track-geometry"),
  ).toBeVisible();
  await expect(builder.getByText("LOOP_NOT_CLOSED")).toBeVisible();

  await builder.getByRole("button", { name: /Undo/ }).click();
  await expect(
    builder.getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  await builder.locator('[data-editor-drag-kind="straight-short"]').click();
  await expect(builder.getByText("LOOP_NOT_CLOSED")).toBeVisible();

  await builder.getByRole("button", { name: "Assist closure" }).click();
  await expect(builder.getByText("Python verified")).toBeVisible();
  await expect(builder.getByText(/restored the last valid loop/)).toBeVisible();

  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.locator("[data-generator-seed]").fill("731");
  await builder.locator('input[name="generator-length"][value="long"]').check();
  await builder
    .locator('input[name="generator-difficulty"][value="hard"]')
    .check();
  await builder.getByRole("button", { name: "Generate & use track" }).click();
  await expect(
    builder.getByText("Track generation failed with status 503."),
  ).toBeVisible();
  await builder.getByRole("button", { name: "Generate & use track" }).click();
  await expect(builder.getByText(/generator v4/)).toBeVisible();
  await expect(
    builder.locator(".generated-preview .track-geometry"),
  ).toBeVisible();
  await expect(
    builder.getByText("Active experiment track", { exact: true }),
  ).toBeVisible();
  await expect(builder.getByText("Active for Review and Start")).toBeVisible();
  await expect(builder.getByText("Asymmetric")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Selected custom track" }),
  ).toContainText("Hard Long 731");

  await builder.locator("[data-generator-seed]").fill("732");
  await expect(
    builder.getByText("Inputs changed", { exact: true }),
  ).toBeVisible();
  await builder
    .locator('input[name="generator-length"][value="medium"]')
    .check();
  await builder.getByRole("tab", { name: /Library/ }).click();
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await expect(
    builder.getByText("Inputs changed", { exact: true }),
  ).toBeVisible();
  await expect(builder.locator(".generated-preview dl")).toContainText(
    "Seed731",
  );

  await builder.getByRole("button", { name: "Edit pieces" }).click();
  await expect(builder.getByText(/hairpin/i).first()).toBeVisible();

  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.getByRole("button", { name: "Save locally" }).click();
  await expect(builder.getByText("Track saved atomically")).toBeVisible();
  await freshTrackLibraryFinished;
  releaseInitialTrackLibrary?.();
  await initialTrackLibraryFinished;
  await page.waitForTimeout(100);
  await builder.getByRole("tab", { name: /Library/ }).click();
  await expect(builder.getByRole("button", { name: "Delete" })).toBeVisible();
  await page.route("**/v1/tracks/library/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    const trackId = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-1) ?? "",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, deleted: false, trackId }),
    });
  });
  page.once("dialog", (dialog) => void dialog.accept());
  await builder.getByRole("button", { name: "Delete" }).click();
  await expect(
    builder.getByText(
      "Track deletion failed because the local track no longer exists.",
    ),
  ).toBeVisible();

  let markImportCompileCaptured: (() => void) | undefined;
  let releaseImportCompile: (() => void) | undefined;
  const importCompileCaptured = new Promise<void>((resolve) => {
    markImportCompileCaptured = resolve;
  });
  const importCompileRelease = new Promise<void>((resolve) => {
    releaseImportCompile = resolve;
  });
  await page.route("**/v1/tracks/compile", async (route) => {
    const payload = route.request().postDataJSON() as {
      track?: { id?: string };
    };
    if (payload.track?.id !== "delayed-import-track") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    markImportCompileCaptured?.();
    await importCompileRelease;
    await route.fulfill({ response });
  });
  await builder.locator("[data-track-import]").setInputFiles({
    name: "delayed-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        id: "delayed-import-track",
        name: "Delayed imported oval",
        roadWidth: 10,
        pieces: [
          { kind: "start-finish" },
          { kind: "straight-long" },
          { kind: "turn-left-90" },
          { kind: "turn-left-90" },
          { kind: "straight-long" },
          { kind: "straight-short" },
          { kind: "turn-left-90" },
          { kind: "turn-left-90" },
        ],
      }),
    ),
  });
  await importCompileCaptured;
  await expect(builder.locator("[data-track-import]")).toBeDisabled();
  await expect(builder.getByText("Importing…", { exact: true })).toBeVisible();
  await builder.getByRole("button", { name: "Close Track Builder" }).click();
  await expect(
    page.getByRole("button", { name: /Open Track Builder/ }),
  ).toBeFocused();
  releaseImportCompile?.();
  await page.waitForTimeout(500);
  await expect(builder).toBeHidden();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  await expect(
    builder.getByText(
      "Track import response ignored after Track Builder closed.",
    ),
  ).toBeVisible();

  await builder.getByRole("button", { name: "Close Track Builder" }).click();
  await expect(
    page.getByRole("button", { name: /Open Track Builder/ }),
  ).toBeFocused();
});

test("placed track pieces can be dragged to a new connector", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize setup" }).click();
  await expect(page.locator(".track-preview .track-geometry")).toHaveCount(3);
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  const builder = page.getByTestId("track-builder");
  await expect(
    builder.getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  await builder
    .locator('[data-editor-drag-index="1"]')
    .dragTo(builder.locator('[data-track-drop-index="4"]'));

  await expect(builder.locator(".sequence-piece").nth(3)).toContainText(
    "Long straight",
  );
});

test("a late generated track cannot overwrite Track Builder after leaving Track", async ({
  page,
}) => {
  let markGenerationCaptured: (() => void) | undefined;
  let releaseGeneration: (() => void) | undefined;
  const generationCaptured = new Promise<void>((resolve) => {
    markGenerationCaptured = resolve;
  });
  const generationRelease = new Promise<void>((resolve) => {
    releaseGeneration = resolve;
  });

  await page.route("**/v1/tracks/generate", async (route) => {
    const response = await route.fetch();
    markGenerationCaptured?.();
    await generationRelease;
    await route.fulfill({ response });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  const builder = page.getByTestId("track-builder");
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.getByRole("button", { name: "Generate & use track" }).click();
  await generationCaptured;
  await expect(builder.getByText("Generating…", { exact: true })).toBeVisible();

  await page.locator('.progress-list [data-route="settings"]').click();
  releaseGeneration?.();
  await page.waitForTimeout(300);
  await page.locator('.progress-list [data-route="track"]').click();

  await expect(page.getByTestId("track-builder")).toBeVisible();
  await expect(page.locator(".generated-preview .track-geometry")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Waiting for inputs" }),
  ).toBeVisible();
  await expect(
    page.getByText("Track generation response ignored after leaving Track."),
  ).toBeVisible();
});

test("a generated track becomes the active reviewed setup without a second selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  const builder = page.getByTestId("track-builder");
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.locator("[data-generator-seed]").fill("90210");
  await builder.locator('input[name="generator-length"][value="long"]').check();
  await builder
    .locator('input[name="generator-difficulty"][value="technical"]')
    .check();
  await builder.getByRole("button", { name: "Generate & use track" }).click();

  await expect(builder.getByText(/generator v4/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Selected custom track" }),
  ).toContainText("Technical Long 90210");
  await expect(
    builder.getByText("Active experiment track", { exact: true }),
  ).toBeVisible();
  await expect(builder.getByText("Active for Review and Start")).toBeVisible();

  await builder.getByRole("button", { name: "Close Track Builder" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  await expect(builder.getByRole("tab", { name: /Generate/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    builder.getByRole("heading", { name: "Technical Long 90210" }),
  ).toBeVisible();
  await expect(builder.getByText("Active for Review and Start")).toBeVisible();

  await page.getByRole("button", { name: "Continue to settings" }).click();
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(
    page.getByRole("region", { name: "Technical Long 90210" }),
  ).toContainText("24 canonical pieces");
  await expect(page.getByText("Configuration valid")).toBeVisible();

  let submittedTrackName = "";
  let submittedPieceCount = 0;
  await page.route("**/v1/runs/start", async (route) => {
    const payload = route.request().postDataJSON() as {
      track?: { name?: string; pieces?: unknown[] };
    };
    submittedTrackName = payload.track?.name ?? "";
    submittedPieceCount = payload.track?.pieces?.length ?? 0;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        valid: false,
        errors: [
          {
            code: "TEST_CAPTURED_START",
            field: "track",
            message: "Generated track start payload captured.",
          },
        ],
      }),
    });
  });
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(
    page
      .getByLabel("Training did not open")
      .getByText("Generated track start payload captured."),
  ).toBeVisible();
  expect(submittedTrackName).toBe("Technical Long 90210");
  expect(submittedPieceCount).toBe(24);
});

test("a dismissed track save refreshes the Python-owned library without taking over the route", async ({
  page,
}) => {
  let markSaveCaptured: (() => void) | undefined;
  let releaseSave: (() => void) | undefined;
  const saveCaptured = new Promise<void>((resolve) => {
    markSaveCaptured = resolve;
  });
  const saveRelease = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });

  await page.route("**/v1/tracks/library", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    markSaveCaptured?.();
    await saveRelease;
    await route.fulfill({ response });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  const builder = page.getByTestId("track-builder");
  await expect(builder.getByText("Python verified")).toBeVisible();
  const trackName = builder.getByLabel("Track name");
  await trackName.fill("Dismissed save recovery track");
  await trackName.press("Tab");
  await expect(builder.getByText("Python verified")).toBeVisible();
  await builder.getByRole("button", { name: "Save locally" }).click();
  await saveCaptured;

  await page.locator('.progress-list [data-route="settings"]').click();
  releaseSave?.();
  await page.waitForTimeout(300);
  await page.locator('.progress-list [data-route="track"]').click();

  await expect(page.getByTestId("track-builder")).toBeVisible();
  await expect(
    page.getByText("Track save response ignored after leaving Track."),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Library/ }).click();
  await expect(
    page.getByRole("heading", { name: "Dismissed save recovery track" }),
  ).toBeVisible();
});

test("late startup responses cannot resurrect the interface after shutdown", async ({
  page,
}) => {
  let markRunLibraryCaptured: (() => void) | undefined;
  let releaseRunLibrary: (() => void) | undefined;
  const runLibraryCaptured = new Promise<void>((resolve) => {
    markRunLibraryCaptured = resolve;
  });
  const runLibraryRelease = new Promise<void>((resolve) => {
    releaseRunLibrary = resolve;
  });

  await page.route("**/v1/runs/library", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    markRunLibraryCaptured?.();
    await runLibraryRelease;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        runSchemaVersion: 1,
        trackSchemaVersion: 1,
        runs: [],
        isolated: [],
      }),
    });
  });
  await page.route("**/v1/app/shutdown", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, status: "shutting-down" }),
    });
  });

  await page.goto("/");
  await runLibraryCaptured;
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Exit application" }).click();
  await expect(
    page.getByRole("heading", { name: "EvoRacer has shut down." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "EvoRacer has shut down." }),
  ).toBeFocused();

  releaseRunLibrary?.();
  await page.waitForTimeout(300);
  await expect(
    page.getByRole("heading", { name: "EvoRacer has shut down." }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});

test("shutdown exposes pending state and the exact local failure before recovering", async ({
  page,
}) => {
  const alerts: string[] = [];
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") {
      await dialog.accept();
      return;
    }
    alerts.push(dialog.message());
    await dialog.dismiss();
  });
  await page.route("**/v1/app/shutdown", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "SHUTDOWN_TEST_FAILURE" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Exit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Shutting down EvoRacer…" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shutting down EvoRacer…" }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Exit application" }),
  ).toHaveCount(0);
  await expect
    .poll(() => alerts)
    .toContain("Application shutdown failed with status 503.");
  await expect(
    page.getByRole("heading", { name: "Start an AI racing experiment." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exit application" }),
  ).toBeVisible();
});

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

test("custom settings retain disclosure state and keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: "Continue to settings" }).click();

  const customizer = page.locator("details.settings-customizer");
  const advanced = page.locator("details.advanced-settings");
  await customizer.locator(":scope > summary").click();
  await advanced.locator(":scope > summary").click();

  const seed = page.getByLabel("Random seed");
  await expect(page.getByLabel("Algorithm")).toHaveAttribute(
    "aria-describedby",
    "algorithm-help",
  );
  await seed.focus();
  await seed.evaluate((input: HTMLInputElement) => {
    input.value = "43";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(customizer).toHaveAttribute("open", "");
  await expect(advanced).toHaveAttribute("open", "");
  await expect(seed).toBeFocused();
});

test("an unconfirmed Start refreshes Saved runs when Welcome opens", async ({
  page,
}) => {
  let runLibraryRequests = 0;
  await page.route("**/v1/runs/library", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    runLibraryRequests += 1;
    if (runLibraryRequests === 3) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "RUN_LIBRARY_REFRESH_TEST_FAILURE" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        runSchemaVersion: 1,
        trackSchemaVersion: 1,
        runs:
          runLibraryRequests === 1
            ? []
            : [
                {
                  runId: "run-unconfirmed-recovery",
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
  await page.route("**/v1/runs/start", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "UNCONFIRMED_START_TEST_FAILURE" }),
    });
  });

  await page.goto("/");
  await expect.poll(() => runLibraryRequests).toBe(1);
  await page.getByRole("button", { name: "Review recommended setup" }).click();
  await expect(page.getByText("Configuration valid")).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByText("Run start failed with status 503."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Welcome and Saved runs" }).click();
  await expect.poll(() => runLibraryRequests).toBe(2);
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect.poll(() => runLibraryRequests).toBe(3);
  await expect(
    page.getByText("Run library request failed with status 503."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry saved runs" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect.poll(() => runLibraryRequests).toBe(4);
  await expect(
    page.getByText("Run library request failed with status 503."),
  ).toHaveCount(0);
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
});

test("reduced-motion Training shows the displayed champion's complete recorded path", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Review recommended setup" }).click();
  await expect(page.getByText("Configuration valid")).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();

  const currentPath = page.locator(".current-generation-path");
  await expect(currentPath).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Displayed champion")).toBeVisible();
  await expect(page.locator(".live-race-stage")).toHaveAttribute(
    "aria-label",
    /with its complete recorded path/,
  );

  const pathIdentity = await page
    .locator(".live-race-stage")
    .evaluate((stage) => {
      const path = stage.querySelector(".current-generation-path");
      const marker = stage.querySelector(".track-replay-marker");
      const lastPoint = path?.getAttribute("d")?.split(" L ").at(-1);
      return {
        candidateId: path?.getAttribute("data-current-candidate"),
        markerTransform: marker?.getAttribute("transform"),
        lastPoint,
      };
    });
  expect(pathIdentity.candidateId).toBeTruthy();
  await expect(
    page.getByRole("heading", {
      name: pathIdentity.candidateId ?? "missing candidate",
      exact: true,
    }),
  ).toBeVisible();
  expect(pathIdentity.lastPoint).toBeTruthy();
  expect(pathIdentity.markerTransform).toContain(
    `translate(${pathIdentity.lastPoint ?? "missing point"})`,
  );
});

test("recommended offline run reaches results without starting automatically", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let startAttempts = 0;
  let runLibraryRequests = 0;
  let markInitialRunLibraryCaptured: (() => void) | undefined;
  let releaseInitialRunLibrary: (() => void) | undefined;
  let markInitialRunLibraryFinished: (() => void) | undefined;
  let markFreshRunLibraryFinished: (() => void) | undefined;
  let markInitialValidationCaptured: (() => void) | undefined;
  let releaseInitialValidation: (() => void) | undefined;
  const initialRunLibraryCaptured = new Promise<void>((resolve) => {
    markInitialRunLibraryCaptured = resolve;
  });
  const initialRunLibraryRelease = new Promise<void>((resolve) => {
    releaseInitialRunLibrary = resolve;
  });
  const initialRunLibraryFinished = new Promise<void>((resolve) => {
    markInitialRunLibraryFinished = resolve;
  });
  const freshRunLibraryFinished = new Promise<void>((resolve) => {
    markFreshRunLibraryFinished = resolve;
  });
  const initialValidationCaptured = new Promise<void>((resolve) => {
    markInitialValidationCaptured = resolve;
  });
  const initialValidationRelease = new Promise<void>((resolve) => {
    releaseInitialValidation = resolve;
  });
  let validationRequests = 0;
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.route("**/v1/setup/validate", async (route) => {
    validationRequests += 1;
    const response = await route.fetch();
    if (validationRequests === 1) {
      markInitialValidationCaptured?.();
      await initialValidationRelease;
      await route.fulfill({ response });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({ response });
  });
  await page.route("**/v1/runs/library", async (route) => {
    runLibraryRequests += 1;
    const response = await route.fetch();
    if (runLibraryRequests === 1) {
      markInitialRunLibraryCaptured?.();
      await initialRunLibraryRelease;
      await route.fulfill({ response });
      markInitialRunLibraryFinished?.();
      return;
    }
    await route.fulfill({ response });
    markFreshRunLibraryFinished?.();
  });
  await page.route("**/v1/runs/start", async (route) => {
    startAttempts += 1;
    if (startAttempts === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1,
          valid: false,
          errors: [
            {
              code: "START_REJECTED",
              field: "settings",
              message: "The local core rejected this reviewed setup.",
            },
          ],
        }),
      });
      return;
    }
    if (startAttempts === 2) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "TRANSIENT_START_TEST_FAILURE" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await initialRunLibraryCaptured;
  await expect(
    page.getByRole("heading", { name: "Start an AI racing experiment." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "05 Training", exact: true }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Review recommended setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the setup." }),
  ).toBeVisible();
  await initialValidationCaptured;
  const editTrack = page.locator('.review-card [data-route="track"]');
  await editTrack.click();
  await expect(
    page.getByRole("heading", { name: "Choose a track." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to settings" }).click();
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the setup." }),
  ).toBeVisible();
  const refreshedEditTrack = page.locator('.review-card [data-route="track"]');
  await refreshedEditTrack.focus();
  await expect(refreshedEditTrack).toBeFocused();
  await expect(page.getByText("Checking with the local core")).toBeVisible();
  releaseInitialValidation?.();
  await page.waitForTimeout(200);
  await expect(page.getByText("Checking with the local core")).toBeVisible();
  await expect(page.getByText("Configuration valid")).toBeVisible();
  await expect(refreshedEditTrack).toBeFocused();

  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page
      .getByRole("alert", { name: "Training did not open" })
      .getByText("The local core rejected this reviewed setup."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The local core rejected the setup and no run was created. Validate again after reviewing the reported issue.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start training/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Validate again" }).click();
  await expect(page.getByText("Configuration valid")).toBeVisible();

  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByRole("heading", { name: "Review the setup." }),
  ).toBeVisible();
  await expect(
    page.getByText("Run start failed with status 503."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The start result is unknown. Check Saved runs before retrying if the local core may have accepted the request.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start training/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByRole("heading", { name: "Training workspace" }),
  ).toBeVisible();
  const telemetryDetails = page.locator("details.telemetry-disclosure");
  await expect(telemetryDetails).toBeVisible({ timeout: 15_000 });
  await expect(telemetryDetails).not.toHaveAttribute("open", "");
  await telemetryDetails.locator(":scope > summary").click();
  await expect(page.getByText("Road-edge sensors")).toBeVisible();
  const stop = page.getByRole("button", { name: /Stop after generation/ });
  await stop.focus();
  await expect(stop).toBeFocused();
  await page.waitForTimeout(750);
  await expect(stop).toBeFocused();
  await stop.click();
  await expect(page.getByRole("button", { name: /Open results/ })).toBeVisible({
    timeout: 90_000,
  });
  await freshRunLibraryFinished;
  releaseInitialRunLibrary?.();
  await initialRunLibraryFinished;
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: /Open results/ }).click();

  await expect(
    page.getByRole("heading", { name: "What did the AI achieve?" }),
  ).toBeVisible();
  await expect(page.getByText("Ideal-line match")).toBeVisible();
  await expect(page.getByText("Champion vs baselines")).toBeVisible();
  await expect(page.getByText("Smooth replay · 1×")).toBeVisible();
  await expect(page.locator(".current-generation-path")).toBeVisible();
  await expect(page.locator(".ideal-racing-line")).toBeVisible();
  await expect(page.locator(".ideal-racing-line")).toHaveAttribute(
    "data-reference-method",
    "minimum-curvature-v1",
  );
  const marker = page.locator(".replay-stage .track-replay-marker");
  const firstTransform = await marker.getAttribute("transform");
  await page.waitForTimeout(80);
  const secondTransform = await marker.getAttribute("transform");
  expect(secondTransform).not.toBe(firstTransform);
  await page.waitForTimeout(80);
  expect(await marker.getAttribute("transform")).not.toBe(secondTransform);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth ===
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".result-verdict-copy > p:not(.section-kicker)")
      .first()
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
  ).toBeGreaterThanOrEqual(14);
  expect(
    await page
      .locator(".replay-stage")
      .evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBe(0);

  await page.getByRole("button", { name: "Create another setup" }).click();
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open results" }).first(),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth ===
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  let markSavedOpenCaptured: (() => void) | undefined;
  let releaseSavedOpen: (() => void) | undefined;
  const savedOpenCaptured = new Promise<void>((resolve) => {
    markSavedOpenCaptured = resolve;
  });
  const savedOpenRelease = new Promise<void>((resolve) => {
    releaseSavedOpen = resolve;
  });
  await page.route(
    "**/v1/runs/library/*/export",
    async (route) => {
      const response = await route.fetch();
      markSavedOpenCaptured?.();
      await savedOpenRelease;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Open results" }).first().click();
  await savedOpenCaptured;
  await page.getByRole("button", { name: "Customize setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a track." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back/ }).click();
  await expect(
    page.getByRole("heading", { name: "Start an AI racing experiment." }),
  ).toBeVisible();
  releaseSavedOpen?.();
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole("heading", { name: "Start an AI racing experiment." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What did the AI achieve?" }),
  ).toBeHidden();
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(
    page.getByText("Saved run response ignored after leaving Welcome."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open results" }).first(),
  ).toBeEnabled();
  await page.route(
    "**/v1/runs/library/*/export",
    async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as {
        run: {
          checkpoint: {
            snapshot: {
              result: {
                replay: { frames: { simulatedSeconds: number }[] };
              };
            };
          };
        };
      };
      const frames = body.run.checkpoint.snapshot.result.replay.frames;
      const firstFrame = frames[0];
      const secondFrame = frames[1];
      if (firstFrame === undefined || secondFrame === undefined) {
        throw new Error("Saved replay requires two frames for this test.");
      }
      secondFrame.simulatedSeconds = firstFrame.simulatedSeconds;
      await route.fulfill({ response, body: JSON.stringify(body) });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Open results" }).first().click();
  await expect(
    page.getByText("Run replay frame times must be strictly increasing."),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open results" }).first(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Open results" }).first().click();
  await expect(
    page.getByRole("heading", { name: "What did the AI achieve?" }),
  ).toBeVisible();
  await expect(page.getByText("Ideal-line match")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Champion and ideal racing line" }),
  ).toBeVisible();
  await expect(page.locator(".current-generation-path")).toBeVisible();
  await expect(page.locator(".ideal-racing-line")).toBeVisible();

  await page.getByRole("button", { name: "Create another setup" }).click();
  await page.getByText("Saved runs", { exact: true }).click();
  await page.route("**/v1/runs/library/*/export", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        valid: false,
        errors: [
          {
            code: "CORRUPT_RUN_RECORD",
            field: "runId",
            message: "The local run is corrupt and cannot be exported.",
          },
        ],
      }),
    });
  });
  await page.getByRole("button", { name: "Export" }).first().click();
  await expect(page.getByRole("button", { name: "Exporting…" })).toBeDisabled();
  await expect(
    page.getByText("The local run is corrupt and cannot be exported."),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export" }).first(),
  ).toBeEnabled();
  expect(startAttempts).toBe(3);
  expect(consoleErrors).toContain(
    "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
  );
  expect(
    consoleErrors.filter(
      (message) =>
        message !==
        "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
    ),
  ).toEqual([]);
});

test("a transient run-command failure preserves controls and recovers", async ({
  page,
}) => {
  let commandAttempts = 0;
  let delayNextObservation = false;
  let observationAttempts = 0;
  let markHeldObservationStarted: (() => void) | undefined;
  let releaseHeldObservation: (() => void) | undefined;
  const heldObservationStarted = new Promise<void>((resolve) => {
    markHeldObservationStarted = resolve;
  });
  const heldObservationRelease = new Promise<void>((resolve) => {
    releaseHeldObservation = resolve;
  });

  await page.route("**/v1/runs/command", async (route) => {
    commandAttempts += 1;
    if (commandAttempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      delayNextObservation = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "TRANSIENT_TEST_FAILURE" }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/v1/runs/observe", async (route) => {
    observationAttempts += 1;
    if (observationAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "TRANSIENT_TELEMETRY_TEST_FAILURE" }),
      });
      return;
    }
    if (observationAttempts === 2) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    if (observationAttempts === 3) {
      markHeldObservationStarted?.();
      await heldObservationRelease;
      await route.continue();
      return;
    }
    if (delayNextObservation) {
      delayNextObservation = false;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await route.continue();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Review recommended setup" }).click();
  await expect(page.getByText("Configuration valid")).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();

  const recovery = page.getByRole("heading", {
    name: "Keeping the last verified run state",
  });
  await expect(recovery).toBeVisible();
  await expect(
    page.getByText(
      "Telemetry update failed: Run observation failed with status 503.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Live run status")).toBeVisible();
  await expect(recovery).toBeHidden({ timeout: 15_000 });
  await heldObservationStarted;

  const stop = page.getByRole("button", { name: "Stop after generation" });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(
    page.getByRole("button", { name: /Sending stop/ }),
  ).toBeDisabled();

  await expect(recovery).toBeVisible();
  await expect(
    page.getByText("Run command failed with status 503."),
  ).toBeVisible();
  await expect(stop).toBeFocused();
  await expect(page.getByLabel("Live run status")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth ===
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  releaseHeldObservation?.();
  await page.waitForTimeout(500);
  await expect(recovery).toBeVisible();
  await expect(recovery).toBeHidden({ timeout: 15_000 });

  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(page.getByRole("button", { name: /Open results/ })).toBeVisible({
    timeout: 90_000,
  });
  expect(commandAttempts).toBe(2);
});

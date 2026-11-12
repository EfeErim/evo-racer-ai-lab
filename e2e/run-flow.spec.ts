import { expect, test } from "@playwright/test";

import { distinctCanvasFrames, openMenu, openSetup, raceStage } from "./flow";

test("an unconfirmed Start refreshes Saved runs when Home opens", async ({
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
  await openSetup(page);
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByText(
      "Run start has no confirmed response yet (status 503). Try again.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open Home and Saved runs" }).click();
  await expect.poll(() => runLibraryRequests).toBe(2);
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Set up a race" }).click();
  await page.getByRole("link", { name: "EvoRacer home" }).click();
  await expect.poll(() => runLibraryRequests).toBe(3);
  await expect(
    page.getByText(
      "Run library request has no confirmed response yet (status 503). Try again.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry saved runs" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set up a race" }).click();
  await page.getByRole("link", { name: "EvoRacer home" }).click();
  await expect.poll(() => runLibraryRequests).toBe(4);
  await expect(
    page.getByText(
      "Run library request has no confirmed response yet (status 503). Try again.",
    ),
  ).toHaveCount(0);
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
});

test("Training races a whole generation together on one smooth canvas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const observeBodies: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/runs/observe")) {
      observeBodies.push(request.postData() ?? "");
    }
  });
  await page.goto("/");
  await openSetup(page);
  await page.locator('[data-training-preset="balanced"]').click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();

  await expect(
    page.getByRole("heading", { name: /Generation \d+ race/ }),
  ).toBeVisible({ timeout: 60_000 });
  const canvas = raceStage(page).locator("canvas.race-canvas");
  await expect(canvas).toBeVisible();
  // The canvas must fill the stage exactly; taller, the stage clipped the track.
  const stageBox = await raceStage(page).boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.height).toBeCloseTo(stageBox?.height ?? -1, 0);
  expect(canvasBox?.width).toBeCloseTo(stageBox?.width ?? -1, 0);
  await expect(
    page
      .locator(".race-insight")
      .getByRole("img", { name: /Network of the leading car/ }),
  ).toBeVisible();
  await expect(
    page.locator(".live-race-panel").getByText("Best car", { exact: true }),
  ).toBeVisible();
  await expect(raceStage(page)).toHaveAttribute(
    "data-race-label",
    /cars of generation \d+, racing together/,
  );

  // The canvas is created once and survives every observation poll.
  await canvas.evaluate((element) => {
    (window as unknown as { raceCanvas?: Element }).raceCanvas = element;
  });
  const frames = await distinctCanvasFrames(
    page,
    '[data-race-host="training"] canvas',
    1000,
  );
  expect(frames).toBeGreaterThan(30);
  expect(
    await canvas.evaluate(
      (element) =>
        (window as unknown as { raceCanvas?: Element }).raceCanvas === element,
    ),
  ).toBe(true);

  // Each race is sent once; later polls name the generation already held.
  await expect
    .poll(() =>
      observeBodies.some((body) => body.includes("knownGenerationRace")),
    )
    .toBe(true);

  const fast = page.getByRole("button", { name: "4×" });
  await fast.click();
  await expect(fast).toHaveAttribute("aria-pressed", "true");
  await expect(fast).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth ===
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Stop after generation/ }).click();
});

test("races animate even when Windows asks for reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openSetup(page);
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByRole("heading", { name: /Generation \d+ race/ }),
  ).toBeVisible({ timeout: 60_000 });

  const selector = '[data-race-host="training"] canvas';
  await expect(page.locator(selector)).toBeVisible();
  await expect(page.getByRole("button", { name: "4×" })).toBeVisible();
  expect(await distinctCanvasFrames(page, selector, 800)).toBeGreaterThan(10);

  // The in-app menu is the only switch that stills the race.
  await openMenu(page);
  await page.getByRole("button", { name: /Animate races/ }).click();

  // A new still frame appears whenever a generation finishes, so measure
  // stillness once the run has stopped producing generations.
  await page.getByRole("button", { name: /Stop after generation/ }).click();
  await expect(page.getByRole("button", { name: "Open results" })).toBeVisible({
    timeout: 90_000,
  });
  await page.waitForTimeout(300);
  expect(await distinctCanvasFrames(page, selector, 500)).toBeLessThanOrEqual(
    1,
  );

  await page.getByRole("button", { name: /Play the race/ }).click();
  await expect(page.getByRole("button", { name: "2×" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await distinctCanvasFrames(page, selector, 800)).toBeGreaterThan(10);

  await openMenu(page);
  await expect(
    page.getByRole("button", { name: /Animate races/ }),
  ).toHaveAttribute("aria-pressed", "true");
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
    page.getByRole("heading", {
      name: "AI cars learn to race by evolution, and you watch.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2 Race", exact: true }),
  ).toBeDisabled();

  await openSetup(page);
  await initialValidationCaptured;
  // Changing the track while a check is in flight starts a new check; the
  // stale answer must not unlock Start or move focus.
  const technical = page.getByRole("radio", { name: /^Technical Circuit/ });
  await technical.check();
  await expect(technical).toBeFocused();
  await expect(page.getByText("Checking the setup")).toBeVisible();
  releaseInitialValidation?.();
  await page.waitForTimeout(200);
  await expect(page.getByText("Checking the setup")).toBeVisible();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await expect(technical).toBeFocused();

  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page
      .getByRole("alert", { name: "Training did not start" })
      .getByText("The local core rejected this reviewed setup."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No run was created. Fix the reported issue, then check the setup again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start training/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByRole("heading", { name: "Set up a race" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Run start has no confirmed response yet (status 503). Try again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A run may or may not have started. Check Saved runs first, then press Start training again if it is not listed.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start training/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByRole("heading", { name: "Race", exact: true }),
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
    page.getByRole("heading", { name: /got better|Too early/ }),
  ).toBeVisible();
  await expect(page.getByText(/smooth reference line/)).toBeVisible();
  await expect(page.getByText("Champion vs baselines")).toBeVisible();
  await expect(page.getByText("Playing at 1× speed")).toBeVisible();
  await expect(page.getByText("Smoothest reference line")).toBeVisible();
  await expect(page.locator(".replay-stage canvas.race-canvas")).toBeVisible();
  expect(
    await distinctCanvasFrames(page, ".replay-stage canvas", 500),
  ).toBeGreaterThan(10);
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
      .locator(".results-title .page-lead")
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
  ).toBeGreaterThanOrEqual(14);
  expect(
    await page
      .locator(".replay-stage")
      .evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBe(0);

  await page.getByRole("button", { name: "New race" }).click();
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
  await openSetup(page);
  await page.getByRole("link", { name: "EvoRacer home" }).click();
  await expect(
    page.getByRole("heading", {
      name: "AI cars learn to race by evolution, and you watch.",
    }),
  ).toBeVisible();
  releaseSavedOpen?.();
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole("heading", {
      name: "AI cars learn to race by evolution, and you watch.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /got better|Too early/ }),
  ).toBeHidden();
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(
    page.getByText("Saved run response ignored after leaving Home."),
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
    page.getByRole("heading", { name: /got better|Too early/ }),
  ).toBeVisible();
  await expect(page.getByText(/smooth reference line/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Champion replay" }),
  ).toBeVisible();
  await expect(page.locator(".replay-stage canvas.race-canvas")).toBeVisible();

  await page.getByRole("button", { name: "New race" }).click();
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
  await openSetup(page);
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();

  const recovery = page.getByRole("heading", {
    name: "Keeping the last confirmed run state",
  });
  await expect(recovery).toBeVisible();
  await expect(
    page.getByText(
      "Telemetry update delayed: Run observation has no confirmed response yet (status 503). Try again.",
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
    page.getByText(
      "Run command has no confirmed response yet (status 503). Try again.",
    ),
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

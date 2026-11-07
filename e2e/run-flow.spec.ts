import { expect, test } from "@playwright/test";

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
  await page
    .getByRole("button", { name: "Review recommended experiment" })
    .click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByText(
      "Run start has no confirmed response yet (status 503). Try again.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Welcome and Saved runs" }).click();
  await expect.poll(() => runLibraryRequests).toBe(2);
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await page.getByRole("button", { name: "Back" }).click();
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
  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect.poll(() => runLibraryRequests).toBe(4);
  await expect(
    page.getByText(
      "Run library request has no confirmed response yet (status 503). Try again.",
    ),
  ).toHaveCount(0);
  await page.getByText("Saved runs", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
});

test("reduced-motion Training shows the displayed champion's complete recorded path", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Review recommended experiment" })
    .click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
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
    page
      .locator(".live-race-panel")
      .getByText(pathIdentity.candidateId ?? "missing candidate", {
        exact: true,
      }),
  ).toBeVisible();
  expect(pathIdentity.lastPoint).toBeTruthy();
  expect(pathIdentity.markerTransform).toContain(
    `translate(${pathIdentity.lastPoint ?? "missing point"})`,
  );
});

test("Training shows the car from the previous two seconds on a two-second cadence", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const clipRequestTimes: number[] = [];
  page.on("request", (request) => {
    if (
      request.url().endsWith("/v1/runs/observe") &&
      request.postData()?.includes('"includeRaceClip":true') === true
    ) {
      clipRequestTimes.push(Date.now());
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await page.getByRole("button", { name: "Continue to settings" }).click();
  await page.locator('[data-training-preset="balanced"]').click();
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();

  const stage = page.locator(".live-race-stage");
  await expect(page.getByText("Buffering 2 s")).toBeVisible({
    timeout: 10_000,
  });
  await expect(stage.locator(".track-replay-marker")).toHaveCount(0);

  const marker = stage.locator(".track-replay-marker");
  await expect(marker).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Displayed car")).toBeVisible();
  await expect(page.getByText("Raced in the previous 2 seconds")).toBeVisible();

  const heading = page.locator("#live-race-title");
  const firstCar = await heading.innerText();
  const distinctPositions = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const seen = new Set<string | null | undefined>();
        const startedAt = performance.now();
        const sample = (): void => {
          seen.add(
            document
              .querySelector(".live-race-stage .track-replay-marker")
              ?.getAttribute("transform"),
          );
          if (performance.now() - startedAt < 1000) {
            requestAnimationFrame(sample);
          } else {
            resolve(seen.size);
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(distinctPositions).toBeGreaterThan(20);
  await expect
    .poll(() => heading.innerText(), { timeout: 5000 })
    .not.toBe(firstCar);

  await expect.poll(() => clipRequestTimes.length).toBeGreaterThan(2);
  const intervals = clipRequestTimes
    .slice(1)
    .map((time, index) => time - (clipRequestTimes[index] ?? time));
  for (const interval of intervals) {
    expect(interval).toBeGreaterThanOrEqual(1900);
    expect(interval).toBeLessThan(2400);
  }

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

test("Windows reduced motion stays the default until the user shows race motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Review recommended experiment" })
    .click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(page.locator(".live-race-panel")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Buffering 2 s")).toHaveCount(0);

  await page.getByRole("button", { name: "Show race motion" }).click();
  await expect(
    page.getByRole("button", { name: "Race motion on" }),
  ).toBeFocused();
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
    page.getByRole("button", { name: "5 Training", exact: true }),
  ).toBeDisabled();

  await page
    .getByRole("button", { name: "Review recommended experiment" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review and start" }),
  ).toBeVisible();
  await initialValidationCaptured;
  const editTrack = page.locator('.review-summary [data-route="track"]');
  await editTrack.click();
  await expect(
    page.getByRole("heading", { name: "Choose a track" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to settings" }).click();
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(
    page.getByRole("heading", { name: "Review and start" }),
  ).toBeVisible();
  const refreshedEditTrack = page.locator(
    '.review-summary [data-route="track"]',
  );
  await refreshedEditTrack.focus();
  await expect(refreshedEditTrack).toBeFocused();
  await expect(page.getByText("Checking the setup")).toBeVisible();
  releaseInitialValidation?.();
  await page.waitForTimeout(200);
  await expect(page.getByText("Checking the setup")).toBeVisible();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await expect(refreshedEditTrack).toBeFocused();

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
    page.getByRole("heading", { name: "Review and start" }),
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
    page.getByRole("heading", { name: "Training", exact: true }),
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
    page.getByRole("heading", { name: /best fitness|Too early/ }),
  ).toBeVisible();
  await expect(page.getByText(/Ideal-line match/)).toBeVisible();
  await expect(page.getByText("Champion vs baselines")).toBeVisible();
  await expect(page.getByText("Playing at 1× speed")).toBeVisible();
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

  await page.getByRole("button", { name: "Start a new run" }).click();
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
  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a track" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back/ }).click();
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
    page.getByRole("heading", { name: /best fitness|Too early/ }),
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
    page.getByRole("heading", { name: /best fitness|Too early/ }),
  ).toBeVisible();
  await expect(page.getByText(/Ideal-line match/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Champion replay" }),
  ).toBeVisible();
  await expect(page.locator(".current-generation-path")).toBeVisible();
  await expect(page.locator(".ideal-racing-line")).toBeVisible();

  await page.getByRole("button", { name: "Start a new run" }).click();
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
  await page
    .getByRole("button", { name: "Review recommended experiment" })
    .click();
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

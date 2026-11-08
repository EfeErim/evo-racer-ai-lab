import { expect, test } from "@playwright/test";

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
  await page.getByRole("button", { name: "Set up a race" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up a race" }),
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

  const buildTab = builder.getByRole("tab", { name: /Editor/ });
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
  await expect(builder.locator(".validation-badge")).toHaveText(
    /Needs changes/,
  );
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

  await builder.getByRole("button", { name: "Close the loop" }).click();
  await expect(builder.locator(".validation-badge.is-success")).toBeVisible();
  await expect(builder.getByText(/restored the last valid loop/)).toBeVisible();

  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.locator("[data-generator-seed]").fill("731");
  await builder.locator('input[name="generator-length"][value="long"]').check();
  await builder
    .locator('input[name="generator-difficulty"][value="hard"]')
    .check();
  await builder.getByRole("button", { name: "Generate track" }).click();
  await expect(
    builder.getByText(
      "Track generation has no confirmed response yet (status 503). Try again.",
    ),
  ).toBeVisible();
  await builder.getByRole("button", { name: "Generate track" }).click();
  await expect(builder.getByText(/generator v5/)).toBeVisible();
  await expect(
    builder.locator(".generated-preview .track-geometry"),
  ).toBeVisible();
  await expect(
    builder.locator(".generated-preview .validation-badge"),
  ).toHaveText(/Candidate, not active/);
  await expect(
    page.getByRole("region", { name: "Active track" }),
  ).toContainText("Easy Oval");
  await expect(builder.getByText(/Asymmetric/)).toBeVisible();
  await builder.getByRole("button", { name: "Use this track" }).click();
  await expect(
    builder.locator(".generated-preview .validation-badge"),
  ).toHaveText(/Active track/);
  await expect(builder.getByText("Active for this race")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Active track" }),
  ).toContainText("Hard Long 731");
  await expect(
    page.getByRole("region", { name: "Active track" }),
  ).toContainText("731");
  await builder.getByRole("button", { name: "Regenerate seed 731" }).click();
  await expect(
    builder.getByText("Same seed 731 returned the identical track."),
  ).toBeVisible();

  await builder.locator("[data-generator-seed]").fill("732");
  await expect(
    builder.locator(".generated-preview .validation-badge"),
  ).toHaveText(/Inputs changed/);
  await builder
    .locator('input[name="generator-length"][value="medium"]')
    .check();
  await builder.getByRole("tab", { name: /Library/ }).click();
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await expect(
    builder.locator(".generated-preview .validation-badge"),
  ).toHaveText(/Inputs changed/);
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
  // Keep the source piece and the target connector on screen together.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Set up a race" }).click();
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

test("a late generated track cannot overwrite Track Builder after leaving it", async ({
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
  await page.getByRole("button", { name: "Set up a race" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  const builder = page.getByTestId("track-builder");
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.getByRole("button", { name: "Generate track" }).click();
  await generationCaptured;
  await expect(builder.locator(".generator-submit")).toHaveText("Generating…");

  await page.getByRole("button", { name: /Done/ }).click();
  releaseGeneration?.();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  await expect(page.getByTestId("track-builder")).toBeVisible();
  await expect(page.locator(".generated-preview .track-geometry")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "No candidate yet" }),
  ).toBeVisible();
  await expect(
    page.getByText("Track generation response ignored after leaving Track."),
  ).toBeVisible();
});

test("a generated track stays a candidate until Use this track, then reaches Start", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Set up a race" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  const builder = page.getByTestId("track-builder");
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.locator("[data-generator-seed]").fill("90210");
  await builder.locator('input[name="generator-length"][value="long"]').check();
  await builder
    .locator('input[name="generator-difficulty"][value="technical"]')
    .check();
  await builder.getByRole("button", { name: "Generate track" }).click();

  await expect(builder.getByText(/generator v5/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Active track" }),
  ).toContainText("Easy Oval");
  await builder.getByRole("button", { name: "Use this track" }).click();
  await expect(
    page.getByRole("region", { name: "Active track" }),
  ).toContainText("Technical Long 90210");
  await expect(
    page.getByRole("region", { name: "Active track" }),
  ).toContainText("90210");
  await expect(builder.getByText("Active for this race")).toBeVisible();

  await builder.getByRole("button", { name: "Close Track Builder" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  await expect(builder.getByRole("tab", { name: /Generate/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    builder.getByRole("heading", { name: "Technical Long 90210" }),
  ).toBeVisible();
  await expect(builder.getByText("Active for this race")).toBeVisible();

  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.locator(".start-summary")).toContainText(
    "Technical Long 90210",
  );
  await expect(page.locator(".custom-track-card")).toContainText("24 pieces");
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();

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
      .getByLabel("Training did not start")
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
  await page.getByRole("button", { name: "Set up a race" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  const builder = page.getByTestId("track-builder");
  await expect(builder.locator(".validation-badge.is-success")).toBeVisible();
  const trackName = builder.getByLabel("Track name");
  await trackName.fill("Dismissed save recovery track");
  await trackName.press("Tab");
  await expect(builder.locator(".validation-badge.is-success")).toBeVisible();
  await builder.getByRole("button", { name: "Save locally" }).click();
  await saveCaptured;

  await page.getByRole("button", { name: /Done/ }).click();
  releaseSave?.();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Open Track Builder/ }).click();

  await expect(page.getByTestId("track-builder")).toBeVisible();
  await expect(
    page.getByText("Track save response ignored after leaving Track."),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Library/ }).click();
  await expect(
    page.getByRole("heading", { name: "Dismissed save recovery track" }),
  ).toBeVisible();
});

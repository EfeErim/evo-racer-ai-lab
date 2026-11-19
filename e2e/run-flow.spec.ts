import { expect, test } from "@playwright/test";

import {
  distinctCanvasFrames,
  openMenu,
  openSetup,
  startRecommendedRun,
  stopAndOpenResults,
} from "./flow";

const raceCanvas = '[data-race-host="training"] canvas';
const replayCanvas = ".replay-stage canvas";

test("the recommended run races, reaches Results and reopens from Saved runs", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let startRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/runs/start")) {
      startRequests += 1;
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "2 Race", exact: true }),
  ).toBeDisabled();
  await openSetup(page);
  expect(startRequests).toBe(0);
  await page.getByRole("button", { name: /Start training/ }).click();

  await expect(
    page.getByRole("heading", { name: /Generation \d+ race/ }),
  ).toBeVisible({ timeout: 60_000 });
  // The canvas fills the race stage; taller, the stage would clip the track.
  const stageBox = await page
    .locator('[data-race-host="training"]')
    .boundingBox();
  const canvasBox = await page.locator(raceCanvas).boundingBox();
  expect(canvasBox?.height).toBeCloseTo(stageBox?.height ?? -1, 0);
  expect(await distinctCanvasFrames(page, raceCanvas, 1000)).toBeGreaterThan(
    30,
  );
  await expect(
    page.getByRole("img", { name: /Network of the leading car/ }),
  ).toBeVisible();
  const fast = page.getByRole("button", { name: "4×" });
  await fast.click();
  await expect(fast).toHaveAttribute("aria-pressed", "true");

  await stopAndOpenResults(page);
  await expect(
    page.getByRole("heading", { name: /got better|Too early/ }),
  ).toBeVisible();
  await expect(page.locator(".chart-axis-x")).toHaveText("Generation (count)");
  await expect(page.getByText("Champion vs baselines")).toBeVisible();

  // Replay controls: pause holds the frame, step and restart move it.
  await expect(page.getByText("Playing at 1× speed")).toBeVisible();
  expect(await distinctCanvasFrames(page, replayCanvas, 400)).toBeGreaterThan(
    5,
  );
  await page.getByRole("button", { name: "Pause" }).click();
  const status = page.getByText(/Frame \d+ of \d+/);
  const paused = await status.innerText();
  expect(
    await distinctCanvasFrames(page, replayCanvas, 300),
  ).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect(status).not.toHaveText(paused);
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(status).toContainText("Frame 1 of");
  await page.getByLabel("Replay position").fill("3");
  await expect(status).toContainText("Frame 4 of");

  await page
    .getByRole("button", { name: "Change setup and race again" })
    .click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "EvoRacer home" }).click();
  await page.getByText("Saved runs", { exact: true }).click();
  await page.getByRole("button", { name: "Open results" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Champion replay" }),
  ).toBeVisible();
  expect(startRequests).toBe(1);
});

test("a rejected or unconfirmed Start keeps Set up open", async ({ page }) => {
  let startAttempts = 0;
  await page.route("**/v1/runs/start", async (route) => {
    startAttempts += 1;
    if (startAttempts === 1) {
      await route.fulfill({
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
    await route.fulfill({ status: 503, body: "{}" });
  });

  await page.goto("/");
  await openSetup(page);
  const start = page.getByRole("button", { name: /Start training/ });
  await start.click();
  await expect(
    page
      .getByRole("alert", { name: "Training did not start" })
      .getByText("The local core rejected this reviewed setup."),
  ).toBeVisible();
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();

  await start.click();
  await expect(
    page.getByText(
      "Run start has no confirmed response yet (status 503). Try again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Home and Saved runs" }),
  ).toBeVisible();
  await expect(start).toBeEnabled();
});

test("Animate races off stills the race and the replay, even under reduced motion", async ({
  page,
}) => {
  // Windows' reduced-motion setting stills UI transitions, not races.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await startRecommendedRun(page);
  await expect(
    page.getByRole("heading", { name: /Generation \d+ race/ }),
  ).toBeVisible({ timeout: 60_000 });
  expect(await distinctCanvasFrames(page, raceCanvas, 800)).toBeGreaterThan(10);

  await openMenu(page);
  await page.getByRole("button", { name: /Animate races/ }).click();
  await page.locator("details.app-menu > summary").click();
  await stopAndOpenResults(page);

  await page.waitForTimeout(200);
  expect(
    await distinctCanvasFrames(page, replayCanvas, 400),
  ).toBeLessThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
  const status = page.getByText(/Frame \d+ of \d+/);
  const held = await status.innerText();
  await page.getByRole("button", { name: "Step back" }).click();
  await expect(status).not.toHaveText(held);
});

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parseRunDocument, parseRunResponse } from "../src/simulation";

test("legacy interruption explains recovery and completed v1 replay opens", async ({
  page,
}) => {
  const saved = parseRunDocument(
    JSON.parse(readFileSync("contracts/physics-v1-completed-run.json", "utf8")),
  );
  const result = saved.checkpoint.snapshot.result;
  if (!result) throw new Error("Historical fixture requires a result.");
  const reason =
    "This run uses earlier physics and cannot continue in this version. Your saved run is preserved. Start a new experiment from Welcome.";
  await page.route("**/v1/runs/library", async (route) => {
    await route.fulfill({
      json: {
        contractVersion: 1,
        runSchemaVersion: 1,
        trackSchemaVersion: 1,
        isolated: [],
        runs: [
          {
            runId: "old-interrupted",
            status: "paused",
            algorithm: "fixed-ga",
            trackId: "easy-oval",
            trackName: "Legacy interruption",
            seed: 819,
            generation: 0,
            totalGenerations: 2,
            resumable: false,
            resumeUnavailableReason: reason,
            championFitness: null,
            championProgress: null,
          },
          {
            runId: saved.runId,
            status: "completed",
            algorithm: "fixed-ga",
            trackId: "easy-oval",
            trackName: "Historical replay",
            seed: 819,
            generation: 1,
            totalGenerations: 1,
            resumable: false,
            championFitness: result.champion.fitness,
            championProgress: result.champion.progress,
          },
        ],
      },
    });
  });
  await page.route(`**/v1/runs/library/${saved.runId}/export`, (route) =>
    route.fulfill({
      json: { contractVersion: 1, valid: true, errors: [], run: saved },
    }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto("/");
  const summary = page.locator("details.saved-runs-panel > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(reason)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toHaveCount(0);
  const open = page.getByRole("button", { name: "Open results", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Champion vs baselines")).toBeVisible();
  await expect(
    page.locator(".replay-stage .track-replay-marker"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

for (const algorithm of ["fixed-ga", "neat"]) {
  test(`v2 ${algorithm} finishes, reloads, opens and exports`, async ({
    page,
    request,
  }) => {
    const start = await request.post("/v1/runs/start", {
      data: {
        contractVersion: 1,
        trackPreset: "easy-oval",
        settings: {
          algorithm,
          populationSize: 10,
          generations: 1,
          episodeSeconds: 15,
          seed: 19,
        },
      },
    });
    const started = parseRunResponse(await start.json());
    expect(started.valid).toBe(true);
    if (!started.valid) throw new Error("Run start rejected.");
    const runId = started.snapshot.runId;
    await expect
      .poll(
        async () => {
          const response = await request.post("/v1/runs/observe", {
            data: { contractVersion: 1, runId },
          });
          const payload = parseRunResponse(await response.json());
          expect(payload.valid).toBe(true);
          if (!payload.valid) throw new Error("Observation rejected.");
          return payload.snapshot.status;
        },
        { timeout: 90000 },
      )
      .toBe("completed");
    await page.goto("/");
    await page.reload();
    await page.getByText("Saved runs", { exact: true }).click();
    const open = page.locator(
      `[data-run-action="open"][data-run-id="${runId}"]`,
    );
    await expect(open).toBeEnabled();
    await open.click();
    await expect(page.getByText("Champion vs baselines")).toBeVisible();
    await page.getByRole("button", { name: "Start a new run" }).click();
    await page.getByText("Saved runs", { exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .locator(`[data-run-action="export"][data-run-id="${runId}"]`)
      .click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    if (!path) throw new Error("Download file missing.");
    const exported = parseRunDocument(JSON.parse(readFileSync(path, "utf8")));
    const canonicalResponse = await request.get(
      `/v1/runs/library/${runId}/export`,
    );
    const canonical = (await canonicalResponse.json()) as {
      serializedRun: string;
    };
    expect(readFileSync(path, "utf8")).toBe(canonical.serializedRun);
    const result = exported.checkpoint.snapshot.result;
    if (!result) throw new Error("Export result missing.");
    expect(exported.runId).toBe(runId);
    expect(result.metadata.simulationContractVersion).toBe(2);
    expect(result.replay.frames.length).toBeGreaterThan(0);
  });
}

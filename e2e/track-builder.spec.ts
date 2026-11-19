import { expect, test, type Page } from "@playwright/test";

import { openSetup } from "./flow";

async function openBuilder(page: Page) {
  await page.goto("/");
  await openSetup(page);
  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  const builder = page.getByTestId("track-builder");
  await expect(
    builder.getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  return builder;
}

test("the editor flags an open loop, undoes it and closes it", async ({
  page,
}) => {
  const builder = await openBuilder(page);
  await expect(
    builder.getByRole("heading", { name: "Track Builder", exact: true }),
  ).toBeFocused();
  const editorTab = builder.getByRole("tab", { name: /Editor/ });
  await editorTab.focus();
  await editorTab.press("ArrowRight");
  await expect(builder.getByRole("tab", { name: /Generate/ })).toBeFocused();
  await editorTab.click();

  await builder
    .locator('[data-editor-drag-kind="straight-short"]')
    .dragTo(builder.locator('[data-track-drop-index="2"]'));
  await expect(builder.locator(".sequence-piece").nth(2)).toContainText(
    "Short straight",
  );
  await expect(builder.getByText("LOOP_NOT_CLOSED")).toBeVisible();

  await builder.getByRole("button", { name: /Undo/ }).click();
  await expect(
    builder.getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  await builder.locator('[data-editor-drag-kind="straight-short"]').click();
  await expect(builder.getByText("LOOP_NOT_CLOSED")).toBeVisible();
  await builder.getByRole("button", { name: "Close the loop" }).click();
  await expect(builder.locator(".validation-badge.is-success")).toBeVisible();
});

test("placed track pieces can be dragged to a new connector", async ({
  page,
}) => {
  // Keep the source piece and the target connector on screen together.
  await page.setViewportSize({ width: 1280, height: 1000 });
  const builder = await openBuilder(page);
  await builder
    .locator('[data-editor-drag-index="1"]')
    .dragTo(builder.locator('[data-track-drop-index="4"]'));
  await expect(builder.locator(".sequence-piece").nth(3)).toContainText(
    "Long straight",
  );
});

test("a generated track stays a candidate until used, then Start submits it", async ({
  page,
}) => {
  let generated: unknown;
  await page.route("**/v1/tracks/generate", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { compiled?: { track?: unknown } };
    generated = body.compiled?.track;
    await route.fulfill({ response });
  });
  let submitted: unknown;
  await page.route("**/v1/runs/start", async (route) => {
    submitted = (route.request().postDataJSON() as { track: unknown }).track;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        valid: false,
        errors: [{ code: "TEST", field: "track", message: "Captured." }],
      }),
    });
  });

  const builder = await openBuilder(page);
  const activeTrack = page.getByRole("region", { name: "Active track" });
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.locator("[data-generator-seed]").fill("90210");
  await builder.locator('input[name="generator-length"][value="long"]').check();
  await builder
    .locator('input[name="generator-difficulty"][value="technical"]')
    .check();
  await builder.getByRole("button", { name: "Generate track" }).click();
  await expect(
    builder.locator(".generated-preview .validation-badge"),
  ).toHaveText(/Candidate, not active/);
  await expect(activeTrack).toContainText("Easy Oval");

  await builder.getByRole("button", { name: "Use this track" }).click();
  await expect(activeTrack).toContainText("Technical Long 90210");
  await builder.getByRole("button", { name: "Regenerate seed 90210" }).click();
  await expect(
    builder.getByText("Same seed 90210 returned the identical track."),
  ).toBeVisible();

  await builder.getByRole("button", { name: "Save locally" }).click();
  await expect(builder.getByText("Track saved atomically")).toBeVisible();
  await builder.getByRole("tab", { name: /Library/ }).click();
  await expect(
    builder.getByRole("heading", { name: "Technical Long 90210" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.locator(".start-summary")).toContainText(
    "Technical Long 90210",
  );
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(
    page.getByRole("alert", { name: "Training did not start" }),
  ).toContainText("Captured.");
  expect(generated).toBeTruthy();
  expect(submitted).toEqual(generated);
});

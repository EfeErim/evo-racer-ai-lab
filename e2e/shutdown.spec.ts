import { expect, test } from "@playwright/test";

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
    .toContain(
      "Application shutdown has no confirmed response yet (status 503). Try again.",
    );
  await expect(
    page.getByRole("heading", {
      name: "AI cars learn to race by evolution, and you watch.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exit application" }),
  ).toBeVisible();
});

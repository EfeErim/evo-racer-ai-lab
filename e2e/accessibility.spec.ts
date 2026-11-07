import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectSurfaceMeetsLimits } from "./surface";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Fails on serious or critical WCAG A/AA violations and reports every finding. */
async function expectNoSeriousViolations(
  page: Page,
  surface: string,
): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  const findings = violations.map(
    (violation) =>
      `${violation.impact ?? "unknown"} ${violation.id}: ${violation.nodes
        .map((node) => node.target.join(" "))
        .slice(0, 5)
        .join(", ")}`,
  );
  test.info().annotations.push({
    type: "axe",
    description: `${surface}: ${findings.length === 0 ? "none" : findings.join(" | ")}`,
  });
  expect(
    violations
      .filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id }) => id),
    `${surface}\n${findings.join("\n")}`,
  ).toEqual([]);
}

/** Walks every screen of the recommended journey plus optional surfaces. */
async function visitEveryScreen(
  page: Page,
  check: (surface: string) => Promise<void>,
): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".recommended .track-geometry")).toBeVisible();
  await check("Welcome");

  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a track" }),
  ).toBeVisible();
  await check("Track");

  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  await expect(
    page
      .getByTestId("track-builder")
      .getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  await check("Track Builder");
  await page.goto("/");
  await page.getByRole("button", { name: "Choose track and settings" }).click();

  await page.getByRole("button", { name: /Continue to settings/ }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a training plan" }),
  ).toBeVisible();
  await check("Settings");
  await page.getByText("Exact settings").click();
  await check("Settings with exact settings open");

  await page.getByRole("button", { name: /Review experiment/ }).click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await check("Review");

  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(page.getByLabel("Live run status")).toBeVisible({
    timeout: 15_000,
  });
  await check("Training");

  await page.getByRole("button", { name: /Stop after generation/ }).click();
  const openResults = page.getByRole("button", { name: "Open results" });
  await expect(openResults).toBeVisible({ timeout: 90_000 });
  await check("Training finished");
  await openResults.click();

  await expect(page.getByLabel("Result summary")).toBeVisible();
  await check("Results");
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`every screen has no serious or critical WCAG violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await visitEveryScreen(page, (surface) =>
      expectNoSeriousViolations(page, `${surface} ${colorScheme}`),
    );
  });
}

// WCAG 1.4.10: 320 CSS px is a 1280 px window at 400% zoom; 1.4.4: 640 px is 200%.
for (const viewport of [
  { width: 320, height: 640, zoom: "400%" },
  { width: 640, height: 400, zoom: "200%" },
]) {
  test(`every screen reflows without horizontal scrolling at ${viewport.zoom} zoom`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await visitEveryScreen(page, (surface) =>
      expectSurfaceMeetsLimits(page, `${surface} at ${viewport.zoom}`),
    );
  });
}

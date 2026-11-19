import AxeBuilder from "@axe-core/playwright";
import {
  expectSurfaceMeetsLimits,
  openSetup,
  stopAndOpenResults,
} from "./flow";
import { expect, test, type Page } from "@playwright/test";

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

  await openSetup(page);
  await check("Set up");
  await page.getByText("Exact settings").click();
  await check("Set up with exact settings open");

  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  await expect(
    page
      .getByTestId("track-builder")
      .getByText("Draft geometry is valid and ready to use."),
  ).toBeVisible();
  await check("Track Builder");
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(page.getByLabel("Live run status")).toBeVisible();
  await check("Training");

  await stopAndOpenResults(page);
  await check("Results");
}

test("every screen has no serious WCAG violations in dark and light", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await visitEveryScreen(page, async (surface) => {
    for (const colorScheme of ["dark", "light"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoSeriousViolations(page, `${surface} ${colorScheme}`);
      await expectSurfaceMeetsLimits(page, `${surface} ${colorScheme}`);
    }
  });
});

// WCAG 1.4.10: 320 CSS px is a 1280 px window at 400% zoom.
test("every screen reflows without horizontal scrolling at 320 px", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 640 });
  await visitEveryScreen(page, (surface) =>
    expectSurfaceMeetsLimits(page, `${surface} at 320 px`),
  );
});

test("the keyboard alone completes the first experiment with visible focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#page-title")).toBeFocused();
  const tabTo = async (name: RegExp): Promise<void> => {
    for (let press = 0; press < 40; press += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const active = document.activeElement;
        const style = active === null ? null : getComputedStyle(active);
        return {
          label: active?.textContent ?? "",
          outlined: style !== null && style.outlineStyle !== "none",
        };
      });
      if (name.test(focused.label)) {
        expect(focused.outlined).toBe(true);
        return;
      }
    }
    throw new Error(`Tab never reached ${String(name)}`);
  };

  await tabTo(/Set up a race/);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
  await tabTo(/Start training/);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Live run status")).toBeVisible();
  await tabTo(/Stop after generation/);
  await page.keyboard.press("Enter");
  const openResults = page.getByRole("button", { name: "Open results" });
  await expect(openResults).toBeVisible({ timeout: 90_000 });
  await openResults.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Result summary")).toBeVisible();
  await tabTo(/Pause/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Play/ })).toBeFocused();
});

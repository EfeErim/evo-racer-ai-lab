import { expect, test } from "@playwright/test";
import { openMenu, openSetup } from "./flow";

test("Welcome explains the racing loop and provides a local motion control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const journey = page.locator('[aria-label="How EvoRacer works"]');
  await expect(journey.getByText("Set up", { exact: true })).toBeVisible();
  await expect(journey.getByText("Watch", { exact: true })).toBeVisible();
  await expect(journey.getByText("Compare", { exact: true })).toBeVisible();

  await openMenu(page);
  const motion = page.getByRole("button", { name: /Animate races/ });
  await expect(motion).toHaveAttribute("aria-pressed", "true");
  await motion.click();
  await expect(motion).toHaveAttribute("aria-pressed", "false");

  const setUp = page.getByRole("button", { name: "Set up a race" });
  const setUpBox = await setUp.boundingBox();
  expect(setUpBox?.height).toBeGreaterThanOrEqual(44);

  // Windows' "Animation effects: Off" must not freeze the races.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await openMenu(page);
  await expect(motion).toHaveAttribute("aria-pressed", "true");
});

test("custom settings retain disclosure state and keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await openSetup(page);

  const customizer = page.locator("details.settings-customizer");
  await expect(customizer).not.toHaveAttribute("open", "");
  await customizer.locator(":scope > summary").click();

  const seed = page.getByLabel("Random seed");
  await expect(page.getByLabel("Network type")).toHaveAttribute(
    "aria-describedby",
    "algorithm-help",
  );
  await seed.focus();
  await seed.evaluate((input: HTMLInputElement) => {
    input.value = "43";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(customizer).toHaveAttribute("open", "");
  await expect(seed).toBeFocused();
});

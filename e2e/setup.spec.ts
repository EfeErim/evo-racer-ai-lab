import { expect, test } from "@playwright/test";

test("Welcome explains the racing loop and provides a local motion control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const journey = page.locator('[aria-label="How EvoRacer works"]');
  await expect(journey.getByText("Set up", { exact: true })).toBeVisible();
  await expect(journey.getByText("Watch", { exact: true })).toBeVisible();
  await expect(journey.getByText("Compare", { exact: true })).toBeVisible();

  const motion = page.getByRole("button", { name: "Reduce motion" });
  await expect(motion).toHaveAttribute("aria-pressed", "false");
  await expect(motion).toBeEnabled();
  await motion.click();
  await expect(
    page.getByRole("button", { name: "Motion reduced", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const recommended = page.getByRole("button", {
    name: "Review recommended experiment",
  });
  const recommendedBox = await recommended.boundingBox();
  expect(recommendedBox?.height).toBeGreaterThanOrEqual(44);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const showMotion = page.getByRole("button", { name: "Show race motion" });
  await expect(showMotion).toBeEnabled();
  await expect(showMotion).toHaveAttribute("aria-pressed", "false");
  await showMotion.click();
  await expect(
    page.getByRole("button", { name: "Race motion on" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("custom settings retain disclosure state and keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await page.getByRole("button", { name: "Continue to settings" }).click();

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

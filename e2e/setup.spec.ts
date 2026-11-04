import { expect, test } from "@playwright/test";

test("Welcome explains the racing loop and provides a local motion control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const journey = page.locator('[aria-label="How EvoRacer works"]');
  await expect(
    journey.getByText("Choose a track", { exact: true }),
  ).toBeVisible();
  await expect(
    journey.getByText("Watch evolution", { exact: true }),
  ).toBeVisible();
  await expect(
    journey.getByText("Compare the champion", { exact: true }),
  ).toBeVisible();

  const motion = page.getByRole("button", { name: "Reduce motion" });
  await expect(motion).toHaveAttribute("aria-pressed", "false");
  await expect(motion).toBeEnabled();
  await motion.click();
  await expect(
    page.getByRole("button", { name: "Motion reduced", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const recommended = page.getByRole("button", {
    name: "Review recommended setup",
  });
  const recommendedBox = await recommended.boundingBox();
  expect(recommendedBox?.height).toBeGreaterThanOrEqual(44);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const systemMotion = page.getByRole("button", {
    name: "Motion reduced by Windows",
  });
  await expect(systemMotion).toBeDisabled();
  await expect(systemMotion).toHaveAttribute("aria-pressed", "true");
});

test("custom settings retain disclosure state and keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize setup" }).click();
  await page.getByRole("button", { name: "Continue to settings" }).click();

  const customizer = page.locator("details.settings-customizer");
  const advanced = page.locator("details.advanced-settings");
  await customizer.locator(":scope > summary").click();
  await advanced.locator(":scope > summary").click();

  const seed = page.getByLabel("Random seed");
  await expect(page.getByLabel("Algorithm")).toHaveAttribute(
    "aria-describedby",
    "algorithm-help",
  );
  await seed.focus();
  await seed.evaluate((input: HTMLInputElement) => {
    input.value = "43";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(customizer).toHaveAttribute("open", "");
  await expect(advanced).toHaveAttribute("open", "");
  await expect(seed).toBeFocused();
});

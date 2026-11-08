import { expect, type Page } from "@playwright/test";

/** Opens Set up from Home. The recommended track and plan are preselected. */
export async function openSetup(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Set up a race" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up a race", level: 1 }),
  ).toBeVisible();
}

/** Opens Set up and waits until the local core has accepted the setup. */
export async function openValidSetup(page: Page): Promise<void> {
  await openSetup(page);
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
}

/** Opens the top-bar menu that holds motion and Exit. */
export async function openMenu(page: Page): Promise<void> {
  const menu = page.locator("details.app-menu");
  if ((await menu.getAttribute("open")) === null) {
    await menu.locator(":scope > summary").click();
  }
  await expect(menu).toHaveAttribute("open", "");
}

/** The race canvas host on Training. */
export function raceStage(page: Page) {
  return page.locator('[data-race-host="training"]');
}

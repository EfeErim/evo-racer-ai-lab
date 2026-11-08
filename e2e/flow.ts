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

/** Distinct canvas images seen over `ms`, sampled once per animation frame. */
export async function distinctCanvasFrames(
  page: Page,
  selector: string,
  ms: number,
): Promise<number> {
  return page.evaluate(
    ({ selector, ms }) =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>(selector);
        const context = canvas?.getContext("2d");
        if (canvas === null || !context) {
          resolve(0);
          return;
        }
        const seen = new Set<number>();
        const startedAt = performance.now();
        const sample = (): void => {
          const { data } = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          let hash = 0;
          for (let index = 0; index < data.length; index += 16) {
            hash = (hash * 31 + (data[index] ?? 0)) | 0;
          }
          seen.add(hash);
          if (performance.now() - startedAt < ms) {
            requestAnimationFrame(sample);
          } else {
            resolve(seen.size);
          }
        };
        requestAnimationFrame(sample);
      }),
    { selector, ms },
  );
}

import { expect, type Page } from "@playwright/test";

/** Opens Set up from Home and waits until Python has accepted the preselected setup. */
export async function openSetup(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Set up a race" }).click();
  await expect(page.getByText("Setup is valid", { exact: true })).toBeVisible();
}

/** Opens Set up and presses Start on the recommended setup. */
export async function startRecommendedRun(page: Page): Promise<void> {
  await openSetup(page);
  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(page.getByLabel("Live run status")).toBeVisible();
}

/** Stops a run at the next generation boundary and opens Results. */
export async function stopAndOpenResults(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Stop after generation/ }).click();
  await page
    .getByRole("button", { name: "Open results" })
    .click({ timeout: 90_000 });
  await expect(page.getByLabel("Result summary")).toBeVisible();
}

/** Opens the top-bar menu that holds motion and Exit. */
export async function openMenu(page: Page): Promise<void> {
  const menu = page.locator("details.app-menu");
  if ((await menu.getAttribute("open")) === null) {
    await menu.locator(":scope > summary").click();
  }
  await expect(menu).toHaveAttribute("open", "");
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

/** Measures what actually rendered, not what the stylesheet intended. */
async function measureSurface(page: Page) {
  return page.evaluate(() => {
    const parse = (color: string) => {
      const parts = (/rgba?\(([^)]+)\)/.exec(color)?.[1] ?? "0 0 0")
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return {
        r: parts[0] ?? 0,
        g: parts[1] ?? 0,
        b: parts[2] ?? 0,
        a: parts[3] ?? 1,
      };
    };
    type Color = ReturnType<typeof parse>;
    const over = (top: Color, bottom: Color): Color => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });
    const luminance = ({ r, g, b }: Color): number => {
      const channel = (value: number): number => {
        const scaled = value / 255;
        return scaled <= 0.03928
          ? scaled / 12.92
          : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const backgroundOf = (element: Element): Color => {
      const stack: Color[] = [];
      for (
        let node: Element | null = element;
        node !== null;
        node = node.parentElement
      ) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color.a > 0) {
          stack.push(color);
          if (color.a === 1) {
            break;
          }
        }
      }
      let background: Color = { r: 255, g: 255, b: 255, a: 1 };
      for (const color of stack.reverse()) {
        background = over(color, background);
      }
      return background;
    };
    const visible = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        box.width > 1 &&
        box.height > 1 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };

    const tooSmall: string[] = [];
    const lowContrast: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      const element = node.parentElement;
      if (text === "" || element === null || !visible(element)) {
        continue;
      }
      const style = getComputedStyle(element);
      const size = Number.parseFloat(style.fontSize);
      const allowedSmall = element.closest(".data-id, code, .chart-frame");
      if (size < 12 || (size < 14 && allowedSmall === null)) {
        tooSmall.push(`${String(size)}px: ${text.slice(0, 40)}`);
      }
      if (element.closest(":disabled") === null) {
        const background = backgroundOf(element);
        const foreground = luminance(over(parse(style.color), background));
        const behind = luminance(background);
        const ratio =
          (Math.max(foreground, behind) + 0.05) /
          (Math.min(foreground, behind) + 0.05);
        if (ratio < 4.5) {
          lowContrast.push(`${ratio.toFixed(2)}: ${text.slice(0, 40)}`);
        }
      }
    }

    const targets = [
      ...document.querySelectorAll<HTMLElement>(
        "button, a[href], summary, select, input:not([type=radio]):not([type=range]):not([type=file])",
      ),
    ].filter(visible);
    const smallTargets = targets
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width < 24 || box.height < 24;
      })
      .map((element) => element.textContent.trim().slice(0, 30));
    const smallPrimary = targets
      .filter(
        (element) =>
          element.classList.contains("primary") &&
          !element.classList.contains("compact") &&
          element.getBoundingClientRect().height < 44,
      )
      .map((element) => element.textContent.trim().slice(0, 30));

    return {
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      tooSmall: [...new Set(tooSmall)],
      lowContrast: [...new Set(lowContrast)],
      smallTargets,
      smallPrimary,
    };
  });
}

export async function expectSurfaceMeetsLimits(page: Page, surface: string) {
  // Measure settled colors, not a hover or enable transition in flight.
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  const measured = await measureSurface(page);
  expect(measured, surface).toEqual({
    overflowX: 0,
    tooSmall: [],
    lowContrast: [],
    smallTargets: [],
    smallPrimary: [],
  });
}

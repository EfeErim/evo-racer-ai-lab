import { expect, test, type Page } from "@playwright/test";

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

async function expectSurfaceMeetsLimits(page: Page, surface: string) {
  const measured = await measureSurface(page);
  expect(measured, surface).toEqual({
    overflowX: 0,
    tooSmall: [],
    lowContrast: [],
    smallTargets: [],
    smallPrimary: [],
  });
}

async function startRecommendedRun(page: Page) {
  await page
    .getByRole("button", { name: "Review recommended experiment" })
    .click();
  await expect(page.getByText("Setup is valid")).toBeVisible();
  await page.getByRole("button", { name: /Start training/ }).click();
}

for (const colorScheme of ["dark", "light"] as const) {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`text, targets, contrast, and overflow hold at ${String(viewport.width)}px in ${colorScheme}`, async ({
      page,
    }) => {
      const label = `${String(viewport.width)}px ${colorScheme}`;
      await page.emulateMedia({ colorScheme, reducedMotion: "no-preference" });
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator(".recommended .track-geometry")).toBeVisible();
      await expectSurfaceMeetsLimits(page, `Welcome ${label}`);
      await expect(
        page.getByRole("button", { name: "Review recommended experiment" }),
      ).toBeInViewport();

      await page
        .getByRole("button", { name: "Review recommended experiment" })
        .click();
      await expect(page.getByText("Setup is valid")).toBeVisible();
      await expectSurfaceMeetsLimits(page, `Review ${label}`);

      await page.getByRole("button", { name: /Start training/ }).click();
      await expect(page.getByLabel("Live run status")).toBeVisible({
        timeout: 15_000,
      });
      await expectSurfaceMeetsLimits(page, `Training ${label}`);
      await expect(page.locator(".telemetry-disclosure")).not.toHaveAttribute(
        "open",
        "",
      );
      const stage = await page.locator(".live-race-stage").boundingBox();
      const side = await page.locator(".run-overview").boundingBox();
      expect((stage?.width ?? 0) * (stage?.height ?? 0)).toBeGreaterThan(
        (side?.width ?? 0) * (side?.height ?? 0),
      );

      await page.getByRole("button", { name: /Stop after generation/ }).click();
      const openResults = page.getByRole("button", { name: "Open results" });
      await expect(openResults).toBeVisible({ timeout: 90_000 });
      await expect(openResults).toBeInViewport();
      await expectSurfaceMeetsLimits(page, `Training terminal ${label}`);
      await openResults.click();

      await expect(page.getByLabel("Result summary")).toBeVisible();
      await expectSurfaceMeetsLimits(page, `Results ${label}`);
      await expect(page.locator(".chart-axis-x")).toHaveText(
        "Generation (count)",
      );
      await expect(page.locator(".chart-axis-y")).toHaveText("Fitness (score)");
      const yTicks = await page
        .locator(".chart-y-ticks text")
        .evaluateAll((labels) =>
          labels.map((text) => text.getBoundingClientRect().top),
        );
      expect(new Set(yTicks).size).toBe(yTicks.length);
    });
  }
}

test("the keyboard alone completes the first experiment with visible focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#page-title")).toBeFocused();

  const focusIsVisible = (): Promise<boolean> =>
    page.evaluate(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        return false;
      }
      const style = getComputedStyle(active);
      return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
    });
  const tabTo = async (name: RegExp): Promise<void> => {
    for (let press = 0; press < 40; press += 1) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(
        () => document.activeElement?.textContent ?? "",
      );
      if (name.test(label)) {
        expect(await focusIsVisible()).toBe(true);
        return;
      }
    }
    throw new Error(`Tab never reached ${String(name)}`);
  };

  await tabTo(/Review recommended experiment/);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Setup is valid")).toBeVisible();
  await expect(page.locator("#page-title")).toBeFocused();
  await tabTo(/Start training/);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Live run status")).toBeVisible({
    timeout: 15_000,
  });
  await tabTo(/Stop after generation/);
  await page.waitForTimeout(600);
  expect(await focusIsVisible()).toBe(true);
  await page.keyboard.press("Enter");
  const openResults = page.getByRole("button", { name: "Open results" });
  await expect(openResults).toBeVisible({ timeout: 90_000 });
  await openResults.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Result summary")).toBeVisible();
  await tabTo(/Pause/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Play/ })).toBeFocused();
  await expect(page.getByText(/Frame \d+ of \d+/)).toBeVisible();
});

test("a slow press on a run control survives observation updates", async ({
  page,
}) => {
  await page.goto("/");
  await startRecommendedRun(page);
  const stop = page.getByRole("button", { name: /Stop after generation/ });
  await expect(stop).toBeVisible({ timeout: 15_000 });
  await stop.scrollIntoViewIfNeeded();
  const box = await stop.boundingBox();
  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Open results" })).toBeVisible({
    timeout: 90_000,
  });
});

test("the recommended action always reviews the recommended setup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await page
    .locator('input[name="trackPreset"][value="chicane-challenge"]')
    .check({ force: true });
  await page.getByRole("button", { name: "Continue to settings" }).click();
  await page.locator('[data-training-preset="balanced"]').click();
  await page.locator('.progress-list [data-route="welcome"]').click();

  await page
    .getByRole("button", { name: "Review recommended experiment" })
    .click();
  await expect(page.getByText("Setup is valid")).toBeVisible();
  await expect(page.locator(".review-summary")).toContainText("Easy Oval");
  await expect(page.locator(".review-summary")).toContainText("Quick check");
  await expect(page.locator(".review-summary")).toContainText(
    "Up to 160 candidate evaluations",
  );
});

test("Review and Start submit exactly the active track", async ({ page }) => {
  let submitted: unknown;
  await page.route("**/v1/runs/start", async (route) => {
    submitted = (route.request().postDataJSON() as { track: unknown }).track;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        valid: false,
        errors: [{ code: "TEST", field: "track", message: "Captured." }],
      }),
    });
  });
  let generated: unknown;
  await page.route("**/v1/tracks/generate", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      compiled?: { track?: unknown };
    };
    generated = body.compiled?.track;
    await route.fulfill({ response });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Choose track and settings" }).click();
  await page.getByRole("button", { name: /Open Track Builder/ }).click();
  const builder = page.getByTestId("track-builder");
  await builder.getByRole("tab", { name: /Generate/ }).click();
  await builder.locator("[data-generator-seed]").fill("555");
  await builder.getByRole("button", { name: "Generate track" }).click();
  await builder.getByRole("button", { name: "Use this track" }).click();
  await page.getByRole("button", { name: "Continue to settings" }).click();
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByText("Setup is valid")).toBeVisible();
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(
    page.getByRole("alert", { name: "Training did not start" }),
  ).toContainText("Captured.");

  expect(generated).toBeTruthy();
  expect(submitted).toEqual(generated);
});

test("Results replay can be paused, stepped, and restarted, and Review is reachable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await startRecommendedRun(page);
  await expect(page.getByLabel("Live run status")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Stop after generation/ }).click();
  await page
    .getByRole("button", { name: "Open results" })
    .click({ timeout: 90_000 });

  const marker = page.locator(".replay-stage .track-replay-marker");
  await expect(page.getByText("Playing at 1× speed")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  const status = page.getByText(/Frame \d+ of \d+/);
  await expect(status).toBeVisible();
  const held = await marker.getAttribute("transform");
  await page.waitForTimeout(150);
  expect(await marker.getAttribute("transform")).toBe(held);

  const before = /Frame (\d+)/.exec(await status.innerText())?.[1];
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect(status).not.toContainText(`Frame ${before ?? "?"} of`);
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(status).toContainText("Frame 1 of");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByText("Playing at 1× speed")).toBeVisible();

  await page.getByRole("button", { name: "Back to Review" }).click();
  await expect(
    page.getByRole("heading", { name: "Review and start" }),
  ).toBeVisible();
  await expect(page.getByText("Setup is valid")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start training/ }),
  ).toBeEnabled();
});

test("reduced motion holds still without changing what the run produces", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".recommended .track-geometry")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const button = document.querySelector(".button.primary");
      return button === null
        ? "missing"
        : getComputedStyle(button).transitionDuration;
    }),
  ).toBe("0s");
  await startRecommendedRun(page);
  await expect(page.getByLabel("Live run status")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Stop after generation/ }).click();
  await page
    .getByRole("button", { name: "Open results" })
    .click({ timeout: 90_000 });
  const marker = page.locator(".replay-stage .track-replay-marker");
  const held = await marker.getAttribute("transform");
  await page.waitForTimeout(200);
  expect(await marker.getAttribute("transform")).toBe(held);
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
  await page.getByRole("button", { name: "Step back" }).click();
  expect(await marker.getAttribute("transform")).not.toBe(held);
});

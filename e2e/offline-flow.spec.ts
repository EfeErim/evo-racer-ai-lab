import { expect, test } from "@playwright/test";

test("recommended offline run reaches results without starting automatically", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Start an AI racing experiment." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "05 Training", exact: true }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Review recommended setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the setup." }),
  ).toBeVisible();
  await expect(page.getByText("Configuration valid")).toBeVisible();

  await page.getByRole("button", { name: /Start training/ }).click();
  await expect(
    page.getByRole("heading", { name: "Training workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Stop after generation/ }).click();
  await expect(page.getByRole("button", { name: /Open results/ })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: /Open results/ }).click();

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.getByText("Champion fitness")).toBeVisible();
  await expect(page.getByText("Champion and baselines")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

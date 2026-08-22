import { expect, test } from "@playwright/test";
import { installApiMocks } from "./mock";

test("renders the generated app read-only, without editor chrome", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/p/app-1");

  await expect(page.getByText("Hello")).toBeVisible();
  await expect(page.getByText("Tap")).toBeVisible();
  await expect(page.getByText("Инспектор")).toHaveCount(0);
});

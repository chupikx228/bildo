import { expect, test } from "@playwright/test";
import { installApiMocks } from "./mock";

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/editor/app-1");
  await expect(page.getByText("Инспектор")).toBeVisible();
});

test("selecting a node reveals its properties in the inspector", async ({ page }) => {
  await expect(page.getByText("Позиция")).toHaveCount(0);

  await page.getByText("Hello").first().click({ force: true });

  await expect(page.getByText("Позиция")).toBeVisible();
  await expect(page.getByText("Внешний вид")).toBeVisible();
});

test("undo and redo restore an edited node label", async ({ page }) => {
  await page.getByText("Hello").first().dblclick({ force: true });
  const inlineEditor = page.locator("textarea:focus");
  await inlineEditor.fill("Hello world");
  await inlineEditor.press("Enter");
  await expect(page.getByText("Hello world").first()).toBeVisible();

  await page.keyboard.press("Control+z");
  await expect(page.getByText("Hello").first()).toBeVisible();
  await expect(page.getByText("Hello world")).toHaveCount(0);

  await page.keyboard.press("Control+y");
  await expect(page.getByText("Hello world").first()).toBeVisible();
});

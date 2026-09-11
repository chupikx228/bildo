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

test("preview interactions stay ephemeral and never autosave", async ({ page }) => {
  const puts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/api/apps/")) puts.push(r.url());
  });

  await page.getByRole("button", { name: "Превью" }).click();
  await expect(page.getByText("0", { exact: true })).toBeVisible();

  await page.getByText("Bump").click({ force: true });
  await expect(page.getByText("1", { exact: true })).toBeVisible();

  await page.waitForTimeout(1500);
  expect(puts).toHaveLength(0);

  await page.getByRole("button", { name: "Остановить" }).click();
  await expect(page.getByText("0", { exact: true })).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toHaveCount(0);
});

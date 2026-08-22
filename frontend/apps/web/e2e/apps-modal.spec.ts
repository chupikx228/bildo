import { expect, test } from "@playwright/test";
import { installApiMocks } from "./mock";

const APPS = [
  { id: "a1", name: "First app", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "a2", name: "Second app", updatedAt: "2026-01-02T00:00:00.000Z" },
];

test("lists apps and deletes one behind a confirm step", async ({ page }) => {
  await installApiMocks(page, { apps: APPS });
  await page.goto("/");

  await page.getByRole("button", { name: "Мои приложения" }).click();
  await expect(page.getByText("First app")).toBeVisible();
  await expect(page.getByText("Second app")).toBeVisible();

  const secondRow = page.locator("li").filter({ hasText: "Second app" });
  await secondRow.getByRole("button", { name: "Удалить" }).click();

  const confirm = secondRow.getByRole("button", { name: "Точно?" });
  await expect(confirm).toBeVisible();
  await confirm.click();

  await expect(page.getByText("Second app")).toHaveCount(0);
  await expect(page.getByText("First app")).toBeVisible();
});

test("shows the empty state when there are no apps", async ({ page }) => {
  await installApiMocks(page, { apps: [] });
  await page.goto("/");

  await page.getByRole("button", { name: "Мои приложения" }).click();
  await expect(page.getByText("Пока пусто", { exact: false })).toBeVisible();
});

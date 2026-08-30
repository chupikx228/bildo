import { expect, test } from "@playwright/test";
import { installApiMocks } from "./mock";

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/editor/app-1");
  await expect(page.getByText("Инспектор")).toBeVisible();
});

test("sends a message, receives a proposal, and applies it to the document", async ({ page }) => {
  const composer = page.getByPlaceholder("Опишите изменение…");
  await composer.fill("переименуй приложение");
  await page.getByRole("button", { name: "Отправить" }).click();

  await expect(page.getByText("Готово — предлагаю переименовать приложение.")).toBeVisible();

  const apply = page.getByRole("button", { name: "Применить" });
  await expect(apply).toBeVisible();
  await apply.click();

  await expect(page.getByRole("textbox", { name: "Название приложения" })).toHaveValue("Renamed");
  await expect(page.getByRole("button", { name: "Применить" })).toHaveCount(0);
});

test("rejecting a proposal leaves the document unchanged", async ({ page }) => {
  const composer = page.getByPlaceholder("Опишите изменение…");
  await composer.fill("переименуй приложение");
  await page.getByRole("button", { name: "Отправить" }).click();

  const reject = page.getByRole("button", { name: "Отклонить" });
  await expect(reject).toBeVisible();
  await reject.click();

  await expect(page.getByText("Отклонено — ничего не изменилось.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Название приложения" })).toHaveValue("Demo App");
});

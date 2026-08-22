import { expect, test } from "@playwright/test";
import { installApiMocks, NEW_APP_ID } from "./mock";

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
});

test("keeps the submit button disabled until the prompt reaches three characters", async ({ page }) => {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "Создать приложение" });
  const prompt = page.getByPlaceholder(/Например/);

  await expect(submit).toBeDisabled();

  await prompt.fill("ab");
  await expect(submit).toBeDisabled();

  await prompt.fill("app");
  await expect(submit).toBeEnabled();
});

test("creating an app from a prompt lands in the editor", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Например/).fill("трекер привычек");
  await page.getByRole("button", { name: "Создать приложение" }).click();

  await expect(page).toHaveURL(new RegExp(`/editor/${NEW_APP_ID}$`));
  await expect(page.getByText("Инспектор")).toBeVisible();
  await expect(page.getByText("Hello").first()).toBeVisible();
});

test("an example prompt creates an app in one click", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Трекер привычек: сегодня, статистика, настройки" }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${NEW_APP_ID}$`));
});

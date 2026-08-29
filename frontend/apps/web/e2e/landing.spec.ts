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

test("the picked model is listed from the catalog and sent with the create request", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Выбрать модель" }).click();

  const option = page.getByRole("option", { name: /OpenAI: GPT-5/ });
  await expect(option).toBeVisible();
  await expect(page.getByRole("option", { name: /DeepSeek V4 Flash/ })).toBeVisible();
  await option.click();

  await page.getByPlaceholder(/Например/).fill("трекер привычек");
  const request = page.waitForRequest((r) => r.url().includes("/api/apps") && r.method() === "POST");
  await page.getByRole("button", { name: "Создать приложение" }).click();

  expect((await request).postDataJSON()).toMatchObject({ prompt: "трекер привычек", model: "openai/gpt-5" });
});

test("without touching the picker the create request asks for the auto model", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Например/).fill("трекер привычек");
  const request = page.waitForRequest((r) => r.url().includes("/api/apps") && r.method() === "POST");
  await page.getByRole("button", { name: "Создать приложение" }).click();

  expect((await request).postDataJSON()).toMatchObject({ model: "auto" });
});

test("a rejected model from the create request is shown to the user", async ({ page }) => {
  await page.goto("/");
  await page.route(
    (url) => url.pathname === "/api/apps",
    (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: "Модель «openai/gpt-5» недоступна в каталоге RouterAI" }),
      }),
  );

  await page.getByPlaceholder(/Например/).fill("трекер привычек");
  await page.getByRole("button", { name: "Создать приложение" }).click();

  await expect(page.getByText("Модель «openai/gpt-5» недоступна в каталоге RouterAI")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("a create error is shown inside the AI-interview flow, not swallowed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Не знаете, с чего начать/ }).click();

  await page.getByRole("button", { name: "Трекер привычек" }).click();
  await page.getByRole("button", { name: "Для себя" }).click();
  await page.getByRole("button", { name: "Главная" }).click();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("button", { name: "Светлое и воздушное" }).click();
  await page.getByRole("button", { name: "Собрать бриф" }).click();

  await page.route(
    (url) => url.pathname === "/api/apps",
    (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: "Модель «openai/gpt-5» недоступна в каталоге RouterAI" }),
      }),
  );

  await page.getByRole("button", { name: "Создать приложение" }).click();

  await expect(page.getByText("Модель «openai/gpt-5» недоступна в каталоге RouterAI")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

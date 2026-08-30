import { expect, test, type Page } from "@playwright/test";
import { installApiMocks } from "./mock";

const APP_ID = "app-1";

const badgeOf = (page: Page) => page.locator("header").getByText(/^(Сохранено|Сохранение…|Не сохранено|Ошибка)$/);

const putRequest = (page: Page) =>
  page.waitForRequest((r) => r.method() === "PUT" && new URL(r.url()).pathname === `/api/apps/${APP_ID}`);

async function editText(page: Page, from: string, to: string): Promise<void> {
  await page.getByText(from).first().dblclick({ force: true });
  const inlineEditor = page.locator("textarea:focus");
  await inlineEditor.fill(to);
  await inlineEditor.press("Enter");
  await expect(page.getByText(to).first()).toBeVisible();
}

test("two consecutive autosaves walk the revision forward", async ({ page }) => {
  const mocks = await installApiMocks(page);
  await page.goto(`/editor/${APP_ID}`);
  await expect(page.getByText("Инспектор")).toBeVisible();
  expect(mocks.getRevision(APP_ID)).toBe(1);

  const first = putRequest(page);
  await editText(page, "Hello", "Первая правка");
  expect(((await first).postDataJSON() as { revision: number }).revision).toBe(1);
  await expect(badgeOf(page)).toHaveText("Сохранено");
  expect(mocks.getRevision(APP_ID)).toBe(2);

  const second = putRequest(page);
  await editText(page, "Первая правка", "Вторая правка");
  expect(((await second).postDataJSON() as { revision: number }).revision).toBe(2);
  await expect(badgeOf(page)).toHaveText("Сохранено");
  expect(mocks.getRevision(APP_ID)).toBe(3);
});

test("a stale revision is rejected with 412 and the edit is not silently dropped", async ({ page }) => {
  const mocks = await installApiMocks(page);
  await page.goto(`/editor/${APP_ID}`);
  await expect(page.getByText("Инспектор")).toBeVisible();

  await editText(page, "Hello", "Правка клиента");
  await expect(badgeOf(page)).toHaveText("Сохранено");
  expect(mocks.getRevision(APP_ID)).toBe(2);

  expect(mocks.bumpRevision(APP_ID)).toBe(3);

  const stale = putRequest(page);
  const rejected = page.waitForResponse(
    (r) => r.request().method() === "PUT" && new URL(r.url()).pathname === `/api/apps/${APP_ID}`,
  );
  await editText(page, "Правка клиента", "Правка поверх устаревшей ревизии");

  expect(((await stale).postDataJSON() as { revision: number }).revision).toBe(2);
  expect((await rejected).status()).toBe(412);

  await expect(badgeOf(page)).toHaveText("Ошибка");
  await expect(page.getByText("Правка поверх устаревшей ревизии").first()).toBeVisible();
  expect(mocks.getRevision(APP_ID)).toBe(3);
  expect(JSON.stringify(mocks.getDocument(APP_ID))).not.toContain("Правка поверх устаревшей ревизии");
});

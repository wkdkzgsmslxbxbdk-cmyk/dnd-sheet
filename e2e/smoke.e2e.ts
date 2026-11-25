import { expect, test } from "@playwright/test";
import { expectNoOverflow, watchErrors } from "./helpers";

test("desktop: app loads, creates a character, all tabs render", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "+ Новый персонаж" }).click();
  await page.getByRole("button", { name: /Я знаю правила/ }).click();
  await page.locator(".topbar button", { hasText: "Готово" }).click();
  for (const t of ["Бой", "Магия", "Вещи", "Умения", "Лист"]) {
    await page.locator(".bottomnav button", { hasText: t }).click();
    await expectNoOverflow(page, t);
  }
  expect(errors).toEqual([]);
});

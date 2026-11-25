// The creation wizard as a first-time player uses it.
import { expect, test, type Page } from "@playwright/test";
import { expectNoGarbage, expectNoOverflow, watchErrors } from "./helpers";

const stepTitle = (page: Page) => page.locator(".wiz-step-title");
const next = (page: Page) => page.locator(".wiz-footer button", { hasText: /^(Далее|Пропустить)$/ }).click();

test("novice: only 'Далее' and the big buttons gives a playable character", async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "+ Новый персонаж" }).click();
  await expect(stepTitle(page)).toHaveText("Кем вы хотите играть?");
  for (let i = 0; i < 15; i++) {
    const t = await stepTitle(page).innerText();
    await expectNoOverflow(page, `wizard step ${t}`);
    await expectNoGarbage(page, `wizard step ${t}`);
    await page.screenshot({ path: `e2e/shots/${info.project.name}-wizard-${i}.png`, fullPage: true });
    if (t === "Готово!") break;
    if (t === "Снаряжение") await page.getByRole("button", { name: "Взять и дальше" }).click();
    else await next(page);
  }
  await expect(stepTitle(page)).toHaveText("Готово!");
  await page.getByRole("button", { name: "Начать играть" }).click();
  // the sheet: a fighter in chain mail with a shield and recommended scores
  await expect(page.locator(".topbar")).toContainText("Воин");
  await expect(page.locator(".stat", { hasText: "КД" }).first()).toContainText("18");
  await expect(page.locator(".stat", { hasText: "СИЛ" })).toContainText("+3");
  await expectNoOverflow(page, "sheet after wizard");
  // skills were filled automatically when the novice just pressed "Далее"
  await expect(page.locator(".content")).not.toContainText("Навыки класса: выбрано 0");
  expect(errors).toEqual([]);
});

test("choosing: halfling rogue with recommended picks", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "+ Новый персонаж" }).click();
  // class info sheet shows the level path
  const rogue = page.locator(".choice", { has: page.locator(".nm", { hasText: /^Плут$/ }) });
  await rogue.getByRole("button", { name: /Подробнее/ }).click();
  await expect(page.locator(".sheet .timeline .lvl")).toHaveCount(20);
  await page.locator(".sheet").getByRole("button", { name: /Выбрать: Плут/ }).click();
  await next(page);
  await expect(stepTitle(page)).toHaveText("Раса");
  await page.locator(".choice", { has: page.locator(".nm", { hasText: /^Полурослик$/ }) }).click();
  await next(page);
  await expect(stepTitle(page)).toContainText("разновидность");
  await page.locator(".choice").first().click();
  await next(page);
  await expect(stepTitle(page)).toHaveText("Характеристики");
  await expect(page.locator(".ability-row", { hasText: "Ловкость" }).locator("select")).toHaveValue("15");
  await next(page);
  await expect(stepTitle(page)).toHaveText("Предыстория");
  await expect(page.locator(".choice.on")).toContainText("Шарлатан"); // PHB quick build for rogue
  await next(page);
  await expect(stepTitle(page)).toHaveText("Навыки");
  await page.getByRole("button", { name: "Выбрать за меня" }).click();
  await expect(page.locator(".pill", { hasText: /Выбрано 4 из 4/ })).toBeVisible();
  // skip forward to gear
  for (let i = 0; i < 4 && (await stepTitle(page).innerText()) !== "Снаряжение"; i++) await next(page);
  await expect(page.locator(".content")).toContainText("Рапира");
  await page.getByRole("button", { name: "Взять и дальше" }).click();
  await expect(stepTitle(page)).toHaveText("Внешность и имя");
  await page.locator("input[placeholder='Как зовут героя?']").fill("Пип");
  await page.getByRole("button", { name: /Рост и вес/ }).click();
  await expect(page.locator(".grid2 > div", { hasText: "Рост" }).locator("input")).toHaveValue(/см/);
  await next(page);
  await page.getByRole("button", { name: "Начать играть" }).click();
  await expect(page.locator(".topbar")).toContainText("Пип");
  await page.locator(".bottomnav button", { hasText: "Бой" }).click();
  await expect(page.locator(".li.tap", { hasText: "Рапира" })).toBeVisible();
  expect(errors).toEqual([]);
});

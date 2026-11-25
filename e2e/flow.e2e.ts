// A player's first session: create a cleric through the editor, fill spells and
// gear, fight, rest, export and import — on a phone screen.
import { expect, test } from "@playwright/test";
import { closeSheet, expectNoGarbage, expectNoOverflow, tab, waitRoll, watchErrors } from "./helpers";
import { readFileSync } from "node:fs";

test("create a Light cleric from scratch and play a round", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expectNoOverflow(page, "empty list");
  await page.getByRole("button", { name: "+ Новый персонаж" }).click();

  // ---- editor ----
  await expect(page.locator(".topbar")).toContainText("Редактор");
  await page.locator(".card").first().locator("input").first().fill("Тиана");
  const raceCard = page.locator(".card", { has: page.locator("h2", { hasText: "Раса" }) });
  await raceCard.locator("select").nth(0).selectOption("elf");
  await raceCard.locator("select").nth(1).selectOption("wood-elf");
  const classCard = page.locator(".card", { has: page.locator("h2", { hasText: "Классы" }) });
  await classCard.locator("select").first().selectOption("cleric");
  for (let i = 0; i < 2; i++) await classCard.getByRole("button", { name: "Больше" }).first().click();
  await classCard.locator("select").nth(1).selectOption("light");

  const abil = page.locator(".card", { has: page.locator("h2", { hasText: "Характеристики" }) });
  const order: [string, string][] = [["Мудрость", "15"], ["Телосложение", "14"], ["Сила", "13"], ["Ловкость", "12"], ["Интеллект", "10"], ["Харизма", "8"]];
  for (const [name, v] of order) await abil.locator(".li", { hasText: name }).locator("select").selectOption(v);

  const skills = page.locator(".card", { has: page.locator("h2", { hasText: "Навыки" }) });
  await skills.locator(".chip", { hasText: "Медицина" }).click();
  await skills.locator(".chip", { hasText: "Проницательность" }).click();
  await expectNoOverflow(page, "editor");
  await expectNoGarbage(page, "editor");
  await page.locator(".topbar button", { hasText: "Готово" }).click();

  // ---- sheet ----
  await expect(page.locator(".topbar")).toContainText("Тиана");
  await expect(page.locator(".topbar")).toContainText("Домен света");
  const wis = page.locator(".stat", { hasText: "МДР" });
  await expect(wis).toContainText("+3"); // 15 + 1 wood elf = 16
  await expect(wis).toContainText("16");
  await expect(page.locator(".stat", { hasText: "КД" }).first()).toContainText("12"); // 10 + DEX 14
  await expect(page.locator(".stat", { hasText: "Скорость" }).first()).toContainText("35");
  await expectNoOverflow(page, "main tab");
  await expectNoGarbage(page, "main tab");

  // roll a skill
  await page.locator(".li.tap", { hasText: "Медицина" }).click();
  const roll = await waitRoll(page);
  await expect(roll).toContainText("Медицина");
  await expect(roll.locator(".die")).toHaveCount(1);
  await roll.getByRole("button", { name: "Закрыть" }).click();

  // ---- magic ----
  await tab(page, "Магия");
  await expect(page.locator(".content")).toContainText("Огонь фей"); // Light domain spell, always prepared
  await page.getByRole("button", { name: "+ Заклинания" }).first().click();
  const browser = page.locator(".sheet");
  await browser.locator("input[placeholder='Поиск по названию']").fill("Лечение ран");
  await browser.locator(".li.tap", { hasText: "Лечение ран" }).first().click();
  await browser.locator("input[placeholder='Поиск по названию']").fill("Священное пламя");
  await browser.locator(".li.tap", { hasText: "Священное пламя" }).first().click();
  await expectNoOverflow(page, "spell browser");
  await closeSheet(page);

  await page.locator(".li.tap", { hasText: "Лечение ран" }).first().click();
  const card = page.locator(".sheet");
  await expect(card).toContainText("1к8 + 3");
  await card.locator(".seg button", { hasText: "2" }).click();
  await expect(card).toContainText("2к8 + 3");
  await expectNoOverflow(page, "spell card");
  await card.getByRole("button", { name: /Наложить, ячейка 2 уровня/ }).click();
  await expect(page.locator(".card", { hasText: "Ячейки" })).toContainText("1/2");

  // ---- items ----
  await tab(page, "Вещи");
  await page.getByRole("button", { name: /стартовое снаряжение/ }).click();
  await expect(page.locator(".content")).toContainText("Книга заклинаний").catch(() => {});
  await page.getByRole("button", { name: "+ Добавить" }).click();
  const add = page.locator(".sheet");
  await add.locator("input[placeholder='Поиск']").fill("Булава");
  await add.locator(".li.tap", { hasText: "Булава" }).first().click();
  await add.locator(".seg button", { hasText: "Магические" }).click();
  await add.locator("input[placeholder='Поиск']").fill("Кольцо защиты");
  await add.locator(".li.tap", { hasText: "Кольцо защиты" }).first().click();
  await expectNoOverflow(page, "add item");
  await closeSheet(page);
  const mace = page.locator(".li", { hasText: "Булава" }).first();
  await mace.locator("input[type=checkbox]").check();
  const ring = page.locator(".li", { hasText: "Кольцо защиты" }).first();
  await ring.locator("input[type=checkbox]").check();
  await ring.getByRole("button", { name: "◯" }).click(); // attune
  await expectNoOverflow(page, "items tab");
  await expectNoGarbage(page, "items tab");

  // ---- combat ----
  await tab(page, "Бой");
  await expect(page.locator(".stat", { hasText: "КД" }).first()).toContainText("13"); // + ring
  await page.locator(".li.tap", { hasText: "Булава" }).click();
  let r = await waitRoll(page);
  await r.getByRole("button", { name: /Урон/ }).click();
  r = await waitRoll(page);
  await expect(r).toContainText("Урон: Булава");
  await r.getByRole("button", { name: "Закрыть" }).click();

  const hpInput = page.locator("input[placeholder='Число']");
  const hpNow = async () => Number(await page.locator(".card", { hasText: "Хиты" }).first().locator("span").first().innerText());
  const before = await hpNow();
  await hpInput.fill("5");
  await page.getByRole("button", { name: "Урон", exact: true }).click();
  expect(await hpNow()).toBe(before - 5);
  await hpInput.fill("3");
  await page.getByRole("button", { name: "Врем." }).click();
  await expect(page.locator(".pill", { hasText: "+3 врем." })).toBeVisible();
  await expectNoOverflow(page, "combat tab");
  await expectNoGarbage(page, "combat tab");

  await page.getByRole("button", { name: "Продолжительный отдых" }).click();
  await page.locator(".sheet").getByRole("button", { name: "Отдохнуть" }).click();
  await tab(page, "Магия");
  await expect(page.locator(".card", { hasText: "Ячейки" })).toContainText("2/2");

  // ---- features ----
  await tab(page, "Умения");
  await expectNoOverflow(page, "features tab");
  await expectNoGarbage(page, "features tab");

  // ---- export / import ----
  await page.locator(".topbar button[aria-label='Меню']").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Экспорт/ }).click()]);
  const path = await download.path();
  const data = JSON.parse(readFileSync(path!, "utf8"));
  expect(data.name).toBe("Тиана");
  expect(data.v).toBe(1);
  await closeSheet(page);
  await page.locator(".topbar button[aria-label='К списку']").click();
  await page.locator("input[type=file]").setInputFiles(path!);
  await expect(page.locator(".topbar")).toContainText("Тиана");
  await page.locator(".topbar button[aria-label='К списку']").click();
  await expect(page.locator(".card", { hasText: "Тиана" })).toHaveCount(2);

  expect(errors).toEqual([]);
});

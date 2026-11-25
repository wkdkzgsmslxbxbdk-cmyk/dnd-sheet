// Dice: the shown dice add up to the total, advantage shows two d20 and resets,
// the damage button appears only after the dice land, animation can be turned off.
import { expect, test } from "@playwright/test";
import { closeSheet, seedCharacter, waitRoll, watchErrors } from "./helpers";

const FIGHTER = {
  id: "f", name: "Тест", raceId: "human", base: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
  classes: [{ classId: "fighter", subclassId: null, level: 5, hpRolls: [] }],
  inventory: [{ uid: "a", baseId: "longsword", magicId: null, custom: null, qty: 1, equipped: true, attuned: false }],
};

const dieValues = async (box: import("@playwright/test").Locator) =>
  (await box.locator(".die:not(.dropped) .die-num").allTextContents()).map(Number);

test("check roll: dice + bonus = total, advantage", async ({ page }) => {
  const errors = watchErrors(page);
  await seedCharacter(page, FIGHTER);
  await page.locator(".stat", { hasText: "СИЛ" }).click();
  let box = await waitRoll(page);
  const [d] = await dieValues(box);
  expect(Number(await box.locator(".total").innerText())).toBe(d + 3); // STR 16 + 1 human = 17 -> +3
  await box.getByRole("button", { name: "Закрыть" }).click();

  await page.locator(".mode-btn").click();
  await expect(page.locator(".mode-btn")).toContainText("Преимущество");
  await page.locator(".stat", { hasText: "СИЛ" }).click();
  box = await waitRoll(page);
  await expect(box.locator(".die")).toHaveCount(2);
  const all = (await box.locator(".die-num").allTextContents()).map(Number);
  const kept = await dieValues(box);
  expect(kept[0]).toBe(Math.max(...all));
  await expect(page.locator(".mode-btn")).toContainText("обычно");
  expect(errors).toEqual([]);
});

test("attack: damage button after landing, damage dice add up", async ({ page }) => {
  await seedCharacter(page, FIGHTER);
  await page.locator(".bottomnav button", { hasText: "Бой" }).click();
  await page.locator(".li.tap", { hasText: "Длинный меч" }).click();
  const box = page.locator(".roll .box");
  await expect(box.getByRole("button", { name: /Урон/ })).toHaveCount(0); // still rolling
  await waitRoll(page);
  await box.getByRole("button", { name: /Урон/ }).click();
  await waitRoll(page);
  const dice = await dieValues(box);
  const total = Number(await box.locator(".total").innerText());
  const flat = total - dice.reduce((a, b) => a + b, 0);
  expect(flat).toBe(3); // STR modifier
});

test("animation off shows the result at once", async ({ page }) => {
  await seedCharacter(page, FIGHTER);
  await page.locator(".topbar button[aria-label='Кубы']").click();
  await page.locator(".sheet label", { hasText: "Анимация бросков" }).locator("input").uncheck();
  await closeSheet(page);
  await page.locator(".stat", { hasText: "ЛОВ" }).click();
  await expect(page.locator(".roll .total")).not.toHaveText("…", { timeout: 100 });
});

test("free dice tray parses expressions and reports errors", async ({ page }) => {
  await seedCharacter(page, FIGHTER);
  await page.locator(".topbar button[aria-label='Кубы']").click();
  const input = page.locator(".sheet input[placeholder='2к6 + 3']");
  await input.fill("3к6+2");
  await input.press("Enter");
  const box = await waitRoll(page);
  const dice = await dieValues(box);
  expect(dice).toHaveLength(3);
  expect(Number(await box.locator(".total").innerText())).toBe(dice.reduce((a, b) => a + b, 0) + 2);
  await input.fill("2x6");
  await input.press("Enter");
  await expect(page.locator(".sheet .bad-box")).toBeVisible();
});

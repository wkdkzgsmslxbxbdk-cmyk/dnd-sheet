// Every tab and the main dialogs for several very different characters:
// no overflow, no garbage text, no console errors. Saves screenshots for UI review.
import { expect, test } from "@playwright/test";
import { closeSheet, expectNoGarbage, expectNoOverflow, seedCharacter, tab, watchErrors } from "./helpers";

const item = (uid: string, baseId: string | null, magicId: string | null = null, extra: Record<string, unknown> = {}) =>
  ({ uid, baseId, magicId, custom: null, qty: 1, equipped: true, attuned: true, ...extra });

const CHARACTERS: Record<string, Record<string, unknown>> = {
  bladesinger: {
    id: "bs", name: "Аэлинир Длинноимённая-Певчая-Клинка", raceId: "elf", subraceId: "high-elf",
    base: { str: 8, dex: 15, con: 13, int: 15, wis: 12, cha: 10 },
    classes: [{ classId: "wizard", subclassId: "bladesinging", level: 11, hpRolls: [] }],
    spells: ["fire-bolt", "booming-blade", "shield", "magic-missile", "misty-step", "fireball", "haste", "synaptic-static", "chain-lightning"].map((id) => ({ id, classId: "wizard", prepared: true })),
    toggles: { bladesong: true }, concentration: "haste",
    inventory: [item("a", "rapier"), item("b", "studded-leather-armor")],
  },
  artificer: {
    id: "art", name: "Брун", raceId: "dwarf", subraceId: "mountain-dwarf",
    base: { str: 14, dex: 10, con: 15, int: 15, wis: 12, cha: 8 },
    classes: [{ classId: "artificer", subclassId: "armorer", level: 9, hpRolls: [] }],
    inventory: [item("a", "plate-armor", "armor-1"), item("b", "warhammer")],
  },
  monkWarlock: {
    id: "mw", name: "Шэн", raceId: "tabaxi", subraceId: null,
    base: { str: 10, dex: 15, con: 13, int: 10, wis: 14, cha: 12 },
    classes: [
      { classId: "monk", subclassId: "shadow", level: 6, hpRolls: [] },
      { classId: "warlock", subclassId: "hexblade", level: 3, hpRolls: [] },
    ],
    spells: [{ id: "eldritch-blast", classId: "warlock", prepared: true }, { id: "hex", classId: "warlock", prepared: true }],
    hp: { current: 0, temp: 0, maxOverride: null }, deathSaves: { ok: 1, fail: 2 }, conditions: ["prone", "poisoned"], exhaustion: 2,
  },
  battlemaster: {
    id: "bm", name: "Горн", raceId: "human", subraceId: "variant-human", backgroundId: "soldier",
    base: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    classes: [{ classId: "fighter", subclassId: "battle-master", level: 20, hpRolls: [] }],
    inventory: [item("a", "greatsword", "weapon-3", { twoHanded: true }), item("b", "plate-armor"), item("c", null, "belt-of-giant-strength-storm")],
  },
};

for (const [key, ch] of Object.entries(CHARACTERS)) {
  test(`screens: ${key}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await seedCharacter(page, ch);
    const shot = async (name: string) => page.screenshot({ path: `e2e/shots/${info.project.name}-${key}-${name}.png`, fullPage: true });
    for (const t of ["Лист", "Бой", "Магия", "Вещи", "Умения"]) {
      await tab(page, t);
      await page.waitForTimeout(150);
      await expectNoOverflow(page, `${key}/${t}`);
      await expectNoGarbage(page, `${key}/${t}`);
      await shot(t);
    }
    // a feature detail, a spell card, the dice tray, the menu
    await tab(page, "Умения");
    await page.locator(".li.tap").first().click();
    await expectNoOverflow(page, `${key}/feature sheet`);
    await shot("feature");
    await closeSheet(page);
    await tab(page, "Магия");
    const spell = page.locator(".card .li.tap").first();
    if (await spell.count()) {
      await spell.click();
      await expectNoOverflow(page, `${key}/spell card`);
      await expectNoGarbage(page, `${key}/spell card`);
      await shot("spell");
      await closeSheet(page);
    }
    await page.locator(".topbar button[aria-label='Кубы']").click();
    await page.locator(".sheet .grid4 button", { hasText: "к20" }).click();
    await expectNoOverflow(page, `${key}/dice tray`);
    await closeSheet(page);
    // editor
    await page.locator(".topbar button[aria-label='Меню']").click();
    await page.getByRole("button", { name: /Редактировать/ }).click();
    await expectNoOverflow(page, `${key}/editor`);
    await expectNoGarbage(page, `${key}/editor`);
    await shot("editor");
    expect(errors).toEqual([]);
  });
}

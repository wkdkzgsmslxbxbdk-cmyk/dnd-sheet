import { describe, expect, it } from "vitest";
import { catalog } from "../data/catalog";
import { blankCharacter, type Character, type InvItem } from "./character";
import { derive, mod, profByLevel } from "./derive";
import { average, formatDice, hitChance, parseDice, rollD20, rollExpr } from "./dice";
import { ITEM_EFFECTS } from "./itemEffects";
import { computeSpell, effectAverage, pickByLevel, SPELL_OVERRIDES } from "./spellcalc";

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

let uid = 0;
const item = (p: Partial<InvItem>): InvItem => ({
  uid: `i${uid++}`, baseId: null, magicId: null, custom: null, qty: 1, equipped: true, attuned: false, ...p,
});

function make(p: Partial<Character>): Character {
  return { ...blankCharacter(), ...p };
}

describe("dice", () => {
  it("parses and formats in Russian notation", () => {
    expect(formatDice(parseDice("2d6 + 3"))).toBe("2к6 + 3");
    expect(formatDice(parseDice("1к8+1к8+2"))).toBe("2к8 + 2");
    expect(formatDice(parseDice("1d8 + MOD", { MOD: -1 }))).toBe("1к8 − 1");
    expect(average(parseDice("8d6"))).toBe(28);
    expect(() => parseDice("2x6")).toThrow();
  });
  it("rolls with advantage, crit doubles dice", () => {
    // rng 0.95 -> 20, 0.0 -> 1
    const adv = rollD20(5, "advantage", { rng: seq(0.0, 0.95) });
    expect(adv.kept).toBe(20);
    expect(adv.total).toBe(25);
    expect(adv.crit).toBe(true);
    const dis = rollD20(5, "disadvantage", { rng: seq(0.0, 0.95) });
    expect(dis.kept).toBe(1);
    expect(dis.fumble).toBe(true);
    const champ = rollD20(0, "normal", { rng: seq(0.9), critFrom: 19 }); // 0.9 -> 19
    expect(champ.crit).toBe(true);
    const crit = rollExpr(parseDice("1d8+3"), { crit: true, rng: seq(0.5) });
    expect(crit.terms[0].rolls).toHaveLength(2);
    expect(crit.total).toBe(5 + 5 + 3);
  });
  it("hit chance with natural 1 and 20", () => {
    expect(hitChance(5, 15)).toBeCloseTo(0.55);
    expect(hitChance(30, 15)).toBeCloseTo(0.95);
    expect(hitChance(-10, 30)).toBeCloseTo(0.05);
    expect(hitChance(5, 15, "advantage")).toBeCloseTo(1 - 0.45 ** 2);
  });
});

describe("basic rules", () => {
  it("modifier and proficiency tables (PHB)", () => {
    expect([1, 8, 9, 10, 11, 20, 30].map(mod)).toEqual([-5, -1, -1, 0, 0, 5, 10]);
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(profByLevel)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
});

describe("fighter 1, human, chain mail + shield, Defense style", () => {
  const c = make({
    raceId: "human",
    base: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 },
    classes: [{ classId: "fighter", subclassId: null, level: 1, hpRolls: [] }],
    choices: { "fighter-fighting-style": ["fighter-fighting-style-defense"] },
    skills: ["athletics", "perception"],
    inventory: [item({ baseId: "chain-mail" }), item({ baseId: "shield" }), item({ baseId: "longsword" })],
  });
  const s = derive(c);
  it("ability scores include racial +1", () => {
    expect(s.scores.str.value).toBe(16);
    expect(s.mods.con).toBe(2);
  });
  it("AC 16 + 2 shield + 1 Defense = 19", () => {
    expect(s.ac.value).toBe(19);
    expect(s.ac.parts.map((p) => p.value)).toEqual([16, 1, 2]);
  });
  it("HP at level 1 = d10 max + CON", () => expect(s.hpMax.value).toBe(12));
  it("longsword +5 to hit, 1d8+3", () => {
    const a = s.attacks.find((x) => x.name === catalog.equipment.longsword.name)!;
    expect(a.toHit.value).toBe(5);
    expect(formatDice(a.damage)).toBe("1к8 + 3");
  });
  it("saves: STR and CON proficient", () => {
    expect(s.saves.str.calc.value).toBe(5);
    expect(s.saves.con.calc.value).toBe(4);
    expect(s.saves.dex.calc.value).toBe(2);
  });
  // WIS 12 + 1 (human) = 13 -> +1; proficient +2
  it("passive perception 10 + 1 + 2", () => expect(s.passive.perception.value).toBe(13));
  it("chain mail needs STR 13, stealth disadvantage noted", () => {
    expect(s.warnings.some((w) => w.text.includes("Скрытность"))).toBe(true);
    expect(s.speed.value).toBe(30);
  });
});

describe("wizard (evocation), high elf", () => {
  const base = { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 };
  const wiz = (level: number) =>
    make({
      raceId: "elf",
      subraceId: "high-elf",
      base,
      classes: [{ classId: "wizard", subclassId: "evocation", level, hpRolls: [] }],
      spells: [{ id: "fireball", classId: "wizard", prepared: true }],
    });
  it("level 5: DC 14, attack +6, fireball 8d6 / 9d6 at slot 4", () => {
    const c = wiz(5);
    const s = derive(c);
    expect(s.scores.int.value).toBe(17); // 16 + 1 high elf
    expect(s.scores.dex.value).toBe(16); // 14 + 2 elf
    expect(s.casting[0].dc.value).toBe(14);
    expect(s.casting[0].attack.value).toBe(6);
    expect(s.slots.slice(0, 3)).toEqual([4, 3, 2]);
    const fb = computeSpell(catalog.spells.fireball, c, s, { slot: 3 });
    expect(formatDice(fb.effects[0].expr)).toBe("8к6");
    expect(fb.save?.dc.value).toBe(14);
    expect(formatDice(computeSpell(catalog.spells.fireball, c, s, { slot: 4 }).effects[0].expr)).toBe("9к6");
  });
  it("prepared spells = INT mod + level", () => {
    const s = derive(wiz(5));
    expect(s.casting[0].prepared?.value).toBe(8);
  });
  it("level 10: Empowered Evocation adds INT to fireball", () => {
    const c = wiz(10);
    const s = derive(c);
    const fb = computeSpell(catalog.spells.fireball, c, s, { slot: 3 });
    expect(formatDice(fb.effects[0].expr)).toBe("8к6 + 3");
  });
  it("cantrip scales with character level: fire bolt 2d10 at 5", () => {
    const c = wiz(5);
    const r = computeSpell(catalog.spells["fire-bolt"], c, derive(c));
    expect(formatDice(r.effects[0].expr)).toBe("2к10");
    expect(r.attack?.value).toBe(6);
  });
  it("HP wizard 5 average: 6 + 4×4 + CON 2×5 = 32", () => {
    expect(derive(wiz(5)).hpMax.value).toBe(32);
  });
});

describe("warlock eldritch blast", () => {
  const c = make({
    raceId: "tiefling",
    base: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, // + tiefling CHA 2 = 18
    classes: [{ classId: "warlock", subclassId: "fiend", level: 5, hpRolls: [] }],
    choices: { "eldritch-invocations": ["eldritch-invocation-agonizing-blast"] },
  });
  const s = derive(c);
  it("pact slots: two 3rd-level slots", () => expect(s.pact).toEqual({ level: 3, count: 2 }));
  it("two beams of 1d10 + CHA", () => {
    const r = computeSpell(catalog.spells["eldritch-blast"], c, s);
    expect(r.effects[0].count).toBe(2);
    expect(formatDice(r.effects[0].expr)).toBe("1к10 + 4");
    expect(effectAverage(r.effects[0])).toBe(19);
  });
});

describe("life cleric healing", () => {
  const c = make({
    raceId: "human",
    base: { str: 14, dex: 10, con: 13, int: 10, wis: 15, cha: 12 }, // WIS 16
    classes: [{ classId: "cleric", subclassId: "life", level: 5, hpRolls: [] }],
  });
  const s = derive(c);
  it("cure wounds at slot 1: 1d8 + 3 (WIS) + 3 (Disciple of Life 2 + 1)", () => {
    const r = computeSpell(catalog.spells["cure-wounds"], c, s, { slot: 1 });
    expect(formatDice(r.effects[0].expr)).toBe("1к8 + 6");
  });
  it("slot 3: 3d8 + 3 + 5", () => {
    const r = computeSpell(catalog.spells["cure-wounds"], c, s, { slot: 3 });
    expect(formatDice(r.effects[0].expr)).toBe("3к8 + 8");
  });
  it("life domain grants heavy armor", () => expect(s.profs.has("heavy-armor")).toBe(true));
});

describe("multiclass spell slots", () => {
  it("paladin 2 / sorcerer 3: caster level 1 + 3 = 4 -> 4/3 slots", () => {
    const c = make({
      classes: [
        { classId: "paladin", subclassId: null, level: 2, hpRolls: [] },
        { classId: "sorcerer", subclassId: null, level: 3, hpRolls: [] },
      ],
    });
    expect(derive(c).slots.slice(0, 3)).toEqual([4, 3, 0]);
  });
  it("single-class paladin 3 uses its own table (3 slots)", () => {
    const c = make({ classes: [{ classId: "paladin", subclassId: null, level: 3, hpRolls: [] }] });
    expect(derive(c).slots[0]).toBe(3);
  });
  it("saves come only from the first class", () => {
    const c = make({
      classes: [
        { classId: "fighter", subclassId: null, level: 1, hpRolls: [] },
        { classId: "wizard", subclassId: null, level: 1, hpRolls: [] },
      ],
    });
    const s = derive(c);
    expect(s.saves.int.prof).toBe(false);
    expect(s.saves.str.prof).toBe(true);
  });
});

describe("unarmored defense and skills", () => {
  it("barbarian 10 + DEX + CON, allowed with shield", () => {
    const c = make({ base: { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 10 }, raceId: "human", classes: [{ classId: "barbarian", subclassId: null, level: 1, hpRolls: [] }] });
    expect(derive(c).ac.value).toBe(10 + 2 + 3);
    c.inventory = [item({ baseId: "shield" })];
    expect(derive(c).ac.value).toBe(17);
  });
  it("monk unarmored defense does not stack with shield", () => {
    const c = make({ base: { str: 10, dex: 16, con: 10, int: 10, wis: 16, cha: 10 }, raceId: "dwarf", classes: [{ classId: "monk", subclassId: null, level: 1, hpRolls: [] }] });
    expect(derive(c).ac.value).toBe(16);
    c.inventory = [item({ baseId: "shield" })];
    expect(derive(c).ac.value).toBe(10 + 3 + 2);
  });
  it("rogue expertise doubles proficiency", () => {
    const c = make({ base: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 }, raceId: "dwarf", classes: [{ classId: "rogue", subclassId: null, level: 1, hpRolls: [] }], skills: ["stealth"], expertise: ["stealth"] });
    expect(derive(c).skills.stealth.calc.value).toBe(3 + 4);
  });
  it("bard Jack of All Trades: half proficiency to untrained skills and initiative", () => {
    const c = make({ base: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 }, raceId: "dwarf", classes: [{ classId: "bard", subclassId: null, level: 2, hpRolls: [] }] });
    const s = derive(c);
    expect(s.skills.history.calc.value).toBe(1);
    expect(s.initiative.value).toBe(3);
  });
  it("hill dwarf toughness +1 HP per level", () => {
    const c = make({ raceId: "dwarf", subraceId: "hill-dwarf", base: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, classes: [{ classId: "cleric", subclassId: null, level: 3, hpRolls: [] }] });
    // CON 16 (+3): 8 + 5 + 5 + 3*3 + 3 = 30
    expect(derive(c).hpMax.value).toBe(30);
  });
});

describe("magic items", () => {
  it("ring of protection only works when attuned", () => {
    const c = make({ inventory: [item({ magicId: "ring-of-protection" })] });
    const before = derive(c).ac.value;
    c.inventory[0].attuned = true;
    const s = derive(c);
    expect(s.ac.value).toBe(before + 1);
    expect(s.saves.dex.calc.value).toBe(1);
  });
  it("amulet of health sets CON 19", () => {
    const c = make({ inventory: [item({ magicId: "amulet-of-health", attuned: true })] });
    expect(derive(c).scores.con.value).toBe(19);
  });
  it("+1 longsword adds to hit and damage, +2 plate adds to AC", () => {
    const c = make({
      base: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      raceId: "dwarf",
      inventory: [item({ baseId: "longsword", magicId: "weapon-1" }), item({ baseId: "plate-armor", magicId: "armor-2" })],
    });
    const s = derive(c);
    const a = s.attacks.find((x) => x.uid !== "unarmed")!;
    expect(a.toHit.value).toBe(3 + 2 + 1);
    expect(formatDice(a.damage)).toBe("1к8 + 4");
    expect(s.ac.value).toBe(20);
  });
  it("every item effect and spell override refers to a real catalog entry", () => {
    for (const id of Object.keys(ITEM_EFFECTS)) expect(catalog.magicItems[id], id).toBeTruthy();
    for (const id of Object.keys(SPELL_OVERRIDES)) expect(catalog.spells[id], id).toBeTruthy();
  });
});

describe("race and class specials", () => {
  it("dragonborn breath weapon: DC 8 + CON + prof, 3d6 at 6th level", () => {
    const c = make({
      raceId: "dragonborn",
      base: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 12 },
      classes: [{ classId: "barbarian", subclassId: "berserker", level: 6, hpRolls: [] }],
      choices: { "draconic-ancestry": ["draconic-ancestry-red"] },
    });
    const s = derive(c);
    expect(s.breath?.dc.value).toBe(8 + 2 + 3);
    expect(formatDice(parseDice(s.breath!.dice))).toBe("3к6");
    expect(s.breath?.type).toBe("fire");
  });
  it("rage adds +2 to STR melee damage at barbarian 6; brutal critical from barbarian level", () => {
    const c = make({
      raceId: "human",
      base: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 10 },
      classes: [
        { classId: "barbarian", subclassId: null, level: 9, hpRolls: [] },
        { classId: "fighter", subclassId: null, level: 3, hpRolls: [] },
      ],
      toggles: { rage: true },
      inventory: [item({ baseId: "greataxe", twoHanded: true })],
    });
    const s = derive(c);
    const axe = s.attacks.find((a) => a.uid !== "unarmed")!;
    expect(formatDice(axe.damage)).toBe("1к12 + 6"); // STR 16 +3, rage +3 at 9th
    expect(s.brutalDice).toBe(1); // barbarian 9, not character level 12
  });
  it("tiefling gets thaumaturgy and CHA racial casting", () => {
    const c = make({ raceId: "tiefling", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 14 }, classes: [{ classId: "fighter", subclassId: null, level: 3, hpRolls: [] }] });
    const s = derive(c);
    expect(s.racialSpells.map((r) => r.spellId)).toEqual(["thaumaturgy", "hellish-rebuke"]);
    const r = computeSpell(catalog.spells["hellish-rebuke"], c, s, { classId: "race", slot: 2 });
    expect(formatDice(r.effects[0].expr)).toBe("3к10");
    expect(r.save?.dc.value).toBe(8 + 2 + 3);
  });
});

describe("data sanity", () => {
  it("every damage/heal string of non-overridden spells parses", () => {
    for (const s of catalog.spellList) {
      if (SPELL_OVERRIDES[s.id]) continue;
      for (const d of s.dmg ?? []) for (const v of Object.values({ ...(d.slot ?? {}), ...(d.char ?? {}) })) expect(() => parseDice(v, { MOD: 0 }), `${s.id}: ${v}`).not.toThrow();
      for (const v of Object.values(s.heal ?? {})) expect(() => parseDice(v, { MOD: 0 }), `${s.id}: ${v}`).not.toThrow();
    }
  });
  it("pickByLevel takes the nearest lower key", () => {
    expect(pickByLevel({ "2": "3d6", "4": "4d6" }, 3)).toBe("3d6");
    expect(pickByLevel({ "1": "1d10", "5": "2d10" }, 4)).toBe("1d10");
  });
});

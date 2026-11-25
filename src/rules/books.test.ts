// Book content (data/books) wired through the effects engine.
// Expected numbers are computed by hand from the Player's Handbook.
import { describe, expect, it } from "vitest";
import { catalog } from "../data/catalog";
import { blankCharacter, type Character } from "./character";
import { derive } from "./derive";
import { formatDice } from "./dice";
import { checkExpr, choiceKey, countAt, evalExpr } from "./effects";
import { computeSpell } from "./spellcalc";

const make = (p: Partial<Character>): Character => ({ ...blankCharacter(), ...p });

describe("effect expressions", () => {
  const vars = { prof: 3, level: 7, clevel: 7, "mod.str": 3, "mod.dex": 1, "mod.cha": -1, slot: 2 };
  it("evaluates arithmetic, functions and comparisons", () => {
    expect(evalExpr("8 + prof + max(mod.str, mod.dex)", vars)).toBe(14);
    expect(evalExpr("4 + (clevel >= 7) + (clevel >= 15)", vars)).toBe(5);
    expect(evalExpr("max(1, mod.cha)", vars)).toBe(1);
    expect(evalExpr("floor(clevel / 2)", vars)).toBe(3);
    expect(evalExpr("2 + slot", vars)).toBe(4);
  });
  it("rejects unknown variables", () => {
    expect(checkExpr("mod.luck + 1")).toMatch(/Unknown variable/);
    expect(checkExpr("prof +")).toBeTruthy();
  });
  it("counts by class level", () => {
    expect(countAt({ "3": 3, "7": 5, "10": 7 }, 9)).toBe(5);
    expect(countAt(2, 1)).toBe(2);
  });
});

describe("PHB content", () => {
  it("every book subclass is attached to its class", () => {
    for (const s of Object.values(catalog.subclasses)) expect(catalog.classes[s.class].subclasses, s.id).toContain(s.id);
    // PHB has 40 subclasses, 12 of them are in the SRD
    expect(Object.values(catalog.subclasses).filter((s) => s.source === "phb").length).toBe(28);
  });

  it("Battle Master: 4 superiority d8 at 3rd, 5 at 7th; maneuver DC 8 + prof + STR", () => {
    const c = make({
      raceId: "human",
      base: { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }, // STR 16
      classes: [{ classId: "fighter", subclassId: "battle-master", level: 3, hpRolls: [] }],
    });
    let s = derive(c);
    const sd = s.resources.find((r) => r.id === "superiority-dice")!;
    expect(sd.max).toBe(4);
    expect(sd.die).toBe("к8");
    expect(s.dcs.find((d) => d.name === "Приёмы")?.calc.value).toBe(8 + 2 + 3);
    c.classes[0].level = 7;
    s = derive(c);
    expect(s.resources.find((r) => r.id === "superiority-dice")!.max).toBe(5);
  });

  it("Eldritch Knight: own slot table; multiclass counts a third of fighter levels", () => {
    const ek = make({ classes: [{ classId: "fighter", subclassId: "eldritch-knight", level: 7, hpRolls: [] }] });
    let s = derive(ek);
    expect(s.slots.slice(0, 3)).toEqual([4, 2, 0]);
    expect(s.casting.find((k) => k.classId === "fighter")?.list).toBe("wizard");
    // fighter 6 (EK, 6/3 = 2) + wizard 2 = caster level 4 -> 4/3 slots
    ek.classes = [
      { classId: "fighter", subclassId: "eldritch-knight", level: 6, hpRolls: [] },
      { classId: "wizard", subclassId: null, level: 2, hpRolls: [] },
    ];
    s = derive(ek);
    expect(s.slots.slice(0, 3)).toEqual([4, 3, 0]);
  });

  it("Light domain 8: Potent Spellcasting adds WIS to cleric cantrips", () => {
    const c = make({
      raceId: "human",
      base: { str: 10, dex: 10, con: 12, int: 10, wis: 15, cha: 10 }, // WIS 16
      classes: [{ classId: "cleric", subclassId: "light", level: 8, hpRolls: [] }],
    });
    const s = derive(c);
    const r = computeSpell(catalog.spells["sacred-flame"], c, s, { classId: "cleric" });
    expect(formatDice(r.effects[0].expr)).toBe("2к8 + 3");
  });

  it("variant human: replaces +1 to all, two chosen +1, skill, feat Tough", () => {
    const c = make({
      raceId: "human",
      subraceId: "variant-human",
      base: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
      classes: [{ classId: "fighter", subclassId: null, level: 4, hpRolls: [] }],
      choices: {
        [choiceKey("variant-human-traits", 0)]: ["str", "con"],
        [choiceKey("variant-human-traits", 1)]: ["perception"],
        [choiceKey("variant-human-traits", 2)]: ["tough"],
      },
    });
    const s = derive(c);
    expect(s.scores.str.value).toBe(15);
    expect(s.scores.dex.value).toBe(14); // no base-human +1
    expect(s.skills.perception.prof).toBe("prof");
    // fighter 4: 10 + 6*3 + CON(+2)*4 + Tough 2*4 = 44
    expect(s.hpMax.value).toBe(10 + 18 + 8 + 8);
  });

  it("feats: Resilient (CON) gives +1 and the save; Alert +5 initiative", () => {
    const c = make({
      raceId: "human",
      base: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
      classes: [{ classId: "wizard", subclassId: null, level: 8, hpRolls: [] }],
      asi: { "wizard:4": { kind: "feat", featId: "resilient" }, "wizard:8": { kind: "feat", featId: "alert" } },
      choices: { [choiceKey("feat:resilient", 0)]: ["con"] },
    });
    const s = derive(c);
    expect(s.scores.con.value).toBe(14); // 12 + 1 human + 1 Resilient
    expect(s.saves.con.prof).toBe(true);
    expect(s.initiative.value).toBe(2 + 5);
  });

  it("wood elf walks 35 ft; drow has superior darkvision", () => {
    expect(derive(make({ raceId: "elf", subraceId: "wood-elf" })).speed.value).toBe(35);
    expect(derive(make({ raceId: "elf", subraceId: "drow" })).senses.some((x) => x.range === 120)).toBe(true);
  });

  it("Artificer: half caster rounded up; prepared = INT + half level", () => {
    const c = make({
      raceId: "human",
      base: { str: 10, dex: 12, con: 14, int: 15, wis: 10, cha: 8 }, // INT 16
      classes: [{ classId: "artificer", subclassId: null, level: 1, hpRolls: [] }],
    });
    let s = derive(c);
    expect(s.slots[0]).toBe(2);
    expect(s.casting[0].prepared?.value).toBe(3 + 0);
    // artificer 3 (ceil 1.5 = 2) + wizard 1 = caster level 3 -> 4/2
    c.classes = [
      { classId: "artificer", subclassId: null, level: 3, hpRolls: [] },
      { classId: "wizard", subclassId: null, level: 1, hpRolls: [] },
    ];
    s = derive(c);
    expect(s.slots.slice(0, 2)).toEqual([4, 2]);
  });

  it("Bladesong adds INT to AC and 10 ft speed only while on", () => {
    const c = make({
      raceId: "elf", subraceId: "high-elf",
      base: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 }, // DEX 16, INT 16
      classes: [{ classId: "wizard", subclassId: "bladesinging", level: 2, hpRolls: [] }],
    });
    expect(derive(c).ac.value).toBe(13);
    c.toggles = { bladesong: true };
    const s = derive(c);
    expect(s.ac.value).toBe(16);
    expect(s.speed.value).toBe(40);
  });

  it("tiefling variants replace Infernal Legacy", () => {
    const c = make({ raceId: "tiefling", subraceId: "zariel-tiefling", classes: [{ classId: "fighter", subclassId: null, level: 5, hpRolls: [] }] });
    const s = derive(c);
    expect(s.traits.some((t) => t.id === "infernal-legacy")).toBe(false);
    expect(s.racialSpells.some((r) => r.spellId === "hellish-rebuke")).toBe(false);
  });

  it("warlock patron spells only widen the list, domain spells are always prepared", () => {
    expect(catalog.subclasses.archfey.spellMode).toBe("expanded");
    expect(catalog.subclasses.light.spellMode).toBe("always");
  });
});

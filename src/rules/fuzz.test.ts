// Exhaustive smoke: every class/subclass at every level, every race/subrace,
// every spell for a caster — nothing may throw or produce NaN / undefined numbers.
import { describe, expect, it } from "vitest";
import { catalog } from "../data/catalog";
import { blankCharacter, type Character } from "./character";
import { derive, type Sheet } from "./derive";
import { average, formatDice } from "./dice";
import { computeSpell, effectTotal } from "./spellcalc";

const make = (p: Partial<Character>): Character => ({
  ...blankCharacter(),
  base: { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 },
  ...p,
});

function badNumbers(sheet: Sheet): string[] {
  const bad: string[] = [];
  const check = (label: string, v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) bad.push(`${label}=${String(v)}`);
  };
  check("ac", sheet.ac.value);
  check("hp", sheet.hpMax.value);
  check("speed", sheet.speed.value);
  check("init", sheet.initiative.value);
  check("prof", sheet.prof.value);
  for (const [a, s] of Object.entries(sheet.scores)) check(`score.${a}`, s.value);
  for (const [a, s] of Object.entries(sheet.saves)) check(`save.${a}`, s.calc.value);
  for (const [k, s] of Object.entries(sheet.skills)) check(`skill.${k}`, s.calc.value);
  for (const r of sheet.resources) check(`res.${r.id}`, r.max);
  for (const d of sheet.dcs) check(`dc.${d.name}`, d.calc.value);
  for (const k of sheet.casting) {
    check(`dc.${k.classId}`, k.dc.value);
    check(`atk.${k.classId}`, k.attack.value);
  }
  for (const a of sheet.attacks) {
    check(`hit.${a.name}`, a.toHit.value);
    check(`dmg.${a.name}`, average(a.damage));
  }
  sheet.slots.forEach((n, i) => check(`slot${i + 1}`, n));
  for (const w of sheet.warnings) if (w.text.startsWith("Не удалось посчитать")) bad.push(w.text);
  return bad;
}

/** pick every option of every choice so choice-dependent effects run too */
function pickAll(c: Character): Character {
  const s = derive(c);
  for (const { feature } of s.features) {
    const opts = feature.choice?.options?.filter(Boolean) as string[] | undefined;
    if (opts?.length) c.choices[feature.id] = opts.slice(0, 3);
    if (feature.invocations) c.choices[feature.id] = feature.invocations.slice(0, 4);
  }
  for (const o of s.owners)
    o.effects.forEach((e, i) => {
      const key = `${o.id}#${i}`;
      if (e.k === "abilityChoice") c.choices[key] = (e.from ?? ["str", "dex"]).slice(0, e.n);
      if (e.k === "skillChoice") c.choices[key] = (e.from ?? ["athletics", "stealth", "arcana"]).slice(0, e.n);
      if (e.k === "featChoice") c.choices[key] = ["tough"];
    });
  for (const t of s.traits) if (t.options?.length) c.choices[t.id] = [t.options[0]];
  c.toggles = Object.fromEntries(s.toggles.map((t) => [t.id, true]));
  return c;
}

describe("fuzz: classes and subclasses", () => {
  for (const cls of catalog.classList) {
    const subs = [null, ...cls.subclasses];
    for (const sub of subs) {
      it(`${cls.id}/${sub ?? "-"} levels 1..20`, () => {
        for (let lv = 1; lv <= 20; lv++) {
          const c = pickAll(make({ classes: [{ classId: cls.id, subclassId: sub, level: lv, hpRolls: [] }] }));
          const sheet = derive(c);
          expect(badNumbers(sheet), `${cls.id}/${sub} lv${lv}`).toEqual([]);
        }
      });
    }
  }
});

describe("fuzz: races and subraces", () => {
  it("every race/subrace at levels 1, 5, 20", () => {
    for (const race of catalog.raceList) {
      for (const sub of [null, ...race.subraces]) {
        for (const lv of [1, 5, 20]) {
          const c = pickAll(make({ raceId: race.id, subraceId: sub, classes: [{ classId: "fighter", subclassId: null, level: lv, hpRolls: [] }] }));
          expect(badNumbers(derive(c)), `${race.id}/${sub} lv${lv}`).toEqual([]);
        }
      }
    }
  });
});

describe("fuzz: feats and backgrounds", () => {
  it("every feat and background applies cleanly", () => {
    for (const f of Object.values(catalog.feats)) {
      const c = pickAll(make({ classes: [{ classId: "wizard", subclassId: null, level: 4, hpRolls: [] }], asi: { "wizard:4": { kind: "feat", featId: f.id } } }));
      expect(badNumbers(derive(c)), f.id).toEqual([]);
    }
    for (const b of Object.values(catalog.backgrounds)) {
      const c = pickAll(make({ backgroundId: b.id }));
      expect(badNumbers(derive(c)), b.id).toEqual([]);
    }
  });
});

describe("fuzz: every spell computes at every slot", () => {
  it("no NaN in spell effects", () => {
    const c = make({ classes: [{ classId: "wizard", subclassId: null, level: 20, hpRolls: [] }] });
    const sheet = derive(c);
    const bad: string[] = [];
    for (const sp of catalog.spellList) {
      const slots = sp.level === 0 ? [0] : Array.from({ length: 10 - sp.level }, (_, i) => sp.level + i);
      for (const slot of slots) {
        try {
          const r = computeSpell(sp, c, sheet, { classId: "wizard", slot });
          for (const e of r.effects) {
            const avg = average(effectTotal(e));
            if (!Number.isFinite(avg) || formatDice(e.expr).includes("NaN")) bad.push(`${sp.id}@${slot}`);
          }
        } catch (err) {
          bad.push(`${sp.id}@${slot}: ${(err as Error).message}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

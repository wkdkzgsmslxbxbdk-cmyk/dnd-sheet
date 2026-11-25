// Spell math for a character: save DC / attack bonus and the dice of every
// damage, healing or hit-point effect at a chosen slot level.
//
// Base numbers come from the SRD data (damage_at_slot_level, damage_at_character_level,
// heal_at_slot_level). Where the data is missing or malformed, SPELL_OVERRIDES encodes
// the SRD text, quoting it in `cite`. Feature bonuses (Agonizing Blast, Disciple of Life...)
// are applied below, each with its SRD sentence.

import type { Character } from "./character";
import { totalLevel } from "./character";
import type { Sheet, Calc } from "./derive";
import { abilityShort, calc } from "./derive";
import type { Ability, Spell } from "./types";
import { add, average, dice, flat, formatDice, maximum, parseDice, scale, type DiceExpr } from "./dice";

export type EffectKind = "damage" | "heal" | "temp" | "hpmax" | "pool" | "rider";

export interface SpellEffect {
  kind: EffectKind;
  /** one instance (one ray / beam / dart) */
  expr: DiceExpr;
  /** number of instances (rays, beams, darts); 1 for most spells */
  count: number;
  countLabel?: string; // "луча", "снаряда"
  type: string | null; // damage type id or null
  parts: string[];
  note?: string;
}

export interface SpellResult {
  spell: Spell;
  classId: string | null;
  ability: Ability | null;
  slot: number; // 0 for cantrips
  slotOptions: number[];
  attack: Calc | null;
  save: { ability: Ability; dc: Calc; success: "half" | "none" | "other" } | null;
  effects: SpellEffect[];
  notes: string[];
  /** manual rule used instead of / on top of the data */
  cite: string | null;
}

interface OverrideCtx {
  slot: number;
  charLevel: number;
}
interface Override {
  effects: (x: OverrideCtx) => SpellEffect[];
  cite: string;
}

const eff = (kind: EffectKind, expr: DiceExpr, type: string | null, extra: Partial<SpellEffect> = {}): SpellEffect => ({
  kind, expr, type, count: 1, parts: [formatDice(expr)], ...extra,
});

export const SPELL_OVERRIDES: Record<string, Override> = {
  "eldritch-blast": {
    cite: "On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level.",
    effects: ({ charLevel }) => [
      eff("damage", dice(1, 10), "force", { count: charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1, countLabel: "луч" }),
    ],
  },
  "scorching-ray": {
    cite: "You create three rays of fire... On a hit, the target takes 2d6 fire damage. ...you create one additional ray for each slot level above 2nd.",
    effects: ({ slot }) => [eff("damage", dice(2, 6), "fire", { count: 3 + Math.max(0, slot - 2), countLabel: "луч" })],
  },
  "magic-missile": {
    cite: "A dart deals 1d4 + 1 force damage to its target. ...the spell creates one more dart for each slot level above 1st.",
    effects: ({ slot }) => [eff("damage", add(dice(1, 4), flat(1)), "force", { count: 3 + Math.max(0, slot - 1), countLabel: "снаряд" })],
  },
  "flame-strike": {
    cite: "A creature takes 4d6 fire damage and 4d6 radiant damage on a failed save... the fire damage or the radiant damage (your choice) increases by 1d6 for each slot level above 5th.",
    effects: ({ slot }) => {
      const up = Math.max(0, slot - 5);
      return [
        eff("damage", dice(4, 6), "fire"),
        eff("damage", dice(4, 6), "radiant"),
        ...(up ? [eff("damage", dice(up, 6), null, { note: "к огню или излучению, на выбор" })] : []),
      ];
    },
  },
  sleep: {
    cite: "Roll 5d8; the total is how many hit points of creatures this spell can affect. ...roll an additional 2d8 for each slot level above 1st.",
    effects: ({ slot }) => [eff("pool", dice(5 + 2 * Math.max(0, slot - 1), 8), null, { note: "сумма хитов существ, которые засыпают" })],
  },
  "prismatic-spray": {
    cite: "For each target, roll a d8 to determine which color ray affects it. ...The target takes 10d6 fire/acid/lightning/poison/cold damage on a failed save, or half as much damage on a successful one.",
    effects: () => [eff("damage", dice(10, 6), null, { note: "тип урона по цвету луча (к8)" })],
  },
  "spirit-guardians": {
    cite: "On a failed save, the creature takes 3d8 radiant damage (if you are good or neutral) or 3d8 necrotic damage (if you are evil). ...the damage increases by 1d8 for each slot level above 3rd.",
    effects: ({ slot }) => [eff("damage", dice(3 + Math.max(0, slot - 3), 8), "radiant", { note: "излучением, у злых персонажей некротической энергией" })],
  },
  "hunters-mark": {
    cite: "Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack.",
    effects: () => [eff("rider", dice(1, 6), null, { note: "дополнительно к каждому попаданию оружием по цели" })],
  },
  weird: {
    cite: "At the start of each of the frightened creature's turns, it must succeed on a wisdom saving throw or take 4d10 psychic damage.",
    effects: () => [eff("damage", dice(4, 10), "psychic", { note: "в начале каждого хода испуганного существа" })],
  },
  "spike-growth": {
    cite: "When a creature moves into or within the area, it takes 2d4 piercing damage for every 5 feet it travels.",
    effects: () => [eff("damage", dice(2, 4), "piercing", { note: "за каждые 5 футов перемещения" })],
  },
  "false-life": {
    cite: "You gain 1d4 + 4 temporary hit points... you gain 5 additional temporary hit points for each slot level above 1st.",
    effects: ({ slot }) => [eff("temp", add(dice(1, 4), flat(4 + 5 * Math.max(0, slot - 1))), null)],
  },
  aid: {
    cite: "Each target's hit point maximum and current hit points increase by 5 for the duration. ...a target's hit points increase by an additional 5 for each slot level above 2nd.",
    effects: ({ slot }) => [eff("hpmax", flat(5 + 5 * Math.max(0, slot - 2)), null, { note: "до трёх существ" })],
  },
  "heroes-feast": {
    cite: "Its hit point maximum also increases by 2d10, and it gains the same number of hit points.",
    effects: () => [eff("hpmax", dice(2, 10), null)],
  },
  "enhance-ability": {
    cite: "Bear's Endurance. The target has advantage on constitution checks. It also gains 2d6 temporary hit points.",
    effects: () => [eff("temp", dice(2, 6), null, { note: "только вариант «Выносливость медведя»" })],
  },
};

/** Pick the entry with the largest key not above `level` ("2": "3d6", "4": "4d6" -> slot 3 = 3d6). */
export function pickByLevel(table: Record<string, string>, level: number): string | null {
  const keys = Object.keys(table).map(Number).filter((k) => k <= level).sort((a, b) => b - a);
  return keys.length ? table[String(keys[0])] : null;
}

function ancestryDamageType(choiceIds: string[]): string | null {
  const id = choiceIds.find((x) => x.startsWith("dragon-ancestor-"));
  const m = id ? /---(\w+)-damage$/.exec(id) : null;
  return m ? m[1] : null;
}

export function spellSlotOptions(spell: Spell, sheet: Sheet, classId: string | null): number[] {
  if (spell.level === 0) return [0];
  const opts = new Set<number>();
  if (classId === "warlock" && sheet.pact) {
    if (sheet.pact.level >= spell.level) opts.add(sheet.pact.level);
    // Mystic Arcanum spells (6-9) are cast without a slot at their own level
    if (spell.level >= 6) opts.add(spell.level);
  }
  sheet.slots.forEach((n, i) => {
    if (n > 0 && i + 1 >= spell.level) opts.add(i + 1);
  });
  if (!opts.size) opts.add(spell.level);
  return [...opts].sort((a, b) => a - b);
}

export function computeSpell(
  spell: Spell,
  c: Character,
  sheet: Sheet,
  opts: { slot?: number; classId?: string | null } = {},
): SpellResult {
  const featureIds = new Set(sheet.features.map((f) => f.feature.id));
  const has = (id: string) => featureIds.has(id);
  const classId = opts.classId ?? c.spells.find((s) => s.id === spell.id)?.classId ?? sheet.casting.find((k) => spell.classes.includes(k.classId))?.classId ?? sheet.casting[0]?.classId ?? null;
  const caster = sheet.casting.find((k) => k.classId === classId) ?? null;
  const ability = caster?.ability ?? null;
  const abilityMod = ability ? sheet.mods[ability] : 0;
  const slotOptions = spellSlotOptions(spell, sheet, classId);
  const slot = spell.level === 0 ? 0 : Math.max(spell.level, opts.slot ?? slotOptions[0] ?? spell.level);
  const charLevel = totalLevel(c);
  const notes: string[] = [];

  const attack = spell.attack && caster ? caster.attack : null;
  const save = spell.save && caster ? { ability: spell.save.ability, dc: caster.dc, success: spell.save.success } : null;

  // ---- base effects ----
  let effects: SpellEffect[] = [];
  const override = SPELL_OVERRIDES[spell.id];
  const vars = { MOD: abilityMod };
  if (override) {
    effects = override.effects({ slot: slot || spell.level, charLevel });
  } else {
    for (const d of spell.dmg ?? []) {
      const raw = spell.level === 0 && d.char ? pickByLevel(d.char, charLevel) : d.slot ? pickByLevel(d.slot, slot) : d.char ? pickByLevel(d.char, charLevel) : null;
      if (!raw) continue;
      const expr = parseDice(raw, vars);
      const parts = [formatDice(parseDice(raw.replace(/\s*\+\s*MOD/, ""), vars))];
      if (/MOD/.test(raw) && ability) parts.push(`${abilityMod >= 0 ? "+" : "−"}${Math.abs(abilityMod)} (${abilityShort(ability)})`);
      effects.push({ kind: "damage", expr, count: 1, type: d.type, parts });
    }
    if (spell.heal) {
      const raw = pickByLevel(spell.heal, slot || spell.level);
      if (raw) {
        const expr = parseDice(raw, vars);
        const parts = [formatDice(parseDice(raw.replace(/\s*\+\s*MOD/, ""), vars))];
        if (/MOD/.test(raw) && ability) parts.push(`${abilityMod >= 0 ? "+" : "−"}${Math.abs(abilityMod)} (${abilityShort(ability)})`);
        effects.push({ kind: "heal", expr, count: 1, type: null, parts });
      }
    }
  }

  // ---- feature modifiers ----
  if (spell.id === "eldritch-blast" && has("eldritch-invocation-agonizing-blast")) {
    // "When you cast eldritch blast, add your Charisma modifier to the damage it deals on a hit."
    for (const e of effects) {
      e.expr = add(e.expr, flat(sheet.mods.cha));
      e.parts.push(`${sheet.mods.cha >= 0 ? "+" : "−"}${Math.abs(sheet.mods.cha)} (Мучительный взрыв, ХАР)`);
    }
  }
  if (spell.id === "eldritch-blast" && has("eldritch-invocation-repelling-blast")) notes.push("Отталкивающий взрыв: при попадании цель отталкивается на 10 футов.");

  const firstDamage = effects.find((e) => e.kind === "damage");
  if (firstDamage && classId === "wizard" && spell.school === "evocation" && has("empowered-evocation")) {
    // "add your Intelligence modifier to one damage roll of any wizard evocation spell you cast"
    firstDamage.expr = add(firstDamage.expr, flat(sheet.mods.int));
    firstDamage.parts.push(`+${sheet.mods.int} (Усиленное воплощение, ИНТ)`);
    if (firstDamage.count > 1) notes.push("Усиленное воплощение добавляется к одному броску урона, не к каждому лучу.");
  }
  if (has("potent-cantrip") && spell.level === 0 && spell.save) notes.push("Мощный заговор: при успешном спасброске цель получает половину урона.");
  if (has("elemental-affinity") && classId === "sorcerer") {
    const t = ancestryDamageType(c.choices["dragon-ancestor"] ?? []);
    const target = effects.find((e) => e.kind === "damage" && e.type === t);
    if (target) {
      // "add your Charisma modifier to one damage roll of that spell"
      target.expr = add(target.expr, flat(sheet.mods.cha));
      target.parts.push(`+${sheet.mods.cha} (Родство со стихией, ХАР)`);
      notes.push("Родство со стихией: можно потратить 1 единицу чародейства, чтобы получить сопротивление этому типу урона на 1 час.");
    }
  }
  const healing = effects.find((e) => e.kind === "heal");
  if (healing && has("disciple-of-life") && spell.level >= 1) {
    // "the creature regains additional hit points equal to 2 + the spell's level"
    const bonus = 2 + slot;
    healing.expr = add(healing.expr, flat(bonus));
    healing.parts.push(`+${bonus} (Последователь жизни: 2 + уровень ${slot})`);
  }
  if (healing && has("supreme-healing")) {
    // "you instead use the highest number possible for each die"
    const max = maximum(healing.expr);
    healing.parts.push(`= ${max} (Высшее исцеление: кубы на максимум)`);
    healing.expr = flat(max);
  }
  if (healing && has("blessed-healer") && spell.level >= 1) notes.push(`Благословенный целитель: если лечите другого, сами восстанавливаете ${2 + slot} хитов.`);

  if (spell.attack === "melee" || spell.attack === "ranged") {
    if (sheet.critFrom < 20) notes.push(`Критическое попадание на ${sheet.critFrom}–20 относится только к атакам оружием.`);
  }
  if (spell.conc && c.concentration && c.concentration !== spell.id) notes.push("Вы уже концентрируетесь на другом заклинании: новое прервёт его.");

  return {
    spell,
    classId,
    ability,
    slot,
    slotOptions,
    attack,
    save,
    effects,
    notes,
    cite: override?.cite ?? null,
  };
}

/** Total for one effect across all its instances */
export function effectTotal(e: SpellEffect): DiceExpr {
  return scale(e.expr, e.count);
}

export function effectAverage(e: SpellEffect): number {
  return average(effectTotal(e));
}

export { calc };

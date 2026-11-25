// Everything on the sheet that is computed from the character: each number is a
// Calc with labelled parts, so the UI can show "8 + 3 (мастерство) + 4 (ИНТ) = 15".
// Rule references are PHB / SRD 5.1 (2014).

import { catalog as defaultCatalog, type Catalog } from "../data/catalog";
import type { Character, InvItem } from "./character";
import { totalLevel } from "./character";
import { ABILITIES, type Ability, type CharClass, type Equipment, type Feat, type Feature, type MagicItem, type Trait } from "./types";
import { choiceKey, countAt, dieAt, evalExpr, type Effect, type EffectOwner, type Expr } from "./effects";
import { ITEM_BASE_WEAPON, ITEM_EFFECTS, type ItemMod } from "./itemEffects";
import { add, dice, flat, formatDice, parseDice, type DiceExpr } from "./dice";

export interface Part {
  label: string;
  value: number;
}
export interface Calc {
  value: number;
  parts: Part[];
}
export function calc(parts: Part[]): Calc {
  const kept = parts.filter((p, i) => p.value !== 0 || i === 0);
  return { value: kept.reduce((s, p) => s + p.value, 0), parts: kept };
}

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const profByLevel = (level: number) => Math.ceil(Math.max(1, level) / 4) + 1;

const SHORT: Record<Ability, string> = { str: "СИЛ", dex: "ЛОВ", con: "ТЕЛ", int: "ИНТ", wis: "МДР", cha: "ХАР" };
export const abilityShort = (a: Ability) => SHORT[a];

export type ProfLevel = "none" | "half" | "prof" | "expert";

export interface ActiveFeature {
  feature: Feature;
  classId: string;
}

export interface SpellcastingInfo {
  classId: string;
  className: string;
  ability: Ability;
  dc: Calc;
  attack: Calc;
  /** max prepared spells (prepared casters) or null */
  prepared: Calc | null;
  /** spells known (known casters) or null */
  known: number | null;
  cantrips: number;
  /** highest spell level this class can learn/prepare */
  maxLevel: number;
  pact: boolean;
  /** class spell list the spells come from (Eldritch Knight learns wizard spells); null = granted spells only */
  list: string | null;
}

export interface Resource {
  id: string;
  name: string;
  max: number;
  used: number;
  reset: "short" | "long";
  /** die shown next to the counter, e.g. bardic inspiration d8 */
  die?: string;
  unlimited?: boolean;
  note?: string;
}

export interface AttackInfo {
  uid: string;
  name: string;
  toHit: Calc;
  damage: DiceExpr;
  damageParts: string[];
  damageType: string | null;
  extra: { dice: string; type: string; when: string }[];
  range: string;
  props: string[];
  ability: Ability;
  proficient: boolean;
  melee: boolean;
  critFrom: number;
  notes: string[];
}

export interface RacialSpell {
  spellId: string;
  /** caster entry it is cast with ("race" or "owner:<id>") */
  classId?: string;
  note: string;
  /** cast at this slot level without using a slot */
  fixedSlot?: number;
  resourceId?: string;
}

export interface Warning {
  level: "warn" | "info";
  text: string;
}

export interface Sheet {
  level: number;
  prof: Calc;
  scores: Record<Ability, Calc>;
  mods: Record<Ability, number>;
  saves: Record<Ability, { calc: Calc; prof: boolean }>;
  skills: Record<string, { calc: Calc; prof: ProfLevel; ability: Ability }>;
  checkBonus: Record<Ability, Calc>; // raw ability check (JoaT etc.)
  ac: Calc;
  acNote: string | null;
  initiative: Calc;
  speed: Calc;
  hpMax: Calc;
  passive: { perception: Calc; insight: Calc; investigation: Calc };
  hitDice: { die: number; total: number; used: number }[];
  casting: SpellcastingInfo[];
  slots: number[];
  pact: { level: number; count: number } | null;
  racialSpells: RacialSpell[];
  breath: { dc: Calc; save: Ability; dice: string; type: string | null; area: { type: string; size: number } } | null;
  resources: Resource[];
  attacks: AttackInfo[];
  features: ActiveFeature[];
  traits: Trait[];
  profs: Set<string>;
  profNames: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  items: { item: InvItem; base: Equipment | null; magic: MagicItem | null }[];
  attuned: number;
  weight: { total: number; capacity: number };
  critFrom: number;
  /** Brutal Critical extra dice (barbarian level based) */
  brutalDice: number;
  /** save DCs of features (maneuvers, ki...) */
  dcs: { name: string; source: string; calc: Calc }[];
  /** on/off states features define (Bladesong...) */
  toggles: { id: string; name: string; source: string }[];
  otherSpeeds: Record<string, number>;
  resists: string[];
  senses: { name: string; range: number }[];
  feats: Feat[];
  owners: EffectOwner[];
  expertise: string[];
  effectLanguages: string[];
  /** spell-affecting effects for spellcalc, with the owner's expression variables */
  spellEffects: { e: Effect; owner: string; vars: Record<string, number> }[];
  sneakAttack: string | null;
  rageDamage: number;
  warnings: Warning[];
  /** helpers for spell math */
  spellAttackBonusItems: number;
  spellDcBonusItems: number;
}

const FULL_CASTERS = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);
const HALF_CASTERS = new Set(["paladin", "ranger"]);
const PREPARED_CASTERS = new Set(["cleric", "druid", "wizard", "paladin"]);

/** choices key holding the optional class features (Tasha's) enabled for a class */
export const optionalKey = (classId: string) => `optional:${classId}`;

/** PHB multiclass caster level contributed by one class (book classes declare their progression) */
function casterLevelOf(cls: { id: string; casting: CharClass["casting"] }, level: number): number {
  const p = cls.casting?.progression;
  if (p === "full" || (!p && FULL_CASTERS.has(cls.id))) return level;
  if (p === "halfUp") return Math.ceil(level / 2);
  if (p === "half" || (!p && HALF_CASTERS.has(cls.id))) return Math.floor(level / 2);
  return 0;
}

function itemName(it: InvItem, base: Equipment | null, magic: MagicItem | null): string {
  if (it.custom) return it.custom.name;
  // generic "+N" variants read better as "Кинжал +1"
  const plus = magic ? /^(?:Weapon|Armor|Ammunition), (\+\d)$/.exec(magic.en) : null;
  if (plus && base) return `${base.name} ${plus[1]}`;
  if (magic && base && magic.id !== base.id) return `${magic.name} (${base.name})`;
  return magic?.name ?? base?.name ?? "?";
}
export function inventoryName(it: InvItem, cat: Catalog = defaultCatalog): string {
  return itemName(it, it.baseId ? cat.equipment[it.baseId] ?? null : null, it.magicId ? cat.magicItems[it.magicId] ?? null : null);
}

export function derive(c: Character, cat: Catalog = defaultCatalog): Sheet {
  const warnings: Warning[] = [];
  const level = Math.max(1, totalLevel(c));
  const race = cat.races[c.raceId] ?? null;
  const subrace = c.subraceId ? cat.subraces[c.subraceId] ?? null : null;
  const background = c.backgroundId ? cat.backgrounds[c.backgroundId] ?? null : null;
  const classLevel = (id: string) => c.classes.find((e) => e.classId === id)?.level ?? 0;
  const subclassOf = (id: string) => c.classes.find((e) => e.classId === id)?.subclassId ?? null;

  // ---------- features ----------
  const features: ActiveFeature[] = [];
  const featureIds = new Set<string>();
  const addFeature = (id: string, classId: string) => {
    const f = cat.features[id];
    if (!f || featureIds.has(id)) return;
    featureIds.add(id);
    features.push({ feature: f, classId });
    for (const opt of c.choices[id] ?? []) addFeature(opt, classId);
  };
  for (const e of c.classes) {
    const cls = cat.classes[e.classId];
    if (!cls) continue;
    for (const lv of cls.levels.filter((l) => l.level <= e.level)) for (const f of lv.features) addFeature(f, e.classId);
    const sub = e.subclassId ? cat.subclasses[e.subclassId] : null;
    if (sub) for (const lv of sub.levels.filter((l) => l.level <= e.level)) for (const f of lv.features) addFeature(f, e.classId);
    // optional class features (Tasha's) the player turned on
    for (const id of c.choices[optionalKey(e.classId)] ?? []) {
      const f = cat.features[id];
      if (f?.optional && f.class === e.classId && f.level <= e.level) addFeature(id, e.classId);
    }
  }
  // eldritch invocations are chosen under the "eldritch-invocations" feature
  const has = (id: string) => featureIds.has(id);

  // ---------- race traits ----------
  const traitIds = [...(race?.traits ?? []), ...(subrace?.traits ?? [])];
  const traits: Trait[] = [];
  const addTrait = (id: string) => {
    const t = cat.traits[id];
    if (!t || traits.includes(t)) return;
    traits.push(t);
    for (const opt of c.choices[id] ?? []) addTrait(opt);
  };
  traitIds.forEach(addTrait);
  const hasTrait = (id: string) => traits.some((t) => t.id === id);

  // ---------- effect owners (book content: features, traits, feats, background) ----------
  const owners: EffectOwner[] = [];
  for (const af of features) if (af.feature.effects?.length) owners.push({ id: af.feature.id, name: af.feature.name, classId: af.classId, effects: af.feature.effects });
  for (const t of traits) if (t.effects?.length) owners.push({ id: t.id, name: t.name, effects: t.effects });
  if (background?.effects?.length) owners.push({ id: background.id, name: background.name, effects: background.effects });
  const feats: Feat[] = [];
  const addFeat = (id: string) => {
    const f = cat.feats[id];
    if (!f || feats.includes(f)) return;
    feats.push(f);
    owners.push({ id: `feat:${f.id}`, name: f.name, effects: f.effects ?? [] });
  };
  for (const [key, ch] of Object.entries(c.asi)) {
    const [classId, lvStr] = key.split(":");
    if (ch.kind === "feat" && classLevel(classId) >= Number(lvStr)) addFeat(ch.featId);
  }
  // feats granted by a choice (variant human); owners grows while we scan
  for (let i = 0; i < owners.length; i++)
    owners[i].effects.forEach((e, j) => {
      if (e.k === "featChoice") for (const fid of c.choices[choiceKey(owners[i].id, j)] ?? []) addFeat(fid);
    });
  /** active effects of one kind, with their owner and index (toggled effects only while on) */
  const effs = <K extends Effect["k"]>(k: K) =>
    owners.flatMap((o) =>
      o.effects
        .map((e, i) => ({ o, e: e as Extract<Effect, { k: K }>, i }))
        .filter((x) => x.e.k === k && (!x.e.when || c.toggles[x.e.when])),
    );
  const chosen = (o: EffectOwner, i: number) => c.choices[choiceKey(o.id, i)] ?? [];
  const toggles = owners.flatMap((o) => o.effects.filter((e): e is Extract<Effect, { k: "toggle" }> => e.k === "toggle").map((e) => ({ id: e.id, name: e.name, source: o.name })));

  // ---------- inventory & item effects ----------
  const items = c.inventory.map((item) => ({
    item,
    base: item.baseId ? cat.equipment[item.baseId] ?? null : item.magicId && ITEM_BASE_WEAPON[item.magicId] ? cat.equipment[ITEM_BASE_WEAPON[item.magicId]] ?? null : null,
    magic: item.magicId ? cat.magicItems[item.magicId] ?? null : null,
  }));
  const attuned = items.filter((x) => x.item.attuned).length;
  if (attuned > 3) warnings.push({ level: "warn", text: `Настроено ${attuned} предметов, а можно не больше 3 (правила настройки, Руководство мастера).` });
  const activeMagic = items.filter(({ item, magic }) => magic && item.equipped && (!magic.attune || item.attuned));
  const globalMods: { mod: ItemMod; label: string }[] = [];
  for (const { item, base, magic } of activeMagic) {
    const eff = ITEM_EFFECTS[magic!.id];
    if (!eff) continue;
    for (const m of eff.mods) {
      // weapon / armor bonuses stay on the item itself
      if (m.k === "weapon" || m.k === "weaponExtra" || m.k === "armor") continue;
      globalMods.push({ mod: m, label: itemName(item, base, magic) });
    }
  }
  const sumMods = (k: ItemMod["k"]) => globalMods.filter((g) => g.mod.k === k).map((g) => ({ label: g.label, value: (g.mod as { v: number }).v }));

  // ---------- proficiencies ----------
  const profs = new Set<string>();
  const first = c.classes[0];
  c.classes.forEach((e, i) => {
    const cls = cat.classes[e.classId];
    if (!cls) return;
    (i === 0 ? cls.profs : cls.multiProfs).forEach((p) => profs.add(p));
  });
  [...(race?.profs ?? []), ...(subrace?.profs ?? []), ...traits.flatMap((t) => t.profs), ...(background?.profs ?? [])].forEach((p) => profs.add(p));
  c.skills.forEach((s) => profs.add(`skill-${s}`));
  c.extraProfs.forEach((p) => profs.add(p));
  // Life Domain "Bonus Proficiency": "you gain proficiency with heavy armor"
  if (has("bonus-proficiency") && subclassOf("cleric") === "life") profs.add("heavy-armor");
  for (const { e } of effs("prof")) e.ids.forEach((p) => profs.add(p));
  for (const { o, i } of effs("skillChoice")) chosen(o, i).forEach((s) => profs.add(`skill-${s}`));
  for (const { o, i } of effs("toolChoice")) chosen(o, i).forEach((p) => profs.add(p));
  const expertise = new Set(c.expertise);
  for (const { o, i } of effs("expertiseChoice")) chosen(o, i).forEach((s) => expertise.add(s));
  const effectLanguages = effs("languageChoice").flatMap(({ o, i }) => chosen(o, i));

  // ---------- ability scores ----------
  const scores = {} as Record<Ability, Calc>;
  const asiAdds: Record<Ability, Part[]> = { str: [], dex: [], con: [], int: [], wis: [], cha: [] };
  for (const [key, choice] of Object.entries(c.asi)) {
    const [classId, lvStr] = key.split(":");
    if (classLevel(classId) < Number(lvStr) || choice.kind !== "asi") continue;
    for (const a of ABILITIES) {
      const v = choice.abilities[a] ?? 0;
      if (v) asiAdds[a].push({ label: `Увеличение характеристик (${cat.classes[classId]?.name ?? classId} ${lvStr})`, value: v });
    }
  }
  for (const a of ABILITIES) {
    const parts: Part[] = [{ label: "Базовое значение", value: c.base[a] }];
    if (race?.bonuses[a] && !subrace?.replaceBonuses) parts.push({ label: race.name, value: race.bonuses[a]! });
    if (subrace?.bonuses[a]) parts.push({ label: subrace.name, value: subrace.bonuses[a]! });
    if (race?.bonusChoice && c.raceBonusChoice.includes(a)) parts.push({ label: `${race.name}: на выбор`, value: race.bonusChoice.bonus });
    let value = parts.reduce((s, p) => s + p.value, 0);
    for (const p of asiAdds[a]) {
      // PHB: "you can't increase an ability score above 20 using this feature"
      const room = Math.max(0, 20 - value);
      const used = Math.min(room, p.value);
      parts.push({ ...p, value: used });
      value += used;
    }
    // feats / traits: "+1 to an ability score, to a maximum of 20"
    const effAdds: Part[] = [
      ...effs("ability").filter(({ e }) => e.ability === a).map(({ o, e }) => ({ label: o.name, value: e.value, max: e.max ?? 20 })),
      ...effs("abilityChoice").filter(({ o, i }) => chosen(o, i).includes(a)).map(({ o, e }) => ({ label: o.name, value: e.value, max: e.max ?? 20 })),
    ].map(({ label, value: v, max }) => {
      const used = Math.max(0, Math.min(v, max - value));
      value += used;
      return { label, value: used };
    });
    parts.push(...effAdds);
    // capstones that raise the maximum
    if (a === "str" || a === "con") {
      if (has("primal-champion")) {
        parts.push({ label: "Первобытный чемпион", value: 4 });
        value += 4;
      }
    }
    for (const g of globalMods) {
      if (g.mod.k === "abilityAdd" && g.mod.ability === a) {
        const add = Math.max(0, Math.min(g.mod.v, g.mod.max - value));
        if (add) parts.push({ label: g.label, value: add });
        value += add;
      }
    }
    for (const g of globalMods) {
      if (g.mod.k === "abilitySet" && g.mod.ability === a && g.mod.v > value) {
        parts.push({ label: `${g.label}: значение ${g.mod.v}`, value: g.mod.v - value });
        value = g.mod.v;
      }
    }
    scores[a] = calc(parts);
  }
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, mod(scores[a].value)])) as Record<Ability, number>;

  // ---------- proficiency bonus ----------
  const prof = calc([{ label: `Уровень персонажа ${level}`, value: profByLevel(level) }, ...sumMods("prof")]);
  const pb = prof.value;

  // expression variables for an effect owner
  const varsFor = (o?: EffectOwner): Record<string, number> => {
    const v: Record<string, number> = { prof: pb, level, clevel: o?.classId ? classLevel(o.classId) : level };
    for (const a of ABILITIES) {
      v[`mod.${a}`] = mods[a];
      v[`score.${a}`] = scores[a].value;
    }
    return v;
  };
  const ev = (o: EffectOwner, x: Expr) => {
    try {
      return evalExpr(x, varsFor(o));
    } catch {
      warnings.push({ level: "warn", text: `Не удалось посчитать «${o.name}»: ${String(x)}` });
      return 0;
    }
  };
  const effParts = (list: { o: EffectOwner; e: { value: Expr } }[]): Part[] => list.map(({ o, e }) => ({ label: o.name, value: ev(o, e.value) }));

  // ---------- saves ----------
  const saveProfs = new Set<Ability>(first ? cat.classes[first.classId]?.saves ?? [] : []);
  if (has("diamond-soul")) ABILITIES.forEach((a) => saveProfs.add(a));
  if (has("slippery-mind")) saveProfs.add("wis");
  for (const { e } of effs("saveProf")) e.abilities.forEach((a) => saveProfs.add(a));
  for (const { o, e, i } of effs("abilityChoice")) if (e.saveProf) chosen(o, i).forEach((a) => saveProfs.add(a as Ability));
  const auraOfProtection = has("aura-of-protection") ? Math.max(1, mods.cha) : 0;
  const saves = {} as Sheet["saves"];
  for (const a of ABILITIES) {
    const parts: Part[] = [{ label: `Модификатор ${SHORT[a]}`, value: mods[a] }];
    if (saveProfs.has(a)) parts.push({ label: "Бонус мастерства", value: pb });
    parts.push(...sumMods("save"));
    parts.push(...effParts(effs("save").filter(({ e }) => !e.abilities || e.abilities.includes(a))));
    if (auraOfProtection) parts.push({ label: "Аура защиты (сам паладин)", value: auraOfProtection });
    saves[a] = { calc: calc(parts), prof: saveProfs.has(a) };
  }

  // ---------- checks & skills ----------
  const jackOfAllTrades = has("jack-of-all-trades");
  const remarkableAthlete = has("remarkable-athlete");
  const halfFor = (a: Ability): Part | null => {
    if (remarkableAthlete && (a === "str" || a === "dex" || a === "con"))
      return { label: "Выдающийся атлет (½ мастерства, вверх)", value: Math.ceil(pb / 2) };
    if (jackOfAllTrades) return { label: "Мастер на все руки (½ мастерства)", value: Math.floor(pb / 2) };
    return null;
  };
  const checkBonus = {} as Record<Ability, Calc>;
  for (const a of ABILITIES) {
    const half = halfFor(a);
    checkBonus[a] = calc([
      { label: `Модификатор ${SHORT[a]}`, value: mods[a] }, ...(half ? [half] : []), ...sumMods("check"),
      ...effParts(effs("check").filter(({ e }) => !e.skills && (!e.abilities || e.abilities.includes(a)))),
    ]);
  }
  const skills = {} as Sheet["skills"];
  for (const s of cat.ref.skills) {
    const a = s.ability;
    const isProf = profs.has(`skill-${s.id}`);
    const isExpert = isProf && expertise.has(s.id);
    const parts: Part[] = [{ label: `Модификатор ${SHORT[a]}`, value: mods[a] }];
    let level: ProfLevel = "none";
    if (isExpert) {
      parts.push({ label: "Компетентность (×2 мастерства)", value: pb * 2 });
      level = "expert";
    } else if (isProf) {
      parts.push({ label: "Бонус мастерства", value: pb });
      level = "prof";
    } else {
      const half = halfFor(a);
      if (half) {
        parts.push(half);
        level = "half";
      }
    }
    parts.push(...sumMods("check"));
    parts.push(...effParts(effs("check").filter(({ e }) => (e.skills ? e.skills.includes(s.id) : !e.abilities || e.abilities.includes(a)))));
    skills[s.id] = { calc: calc(parts), prof: level, ability: a };
  }
  const passive = (id: string, name: string) => calc([{ label: "Базовое значение", value: 10 }, { label: name, value: skills[id].calc.value }]);

  // ---------- armor class ----------
  const wornArmor = items.find((x) => x.item.equipped && x.base?.armor && x.base.armor.cat !== "shield");
  const wornShield = items.find((x) => x.item.equipped && x.base?.armor?.cat === "shield");
  const itemArmorBonus = (x: (typeof items)[number] | undefined) =>
    x?.magic && (!x.magic.attune || x.item.attuned)
      ? (ITEM_EFFECTS[x.magic.id]?.mods ?? []).filter((m) => m.k === "armor").reduce((s, m) => s + (m as { v: number }).v, 0)
      : 0;
  let acParts: Part[];
  let acNote: string | null = null;
  if (wornArmor) {
    const ar = wornArmor.base!.armor!;
    acParts = [{ label: itemName(wornArmor.item, wornArmor.base, wornArmor.magic), value: ar.base }];
    if (ar.dex) {
      const d = ar.max != null ? Math.min(mods.dex, ar.max) : mods.dex;
      acParts.push({ label: ar.max != null ? `ЛОВ (не больше +${ar.max})` : "Модификатор ЛОВ", value: d });
    }
    const mb = itemArmorBonus(wornArmor);
    if (mb) acParts.push({ label: "Магия доспеха", value: mb });
    if (has("fighter-fighting-style-defense") || has("fighting-style-defense") || has("ranger-fighting-style-defense"))
      acParts.push({ label: "Боевой стиль: Оборона", value: 1 });
    const armorProf = profs.has(`${ar.cat}-armor`) || profs.has("all-armor");
    if (!armorProf)
      warnings.push({ level: "warn", text: `Нет владения доспехом «${wornArmor.base!.name}»: помеха на проверки, спасброски и атаки СИЛ и ЛОВ, нельзя накладывать заклинания.` });
    if (ar.str && scores.str.value < ar.str)
      warnings.push({ level: "warn", text: `Для доспеха «${wornArmor.base!.name}» нужна СИЛ ${ar.str}: скорость уменьшена на 10 футов.` });
    if (ar.stealth) warnings.push({ level: "info", text: `Доспех «${wornArmor.base!.name}» даёт помеху на проверки Ловкости (Скрытность).` });
  } else {
    // unarmored options: take the best one the character qualifies for
    const options: { label: string; parts: Part[]; shieldOk: boolean }[] = [
      { label: "Без доспеха", parts: [{ label: "Без доспеха", value: 10 }, { label: "Модификатор ЛОВ", value: mods.dex }], shieldOk: true },
    ];
    if (has("barbarian-unarmored-defense"))
      options.push({ label: "Защита без доспехов (варвар)", shieldOk: true, parts: [{ label: "Защита без доспехов", value: 10 }, { label: "Модификатор ЛОВ", value: mods.dex }, { label: "Модификатор ТЕЛ", value: mods.con }] });
    if (has("monk-unarmored-defense"))
      options.push({ label: "Защита без доспехов (монах)", shieldOk: false, parts: [{ label: "Защита без доспехов", value: 10 }, { label: "Модификатор ЛОВ", value: mods.dex }, { label: "Модификатор МДР", value: mods.wis }] });
    if (has("draconic-resilience"))
      options.push({ label: "Драконья устойчивость", shieldOk: true, parts: [{ label: "Драконья устойчивость", value: 13 }, { label: "Модификатор ЛОВ", value: mods.dex }] });
    for (const g of globalMods)
      if (g.mod.k === "acBase") options.push({ label: g.label, shieldOk: true, parts: [{ label: g.label, value: g.mod.base }, { label: "Модификатор ЛОВ", value: mods.dex }] });
    for (const { o, e } of effs("acBase"))
      options.push({ label: e.label, shieldOk: e.shield, parts: [{ label: e.label, value: ev(o, e.base) }, ...e.abilities.map((a) => ({ label: `Модификатор ${SHORT[a]}`, value: mods[a] }))] });
    const usable = options.filter((o) => o.shieldOk || !wornShield);
    const best = usable.reduce((a, b) => (calc(b.parts).value > calc(a.parts).value ? b : a));
    acParts = best.parts;
    if (options.length > usable.length) acNote = "Защита без доспехов монаха не работает со щитом.";
  }
  if (wornShield) {
    acParts.push({ label: itemName(wornShield.item, wornShield.base, wornShield.magic), value: 2 });
    const mb = itemArmorBonus(wornShield);
    if (mb) acParts.push({ label: "Магия щита", value: mb });
    if (!profs.has("shields")) warnings.push({ level: "warn", text: "Нет владения щитами: помеха на проверки, спасброски и атаки СИЛ и ЛОВ, нельзя накладывать заклинания." });
  }
  for (const g of globalMods) {
    if (g.mod.k !== "ac") continue;
    if (g.mod.when === "noArmorNoShield" && (wornArmor || wornShield)) continue;
    acParts.push({ label: g.label, value: g.mod.v });
  }
  for (const { o, e } of effs("ac")) {
    if ((e.armor === "none" && wornArmor) || (e.armor === "armored" && !wornArmor)) continue;
    acParts.push({ label: o.name, value: ev(o, e.value) });
  }
  const ac = calc(acParts);

  // ---------- initiative ----------
  const initiative = calc([...checkBonus.dex.parts, ...effParts(effs("initiative"))]);

  // ---------- speed ----------
  const heavy = wornArmor?.base?.armor?.cat === "heavy";
  const armorOk = (cond?: "any" | "none" | "notHeavy") => cond === "none" ? !wornArmor : cond === "notHeavy" ? !heavy : true;
  const walkSet = effs("speed").filter(({ e }) => e.set && (e.mode ?? "walk") === "walk" && armorOk(e.armor));
  const speedParts: Part[] = walkSet.length
    ? [{ label: walkSet[0].o.name, value: ev(walkSet[0].o, walkSet[0].e.value) }]
    : [{ label: subrace?.speed ? subrace.name : race ? `${race.name}` : "Раса", value: subrace?.speed ?? race?.speed ?? 30 }];
  for (const { o, e } of effs("speed")) if (!e.set && (e.mode ?? "walk") === "walk" && armorOk(e.armor)) speedParts.push({ label: o.name, value: ev(o, e.value) });
  const otherSpeeds: Record<string, number> = {};
  for (const { o, e } of effs("speed")) {
    const m = e.mode ?? "walk";
    if (m === "walk" || !armorOk(e.armor)) continue;
    // "equal to your walking speed" is written as value "walk" -> not supported; numbers only
    otherSpeeds[m] = e.set ? ev(o, e.value) : (otherSpeeds[m] ?? 0) + ev(o, e.value);
  }
  if (has("fast-movement") && !heavy) speedParts.push({ label: "Быстрое передвижение", value: 10 });
  if (classLevel("monk") >= 2 && !wornArmor && !wornShield) {
    const lv = cat.classes.monk.levels[classLevel("monk") - 1];
    const v = lv?.cs?.unarmored_movement ?? 0;
    if (v) speedParts.push({ label: "Движение без доспехов", value: v });
  }
  if (wornArmor?.base?.armor?.str && scores.str.value < wornArmor.base.armor.str) speedParts.push({ label: "Тяжёлый доспех без нужной СИЛ", value: -10 });
  if (c.exhaustion >= 5) speedParts.push({ label: "Истощение 5", value: -(speedParts.reduce((s, p) => s + p.value, 0)) });
  else if (c.exhaustion >= 2) speedParts.push({ label: "Истощение 2+: скорость вдвое меньше", value: -Math.floor(speedParts.reduce((s, p) => s + p.value, 0) / 2) });
  const speed = calc(speedParts);

  // ---------- hit points ----------
  const hpParts: Part[] = [];
  c.classes.forEach((e, ci) => {
    const cls = cat.classes[e.classId];
    if (!cls) return;
    const d = cls.hitDie;
    let sum = 0;
    for (let lv = 1; lv <= e.level; lv++) {
      if (ci === 0 && lv === 1) sum += d; // PHB: max at 1st level
      else {
        const rolled = c.hpMethod === "rolled" ? e.hpRolls[lv - 1] : null;
        sum += rolled ?? d / 2 + 1; // PHB fixed value: half the die + 1
      }
    }
    hpParts.push({ label: `${cls.name} ${e.level} (к${d})`, value: sum });
  });
  hpParts.push({ label: `ТЕЛ ${mods.con >= 0 ? "+" : ""}${mods.con} × ${level}`, value: mods.con * level });
  if (hasTrait("dwarven-toughness")) hpParts.push({ label: "Дварфийская выдержка", value: level });
  if (has("draconic-resilience")) hpParts.push({ label: "Драконья устойчивость", value: classLevel("sorcerer") });
  for (const { o, e } of effs("hp")) {
    // per level: class level for class features, character level for race / feats
    const per = e.perLevel != null ? ev(o, e.perLevel) * (o.classId ? classLevel(o.classId) : level) : 0;
    const v = per + (e.flat != null ? ev(o, e.flat) : 0);
    if (v) hpParts.push({ label: o.name, value: v });
  }
  let hpMax = calc(hpParts);
  if (c.hp.maxOverride != null) hpMax = calc([{ label: "Задано вручную", value: c.hp.maxOverride }]);
  if (c.exhaustion >= 4) hpMax = calc([...hpMax.parts, { label: "Истощение 4: максимум хитов вдвое меньше", value: -Math.ceil(hpMax.value / 2) }]);

  const hitDiceMap = new Map<number, number>();
  for (const e of c.classes) {
    const d = cat.classes[e.classId]?.hitDie;
    if (d) hitDiceMap.set(d, (hitDiceMap.get(d) ?? 0) + e.level);
  }
  const hitDice = [...hitDiceMap.entries()].sort((a, b) => b[0] - a[0]).map(([die, total]) => ({ die, total, used: c.hitDiceUsed[die] ?? 0 }));

  // ---------- spellcasting ----------
  const spellAttackItems = sumMods("spellAttack");
  const spellDcItems = sumMods("spellDc");
  const castDc = (a: Ability, classId: string) =>
    calc([
      { label: "Базовое значение", value: 8 }, { label: "Бонус мастерства", value: pb }, { label: `Модификатор ${SHORT[a]}`, value: mods[a] }, ...spellDcItems,
      ...effParts(effs("spellDc").filter(({ e }) => !e.classId || e.classId === classId)),
    ]);
  const castAttack = (a: Ability, classId: string) =>
    calc([
      { label: "Бонус мастерства", value: pb }, { label: `Модификатор ${SHORT[a]}`, value: mods[a] }, ...spellAttackItems,
      ...effParts(effs("spellAttack").filter(({ e }) => !e.classId || e.classId === classId)),
    ]);
  const casting: SpellcastingInfo[] = [];
  for (const e of c.classes) {
    const cls = cat.classes[e.classId];
    if (!cls?.casting || e.level < cls.casting.level) continue;
    const a = cls.casting.ability;
    const lv = cls.levels[e.level - 1];
    const dc = castDc(a, cls.id);
    const attack = castAttack(a, cls.id);
    let prepared: Calc | null = null;
    const prepMode = cls.casting.prepared !== undefined ? cls.casting.prepared : PREPARED_CASTERS.has(cls.id) ? (cls.id === "paladin" ? "half" : "level") : null;
    if (prepMode) {
      const lvlPart = prepMode === "half" ? Math.floor(e.level / 2) : prepMode === "halfUp" ? Math.ceil(e.level / 2) : e.level;
      const raw = mods[a] + lvlPart;
      prepared = calc([
        { label: `Модификатор ${SHORT[a]}`, value: mods[a] },
        { label: prepMode === "level" ? `Уровень (${cls.name})` : `½ уровня (${cls.name})`, value: lvlPart },
        ...(raw < 1 ? [{ label: "Минимум 1", value: 1 - raw }] : []),
      ]);
    }
    const slots = lv?.spell?.slots ?? [];
    const maxLevel = slots.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0)
      + (cls.id === "warlock" ? 0 : 0);
    casting.push({
      classId: cls.id,
      className: cls.name,
      ability: a,
      dc,
      attack,
      prepared,
      known: prepMode ? null : lv?.spell?.known ?? null,
      cantrips: lv?.spell?.cantrips ?? 0,
      maxLevel,
      pact: cls.id === "warlock",
      list: cls.id,
    });
  }
  // subclass casters (Eldritch Knight, Arcane Trickster): tables by class level from the book
  const subCasters: { classId: string; level: number; slots: number[] }[] = [];
  for (const e of c.classes) {
    const sub = e.subclassId ? cat.subclasses[e.subclassId] : null;
    const sc = sub?.casting;
    if (!sc) continue;
    const at = <T,>(tbl: Record<string, T>): T | undefined => {
      const k = Object.keys(tbl).map(Number).filter((x) => x <= e.level).sort((x, y) => y - x)[0];
      return k != null ? tbl[String(k)] : undefined;
    };
    const slotRow = at(sc.slots);
    if (!slotRow) continue;
    const slots9 = Array.from({ length: 9 }, (_, i) => slotRow[i] ?? 0);
    subCasters.push({ classId: e.classId, level: e.level, slots: slots9 });
    casting.push({
      classId: e.classId,
      className: `${cat.classes[e.classId]?.name}: ${sub!.name}`,
      ability: sc.ability,
      dc: castDc(sc.ability, e.classId),
      attack: castAttack(sc.ability, e.classId),
      prepared: null,
      known: at(sc.known) ?? null,
      cantrips: at(sc.cantrips) ?? 0,
      maxLevel: slots9.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0),
      pact: false,
      list: sc.list,
    });
  }

  // racial spellcasting (SRD traits) and spells granted by book traits / feats
  const racialSpells: RacialSpell[] = [];
  const raceCaster = (ability: Ability, name: string, classId = "race") => {
    if (casting.some((k) => k.classId === classId)) return;
    casting.push({
      classId,
      className: name,
      ability,
      dc: castDc(ability, classId),
      attack: castAttack(ability, classId),
      prepared: null,
      known: null,
      cantrips: 0,
      maxLevel: 0,
      pact: false,
      list: null,
    });
  };
  for (const { o, e } of effs("spells")) {
    // a class feature's bonus spells use that class's ability unless the book names one
    const ability = e.ability ?? (o.classId ? cat.classes[o.classId]?.casting?.ability : undefined) ?? "int";
    const casterId = `owner:${o.id}`;
    raceCaster(ability, o.name, casterId);
    for (const s of e.spells) {
      if ((s.level ?? 1) > level) continue;
      const sp = cat.spells[s.spell];
      const uses = e.uses ?? "longRest";
      const limited = Boolean(sp && sp.level > 0 && uses === "longRest");
      const how = uses === "ritual" ? "только как ритуал" : uses === "slots" ? "тратит ячейку" : limited ? "раз в продолжительный отдых без ячейки" : "";
      racialSpells.push({
        spellId: s.spell,
        classId: casterId,
        note: [o.name, e.note, sp?.level ? how : ""].filter(Boolean).join(": "),
        fixedSlot: limited ? sp.level : undefined,
        resourceId: limited ? `${o.id}:${s.spell}` : undefined,
      });
    }
  }
  if (hasTrait("high-elf-cantrip")) {
    // "You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it."
    raceCaster("int", "Заговор высшего эльфа");
    for (const id of c.choices["high-elf-cantrip"] ?? []) racialSpells.push({ spellId: id, note: "Заговор высшего эльфа" });
  }
  if (hasTrait("infernal-legacy")) {
    // "You know the thaumaturgy cantrip. ...3rd level: hellish rebuke as a 2nd-level spell once... 5th level: darkness once... Charisma is your spellcasting ability"
    raceCaster("cha", "Дьявольское наследие");
    racialSpells.push({ spellId: "thaumaturgy", note: "Дьявольское наследие" });
    if (level >= 3) racialSpells.push({ spellId: "hellish-rebuke", note: "Дьявольское наследие: раз в продолжительный отдых, как заклинание 2 уровня", fixedSlot: 2, resourceId: "infernal-hellish-rebuke" });
    if (level >= 5) racialSpells.push({ spellId: "darkness", note: "Дьявольское наследие: раз в продолжительный отдых", fixedSlot: 2, resourceId: "infernal-darkness" });
  }

  // slots: one spellcasting class -> its own table; several -> PHB multiclass table
  const slotClasses = c.classes.filter((e) => {
    const cls = cat.classes[e.classId];
    return cls?.casting && e.classId !== "warlock" && e.level >= cls.casting.level;
  });
  let slots = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  if (slotClasses.length === 1 && subCasters.length === 0) {
    const e = slotClasses[0];
    slots = [...(cat.classes[e.classId].levels[e.level - 1]?.spell?.slots ?? slots)];
  } else if (slotClasses.length === 0 && subCasters.length === 1) {
    slots = [...subCasters[0].slots];
  } else if (slotClasses.length + subCasters.length > 1) {
    // PHB multiclassing: full levels + half of paladin/ranger + a third of Eldritch Knight / Arcane Trickster (rounded down)
    const casterLevel =
      slotClasses.reduce((s, e) => s + casterLevelOf(cat.classes[e.classId], e.level), 0) +
      subCasters.reduce((s, x) => s + Math.floor(x.level / 3), 0);
    // the multiclass spellcaster table equals the full-caster (wizard) slot progression
    if (casterLevel > 0) slots = [...(cat.classes.wizard.levels[Math.min(20, casterLevel) - 1]?.spell?.slots ?? slots)];
  }
  let pact: Sheet["pact"] = null;
  const wl = classLevel("warlock");
  if (wl) {
    const s = cat.classes.warlock.levels[wl - 1]?.spell?.slots ?? [];
    const idx = s.findIndex((n) => n > 0);
    if (idx >= 0) pact = { level: idx + 1, count: s[idx] };
  }

  // ---------- resources ----------
  const resources: Resource[] = [];
  const used = (id: string) => c.used[id] ?? 0;
  const res = (r: Omit<Resource, "used">) => resources.push({ ...r, used: used(r.id) });
  const cs = (classId: string) => cat.classes[classId]?.levels[classLevel(classId) - 1]?.cs ?? {};
  if (classLevel("barbarian")) {
    const n = cs("barbarian").rage_count ?? 0;
    res({ id: "rage", name: "Ярость", max: n >= 9999 ? 0 : n, reset: "long", unlimited: n >= 9999, note: `Урон +${cs("barbarian").rage_damage_bonus ?? 0}` });
  }
  if (classLevel("bard")) {
    const die = cs("bard").bardic_inspiration_die;
    res({ id: "bardic-inspiration", name: "Вдохновение барда", max: Math.max(1, mods.cha), reset: has("font-of-inspiration") ? "short" : "long", die: die ? `к${die}` : undefined });
  }
  if (classLevel("cleric") >= 2) res({ id: "channel-divinity", name: "Божественный канал", max: cs("cleric").channel_divinity_charges ?? 1, reset: "short" });
  if (classLevel("paladin") >= 3) res({ id: "channel-divinity-paladin", name: "Божественный канал (паладин)", max: 1, reset: "short" });
  if (classLevel("druid") >= 2) res({ id: "wild-shape", name: "Дикий облик", max: 2, reset: "short", unlimited: classLevel("druid") >= 20 });
  if (classLevel("fighter")) {
    res({ id: "second-wind", name: "Второе дыхание", max: 1, reset: "short", note: `1к10 + ${classLevel("fighter")}` });
    const as = cs("fighter").action_surges ?? 0;
    if (as) res({ id: "action-surge", name: "Всплеск действий", max: as, reset: "short" });
    const ind = cs("fighter").indomitable_uses ?? 0;
    if (ind) res({ id: "indomitable", name: "Упорный", max: ind, reset: "long" });
  }
  if (classLevel("monk") >= 2) res({ id: "ki", name: "Ци", max: cs("monk").ki_points ?? 0, reset: "short", note: `Сл ${8 + pb + mods.wis}` });
  if (classLevel("paladin")) {
    res({ id: "divine-sense", name: "Божественное чувство", max: 1 + Math.max(0, mods.cha), reset: "long" });
    res({ id: "lay-on-hands", name: "Наложение рук (хиты)", max: 5 * classLevel("paladin"), reset: "long" });
  }
  if (classLevel("sorcerer") >= 2) res({ id: "sorcery-points", name: "Единицы чародейства", max: cs("sorcerer").sorcery_points ?? 0, reset: "long" });
  if (classLevel("wizard")) res({ id: "arcane-recovery", name: "Магическое восстановление", max: 1, reset: "long", note: `Ячейки суммарно до ${Math.ceil(classLevel("wizard") / 2)} уровня, не выше 5` });
  if (hasTrait("breath-weapon")) res({ id: "breath-weapon", name: "Оружие дыхания", max: 1, reset: "short" });
  for (const rs of racialSpells) if (rs.resourceId) res({ id: rs.resourceId, name: cat.spells[rs.spellId]?.name ?? rs.spellId, max: 1, reset: "long", note: rs.note });
  // book features: limited uses, dice pools
  for (const { o, e } of effs("resource")) {
    if (resources.some((r) => r.id === e.id)) continue;
    const clevel = o.classId ? classLevel(o.classId) : level;
    const die = dieAt(e.die, clevel);
    res({ id: e.id, name: e.name, max: Math.max(0, Math.floor(ev(o, e.max))), reset: e.reset, die: die ? die.replace("d", "к") : undefined, note: e.note });
  }
  const dcs = effs("dc").map(({ o, e }) => ({ name: e.name, source: o.name, calc: calc([{ label: e.name, value: ev(o, e.value) }]) }));

  // Dragonborn breath weapon: "DC = 8 + your Constitution modifier + your proficiency bonus.
  // 2d6 damage ... increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level."
  let breath: Sheet["breath"] = null;
  const ancestry = traits.find((t) => t.breath);
  if (hasTrait("breath-weapon") && ancestry?.breath) {
    const b = ancestry.breath;
    const raw = b.dmg ? Object.entries(b.dmg).filter(([lv]) => Number(lv) <= level).sort((x, y) => Number(y[0]) - Number(x[0]))[0]?.[1] : null;
    breath = {
      dc: calc([{ label: "Базовое значение", value: 8 }, { label: "Модификатор ТЕЛ", value: mods.con }, { label: "Бонус мастерства", value: pb }]),
      save: b.save ?? "dex",
      dice: raw ?? "2d6",
      type: b.type ?? ancestry.damageType,
      area: b.area,
    };
  }
  if (hasTrait("relentless-endurance")) res({ id: "relentless-endurance", name: "Непоколебимая стойкость", max: 1, reset: "long" });

  // ---------- attacks ----------
  let critFrom = Math.min(20, ...effs("critFrom").map(({ e }) => e.value));
  if (has("improved-critical")) critFrom = Math.min(critFrom, 19);
  if (has("superior-critical")) critFrom = Math.min(critFrom, 18);
  const raging = Boolean(c.toggles.rage) && classLevel("barbarian") > 0;
  const rageDamage = raging ? cs("barbarian").rage_damage_bonus ?? 0 : 0;
  const archery = has("fighter-fighting-style-archery") || has("ranger-fighting-style-archery");
  const dueling = has("fighter-fighting-style-dueling") || has("fighting-style-dueling") || has("ranger-fighting-style-dueling");
  const twf = has("fighter-fighting-style-two-weapon-fighting") || has("ranger-fighting-style-two-weapon-fighting");
  const monkLevel = classLevel("monk");
  const martialDie: number | null = monkLevel ? cs("monk").martial_arts?.dice_value ?? 4 : null;
  const sa = classLevel("rogue") ? cs("rogue").sneak_attack : null;
  const sneakAttack = sa ? `${sa.dice_count}к${sa.dice_value}` : null;

  const heldWeapons = items.filter((x) => x.item.equipped && x.base?.weapon);
  const isMonkWeapon = (w: Equipment) =>
    w.id === "shortsword" || (w.weapon!.cat === "simple" && w.weapon!.range === "melee" && !w.weapon!.props.includes("two-handed") && !w.weapon!.props.includes("heavy"));
  const attacks: AttackInfo[] = [];
  for (const x of heldWeapons) {
    const w = x.base!;
    const wd = w.weapon!;
    const magicOn = x.magic && (!x.magic.attune || x.item.attuned);
    const eff = magicOn ? ITEM_EFFECTS[x.magic!.id] : undefined;
    const magicBonus = (eff?.mods ?? []).filter((m) => m.k === "weapon").reduce((s, m) => s + (m as { v: number }).v, 0);
    const extra = (eff?.mods ?? []).filter((m): m is Extract<ItemMod, { k: "weaponExtra" }> => m.k === "weaponExtra").map((m) => ({ dice: m.dice.replace("d", "к"), type: m.type, when: m.when }));
    const finesse = wd.props.includes("finesse") || x.magic?.id === "sun-blade";
    const monkOk = monkLevel > 0 && isMonkWeapon(w);
    let ability: Ability = wd.range === "ranged" ? "dex" : "str";
    if ((finesse || monkOk) && mods.dex > mods[ability]) ability = "dex";
    // e.g. Hex Warrior: "you can use your Charisma modifier instead of Strength or Dexterity"
    for (const { e } of effs("attackAbility")) if (mods[e.ability] > mods[ability]) ability = e.ability;
    const rangeOk = (r?: "melee" | "ranged") => !r || r === wd.range;
    const proficient =
      profs.has(`${wd.cat}-weapons`) || profs.has(`${w.id}s`) || profs.has(w.id) || (x.magic?.id === "sun-blade" && (profs.has("longswords") || profs.has("shortswords")));
    const toHit = calc([
      { label: `Модификатор ${SHORT[ability]}`, value: mods[ability] },
      ...(proficient ? [{ label: "Бонус мастерства", value: pb }] : []),
      ...(magicBonus ? [{ label: "Магическое оружие", value: magicBonus }] : []),
      ...(archery && wd.range === "ranged" ? [{ label: "Боевой стиль: Стрельба", value: 2 }] : []),
      ...effParts(effs("weaponAttack").filter(({ e }) => rangeOk(e.range))),
    ]);
    let die = (x.item.twoHanded && wd.twoHanded) || wd.dice || "1";
    if (monkOk && martialDie) {
      const cur = parseDice(die);
      const curMax = cur.dice[0]?.d ?? 1;
      if (martialDie > curMax) die = `1d${martialDie}`;
    }
    const dmgParts: string[] = [`${formatDice(parseDice(die))} (${w.name})`];
    let dmg = parseDice(die);
    const offHand = Boolean(x.item.offHand);
    const abilityDmg = offHand && !twf ? Math.min(0, mods[ability]) : mods[ability];
    if (abilityDmg) {
      dmg = add(dmg, flat(abilityDmg));
      dmgParts.push(`${abilityDmg > 0 ? "+" : "−"}${Math.abs(abilityDmg)} (${SHORT[ability]})`);
    }
    if (magicBonus) {
      dmg = add(dmg, flat(magicBonus));
      dmgParts.push(`+${magicBonus} (магия)`);
    }
    const otherWeaponHeld = heldWeapons.length > 1;
    if (dueling && wd.range === "melee" && !x.item.twoHanded && !wd.props.includes("two-handed") && !otherWeaponHeld) {
      dmg = add(dmg, flat(2));
      dmgParts.push("+2 (Дуэлянт)");
    }
    for (const { o, e } of effs("weaponDamage")) {
      if (!rangeOk(e.range)) continue;
      const v = ev(o, e.value);
      if (!v) continue;
      dmg = add(dmg, flat(v));
      dmgParts.push(`${v > 0 ? "+" : "−"}${Math.abs(v)} (${o.name})`);
    }
    for (const { o, e } of effs("weaponExtra")) if (rangeOk(e.range)) extra.push({ dice: e.dice.replace("d", "к"), type: e.type, when: `${o.name}: ${e.note}` });
    if (rageDamage && ability === "str" && wd.range === "melee") {
      dmg = add(dmg, flat(rageDamage));
      dmgParts.push(`+${rageDamage} (ярость)`);
    }
    const notes: string[] = [];
    if (!proficient) notes.push("Нет владения: бонус мастерства не добавляется.");
    if (offHand) notes.push(twf ? "Вторая рука, стиль «Сражение двумя оружиями»: модификатор добавляется." : "Вторая рука: модификатор к урону не добавляется (если он не отрицательный).");
    if (sneakAttack && (finesse || wd.range === "ranged")) notes.push(`Скрытая атака: +${sneakAttack} раз в ход при преимуществе или союзнике рядом с целью.`);
    if (has("divine-smite") && wd.range === "melee") notes.push("Божественная кара: трата ячейки, +2к8 излучением за 1 уровень, +1к8 за каждый уровень выше, максимум 5к8; +1к8 по нежити и исчадиям.");
    if (has("improved-divine-smite") && wd.range === "melee") extra.push({ dice: "1к8", type: "radiant", when: "Улучшенная божественная кара, каждое попадание" });
    if (has("divine-strike")) extra.push({ dice: classLevel("cleric") >= 14 ? "2к8" : "1к8", type: "radiant", when: "Божественный удар, раз в ход" });
    if (c.concentration === "hunters-mark") extra.push({ dice: "1к6", type: wd.type ?? "", when: "Метка охотника, по отмеченной цели" });
    if (has("fighting-style-great-weapon-fighting") || has("fighter-fighting-style-great-weapon-fighting")) {
      if (wd.props.includes("two-handed") || (x.item.twoHanded && wd.twoHanded)) notes.push("Сражение большим оружием: перебросьте 1 и 2 на кубах урона.");
    }
    const range = wd.range === "ranged" ? `${wd.normal}/${wd.long} фт` : wd.thrown ? `5 фт, метание ${wd.thrown.normal}/${wd.thrown.long} фт` : wd.props.includes("reach") ? "10 фт" : "5 фт";
    attacks.push({
      uid: x.item.uid,
      name: itemName(x.item, x.base, x.magic),
      toHit,
      damage: dmg,
      damageParts: dmgParts,
      damageType: x.magic?.id === "sun-blade" ? "radiant" : wd.type,
      extra,
      range,
      props: wd.props.map((p) => cat.ref.weaponProps[p]?.name ?? p),
      ability,
      proficient,
      melee: wd.range === "melee",
      critFrom,
      notes,
    });
  }
  // unarmed strike: PHB "1 + your Strength modifier", monks use Martial Arts
  {
    const ability: Ability = monkLevel && mods.dex > mods.str ? "dex" : "str";
    const base = martialDie ? dice(1, martialDie) : flat(1);
    let dmg = add(base, flat(mods[ability]));
    const parts = [martialDie ? `1к${martialDie} (Боевые искусства)` : "1 (безоружный удар)", `${mods[ability] >= 0 ? "+" : "−"}${Math.abs(mods[ability])} (${SHORT[ability]})`];
    if (rageDamage && ability === "str") {
      dmg = add(dmg, flat(rageDamage));
      parts.push(`+${rageDamage} (ярость)`);
    }
    attacks.push({
      uid: "unarmed",
      name: "Безоружный удар",
      toHit: calc([{ label: `Модификатор ${SHORT[ability]}`, value: mods[ability] }, { label: "Бонус мастерства", value: pb }]),
      damage: dmg,
      damageParts: parts,
      damageType: "bludgeoning",
      extra: [],
      range: "5 фт",
      props: [],
      ability,
      proficient: true,
      melee: true,
      critFrom,
      notes: monkLevel ? ["Боевые искусства: после атаки действием можно ударить бонусным действием."] : [],
    });
  }

  // ---------- warnings about unfinished choices ----------
  for (const { feature, classId } of features) {
    if (feature.choice?.kind === "feature" && feature.choice.options?.length) {
      const picked = (c.choices[feature.id] ?? []).length;
      const n = countAt(feature.choice.n, classLevel(classId));
      if (picked < n) warnings.push({ level: "info", text: `Нужно выбрать: ${feature.name} (${n - picked}).` });
    }
    if (feature.invocations) {
      const n = cs("warlock").invocations_known ?? 0;
      const picked = (c.choices[feature.id] ?? []).length;
      if (picked < n) warnings.push({ level: "info", text: `Таинственные воззвания: выбрано ${picked} из ${n}.` });
    }
  }
  for (const t of traits) {
    if (t.options && !(c.choices[t.id] ?? []).length) warnings.push({ level: "info", text: `Нужно выбрать: ${t.name}.` });
  }
  for (const e of c.classes) {
    const cls = cat.classes[e.classId];
    if (!cls) continue;
    for (const lv of cls.levels.filter((l) => l.level <= e.level && l.features.some((f) => f.includes("ability-score-improvement")))) {
      if (!c.asi[`${e.classId}:${lv.level}`]) warnings.push({ level: "info", text: `Увеличение характеристик: ${cls.name} ${lv.level} уровня не распределено.` });
    }
    const subLevel = cls.levels.find((l) => l.features.some((f) => cat.features[f] && cls.subclasses.length && /primal-path$|bard-college$|divine-domain$|druid-circle$|martial-archetype$|monastic-tradition$|sacred-oath$|ranger-archetype$|roguish-archetype$|sorcerous-origin$|otherworldly-patron$|arcane-tradition$/.test(f)))?.level;
    if (subLevel && e.level >= subLevel && !e.subclassId) warnings.push({ level: "info", text: `${cls.name}: на ${subLevel} уровне выбирается подкласс.` });
  }
  if (race?.bonusChoice && c.raceBonusChoice.length < race.bonusChoice.n) warnings.push({ level: "info", text: `${race.name}: выберите ${race.bonusChoice.n} характеристики для +${race.bonusChoice.bonus}.` });
  if (first) {
    const cls = cat.classes[first.classId];
    if (cls?.skillChoice) {
      const fromClass = c.skills.filter((s) => cls.skillChoice!.from.includes(s)).length;
      if (fromClass < cls.skillChoice.n) warnings.push({ level: "info", text: `Навыки класса: выбрано ${fromClass} из ${cls.skillChoice.n}.` });
    }
  }

  // ---------- weight ----------
  const weightOf = (x: (typeof items)[number]) => (x.item.custom?.weight ?? x.base?.weight ?? 0) * x.item.qty;
  const totalWeight = items.reduce((s, x) => s + weightOf(x), 0);
  const capacity = scores.str.value * 15; // PHB: Strength score × 15
  if (totalWeight > capacity) warnings.push({ level: "warn", text: `Вес снаряжения ${totalWeight} фнт больше грузоподъёмности ${capacity} фнт.` });

  // ---------- proficiency names ----------
  const P = cat.ref.proficiencies;
  const profNames = { armor: [] as string[], weapons: [] as string[], tools: [] as string[], languages: [] as string[] };
  for (const p of profs) {
    const info = P[p];
    if (!info || p.startsWith("skill-") || p.startsWith("saving-throw-")) continue;
    if (info.type === "Armor") profNames.armor.push(info.name);
    else if (info.type === "Weapons") profNames.weapons.push(info.name);
    else if (info.type !== "Skills" && info.type !== "Saving Throws") profNames.tools.push(info.name);
  }
  const langIds = new Set([...(race?.languages ?? []), ...c.languages]);
  profNames.languages = [...langIds].map((l) => cat.ref.languages.find((x) => x.id === l)?.name ?? l);

  return {
    level,
    prof,
    scores,
    mods,
    saves,
    skills,
    checkBonus,
    ac,
    acNote,
    initiative,
    speed,
    hpMax,
    passive: {
      perception: passive("perception", "Внимательность"),
      insight: passive("insight", "Проницательность"),
      investigation: passive("investigation", "Анализ"),
    },
    hitDice,
    casting,
    slots,
    pact,
    racialSpells,
    breath,
    resources,
    attacks,
    features,
    traits,
    profs,
    profNames,
    items,
    attuned,
    weight: { total: totalWeight, capacity },
    critFrom,
    brutalDice: classLevel("barbarian") ? cs("barbarian").brutal_critical_dice ?? 0 : 0,
    dcs,
    toggles,
    otherSpeeds,
    resists: [...new Set(effs("resist").flatMap(({ e }) => e.types))],
    // same sense from several sources (darkvision 60 / superior 120): keep the longest
    senses: Object.values(
      effs("sense").reduce<Record<string, { name: string; range: number }>>((acc, { e }) => {
        const key = e.name.toLowerCase().replace(/превосходное\s+/, "");
        if (!acc[key] || acc[key].range < e.range) acc[key] = { name: e.name, range: e.range };
        return acc;
      }, {}),
    ),
    feats,
    owners,
    expertise: [...expertise],
    effectLanguages,
    spellEffects: [...effs("cantripDamage"), ...effs("spellDamage"), ...effs("healBonus")].map(({ o, e }) => ({ e, owner: o.name, vars: varsFor(o) })),
    sneakAttack,
    rageDamage,
    warnings,
    spellAttackBonusItems: spellAttackItems.reduce((s, p) => s + p.value, 0),
    spellDcBonusItems: spellDcItems.reduce((s, p) => s + p.value, 0),
  };
}

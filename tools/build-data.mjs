// Build the app catalog from the English SRD 5.1 (2014) data plus the Russian
// overlay in data/ru/parts/*.json. Entries without a translation yet keep the
// English text and are marked `tr: false`, so the UI can show it honestly.
//
// Usage: node tools/build-data.mjs
// Output: src/data/gen/*.json

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EN = join(ROOT, "sources", "srd", "en");
const RU_REF = join(ROOT, "sources", "srd", "ru");
const PARTS = join(ROOT, "data", "ru", "parts");
const OUT = join(ROOT, "src", "data", "gen");

const load = (dir, name) => JSON.parse(readFileSync(join(dir, `5e-SRD-${name}.json`), "utf8"));

// Typos (data/srd-errata.json) and structured fixes checked against the PHB (data/srd-patches.json)
const ERRATA = JSON.parse(readFileSync(join(ROOT, "data", "srd-errata.json"), "utf8"));
const PATCHES = JSON.parse(readFileSync(join(ROOT, "data", "srd-patches.json"), "utf8"));
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}
const fixText = (v, wrong, right) => (Array.isArray(v) ? v.map((x) => fixText(x, wrong, right)) : typeof v === "string" ? v.replaceAll(wrong, right) : v);
const en = (name) => {
  const data = load(EN, name);
  for (const item of data) {
    for (const [field, [wrong, right]] of Object.entries(ERRATA[name]?.[item.index] ?? {})) item[field] = fixText(item[field], wrong, right);
    for (const [path, value] of Object.entries(PATCHES[name]?.[item.index] ?? {})) if (path !== "_why") setPath(item, path, value);
  }
  return data;
};
const ruRef = (name) => Object.fromEntries(load(RU_REF, name).map((x) => [x.index, x]));

// ---- Russian overlay: slice name -> index -> fields ----
const overlay = {};
if (existsSync(PARTS)) {
  for (const file of readdirSync(PARTS).filter((f) => f.endsWith(".json"))) {
    const slice = file.replace(/\.\d+\.json$/, "").replace(/-\d+$/, "");
    const data = JSON.parse(readFileSync(join(PARTS, file), "utf8"));
    overlay[slice] = Object.assign(overlay[slice] ?? {}, data);
  }
}
const tr = (slice, key) => overlay[slice]?.[key];

// ---- Dictionaries (terms as in the Russian Player's Handbook) ----
const ABILITY = {
  str: ["СИЛ", "Сила"], dex: ["ЛОВ", "Ловкость"], con: ["ТЕЛ", "Телосложение"],
  int: ["ИНТ", "Интеллект"], wis: ["МДР", "Мудрость"], cha: ["ХАР", "Харизма"],
};
// PHB RU names that differ from the 5e-database ru files
const SKILL_FIX = { perception: "Внимательность", investigation: "Анализ" };
const CONDITION_RU = {
  blinded: "Ослеплённый", charmed: "Очарованный", deafened: "Оглохший", exhaustion: "Истощение",
  frightened: "Испуганный", grappled: "Схваченный", incapacitated: "Недееспособный",
  invisible: "Невидимый", paralyzed: "Парализованный", petrified: "Окаменевший",
  poisoned: "Отравленный", prone: "Сбитый с ног", restrained: "Опутанный",
  stunned: "Ошеломлённый", unconscious: "Бессознательный",
};
const DAMAGE_RU = {
  acid: ["кислота", "кислотой"], bludgeoning: ["дробящий", "дробящий"], cold: ["холод", "холодом"],
  fire: ["огонь", "огнём"], force: ["силовое поле", "силовым полем"],
  lightning: ["электричество", "электричеством"], necrotic: ["некротическая энергия", "некротической энергией"],
  piercing: ["колющий", "колющий"], poison: ["яд", "ядом"], psychic: ["психическая энергия", "психической энергией"],
  radiant: ["излучение", "излучением"], slashing: ["рубящий", "рубящий"], thunder: ["звук", "звуком"],
};
const SCHOOL_RU = {
  abjuration: "Ограждение", conjuration: "Вызов", divination: "Прорицание", enchantment: "Очарование",
  evocation: "Воплощение", illusion: "Иллюзия", necromancy: "Некромантия", transmutation: "Преобразование",
};
const RANGE_RU = {
  Self: "На себя", Touch: "Касание", Sight: "В пределах видимости", Special: "Особая", Unlimited: "Неограниченная",
  "1 mile": "1 миля", "500 miles": "500 миль",
};
const DURATION_RU = {
  Instantaneous: "Мгновенная", Special: "Особая", "Until dispelled": "Пока не рассеется",
  "1 round": "1 раунд", "1 minute": "1 минута", "10 minutes": "10 минут", "1 hour": "1 час",
  "8 hours": "8 часов", "24 hours": "24 часа", "7 days": "7 дней", "10 days": "10 дней", "30 days": "30 дней",
  "Up to 1 round": "вплоть до 1 раунда", "Up to 1 minute": "вплоть до 1 минуты", "Up to 10 minutes": "вплоть до 10 минут",
  "Up to 1 hour": "вплоть до 1 часа", "Up to 2 hours": "вплоть до 2 часов", "Up to 8 hours": "вплоть до 8 часов",
  "Up to 24 hours": "вплоть до 24 часов",
};
const CAST_RU = {
  "1 action": "1 действие", "1 bonus action": "1 бонусное действие", "1 reaction": "1 реакция",
  "1 minute": "1 минута", "10 minutes": "10 минут", "1 hour": "1 час", "8 hours": "8 часов",
  "12 hours": "12 часов", "24 hours": "24 часа", "1 action or 8 hours": "1 действие или 8 часов",
};
const AOE_RU = { cone: "конус", cube: "куб", cylinder: "цилиндр", line: "линия", sphere: "сфера" };
const RARITY_RU = {
  Common: "обычный", Uncommon: "необычный", Rare: "редкий", "Very Rare": "очень редкий",
  Legendary: "легендарный", Artifact: "артефакт", Varies: "разная",
};
// DMG, "Magic Item Rarity" table: recommended minimum character level
const RARITY_LEVEL = { Common: 1, Uncommon: 1, Rare: 5, "Very Rare": 11, Legendary: 17, Artifact: 17, Varies: 1 };
const SIZE_RU = { Tiny: "Крошечный", Small: "Маленький", Medium: "Средний", Large: "Большой" };

function feetRu(s) {
  const m = /^(\d+) feet$/.exec(s);
  return m ? `${m[1]} футов` : null;
}
const rangeRu = (s) => RANGE_RU[s] ?? feetRu(s) ?? s;

let untranslated = 0;
function text(slice, key, field, fallback) {
  const t = tr(slice, key);
  if (t && t[field] !== undefined) return t[field];
  return fallback;
}
function isTr(slice, key) {
  const ok = Boolean(tr(slice, key));
  if (!ok) untranslated++;
  return ok;
}
const src = (slice, key) => tr(slice, key)?._src ?? null;

// ---- Reference lists ----
const skillsRu = ruRef("Skills");
const skills = en("Skills").map((s) => ({
  id: s.index,
  name: SKILL_FIX[s.index] ?? skillsRu[s.index]?.name ?? s.name,
  en: s.name,
  ability: s.ability_score.index,
  desc: skillsRu[s.index]?.desc ?? s.desc,
}));

const conditionsRu = ruRef("Conditions");
const conditions = en("Conditions").map((c) => ({
  id: c.index,
  name: CONDITION_RU[c.index] ?? c.name,
  en: c.name,
  desc: conditionsRu[c.index]?.desc ?? c.desc,
}));

const languagesRu = ruRef("Languages");
const languages = en("Languages").map((l) => ({
  id: l.index, name: languagesRu[l.index]?.name ?? l.name, en: l.name, type: l.type,
}));
const alignmentsRu = ruRef("Alignments");
const alignments = en("Alignments").map((a) => ({ id: a.index, name: alignmentsRu[a.index]?.name ?? a.name }));

const damageTypes = en("Damage-Types").map((d) => ({
  id: d.index, name: DAMAGE_RU[d.index]?.[0] ?? d.name, instr: DAMAGE_RU[d.index]?.[1] ?? d.name, en: d.name,
}));

// ---- Spells ----
const spells = en("Spells").map((s) => {
  // `damage` is an array in the source (flame strike: fire + radiant, etc.)
  const dmgList = (Array.isArray(s.damage) ? s.damage : s.damage ? [s.damage] : [])
    .filter((d) => d.damage_at_slot_level || d.damage_at_character_level)
    .map((d) => ({
      type: d.damage_type?.index ?? null,
      slot: d.damage_at_slot_level ?? null,
      char: d.damage_at_character_level ?? null,
    }));
  const dmg = dmgList.length ? dmgList : null;
  return {
    id: s.index,
    name: text("spells", s.index, "name", s.name),
    en: s.name,
    level: s.level,
    school: s.school.index,
    cast: CAST_RU[s.casting_time] ?? s.casting_time,
    range: rangeRu(s.range),
    dur: DURATION_RU[s.duration] ?? s.duration,
    conc: s.concentration,
    ritual: s.ritual,
    comp: s.components.map((c) => ({ V: "В", S: "С", M: "М" })[c] ?? c),
    mat: s.material ? text("spells", s.index, "material", s.material) : null,
    desc: text("spells", s.index, "desc", s.desc),
    higher: s.higher_level?.length ? text("spells", s.index, "higher_level", s.higher_level) : null,
    classes: s.classes.map((c) => c.index),
    subclasses: (s.subclasses ?? []).map((c) => c.index),
    attack: s.attack_type ?? null,
    dmg,
    heal: s.heal_at_slot_level ?? null,
    save: s.dc ? { ability: s.dc.dc_type.index, success: s.dc.dc_success } : null,
    aoe: s.area_of_effect ? { type: s.area_of_effect.type, size: s.area_of_effect.size, name: AOE_RU[s.area_of_effect.type] } : null,
    src: src("spells", s.index),
    tr: isTr("spells", s.index),
  };
});

// ---- Features ----
const features = en("Features").map((f) => {
  const fs = f.feature_specific ?? {};
  let choice = null;
  if (fs.subfeature_options) {
    choice = {
      kind: "feature",
      n: fs.subfeature_options.choose,
      options: fs.subfeature_options.from.options.map((o) => o.item.index),
    };
  } else if (fs.expertise_options) {
    choice = { kind: "expertise", n: f.index.startsWith("bard") ? 2 : 2 };
  } else if (fs.enemy_type_options) {
    choice = { kind: "enemy", n: fs.enemy_type_options.choose, options: fs.enemy_type_options.from.options.map((o) => o.string ?? o.item?.name) };
  } else if (fs.terrain_type_options) {
    choice = { kind: "terrain", n: fs.terrain_type_options.choose, options: fs.terrain_type_options.from.options.map((o) => o.string ?? o.item?.name) };
  }
  return {
    id: f.index,
    name: text("features", f.index, "name", f.name),
    en: f.name,
    class: f.class.index,
    subclass: f.subclass?.index ?? null,
    level: f.level,
    parent: f.parent?.index ?? null,
    desc: text("features", f.index, "desc", f.desc),
    choice,
    invocations: fs.invocations?.map((i) => i.index) ?? null,
    prereq: f.prerequisites?.length ? f.prerequisites : null,
    src: src("features", f.index),
    tr: isTr("features", f.index),
  };
});

// ---- Classes & levels ----
const levels = en("Levels");
const subclassesEn = en("Subclasses");
const classes = en("Classes").map((c) => {
  const pc = c.proficiency_choices?.find((p) => p.from.options?.[0]?.item?.index?.startsWith("skill-"));
  const lv = levels
    .filter((l) => l.class.index === c.index && !l.subclass)
    .sort((a, b) => a.level - b.level)
    .map((l) => ({
      level: l.level,
      prof: l.prof_bonus,
      asi: l.ability_score_bonuses,
      features: l.features.map((f) => f.index),
      spell: l.spellcasting
        ? {
            cantrips: l.spellcasting.cantrips_known ?? 0,
            known: l.spellcasting.spells_known ?? null,
            slots: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => l.spellcasting[`spell_slots_level_${n}`] ?? 0),
          }
        : null,
      cs: l.class_specific ?? null,
    }));
  return {
    id: c.index,
    name: text("misc", `class:${c.index}`, "name", c.name),
    en: c.name,
    hitDie: c.hit_die,
    saves: c.saving_throws.map((s) => s.index),
    profs: c.proficiencies.map((p) => p.index),
    skillChoice: pc
      ? { n: pc.choose, from: pc.from.options.map((o) => o.item.index.replace(/^skill-/, "")) }
      : null,
    casting: c.spellcasting ? { ability: c.spellcasting.spellcasting_ability.index, level: c.spellcasting.level } : null,
    multiclass: c.multi_classing?.prerequisites?.map((p) => ({ ability: p.ability_score.index, min: p.minimum_score }))
      ?? c.multi_classing?.prerequisite_options?.from?.options?.map((p) => ({ ability: p.ability_score.index, min: p.minimum_score, any: true }))
      ?? [],
    multiProfs: (c.multi_classing?.proficiencies ?? []).map((p) => p.index),
    multiSkill: c.multi_classing?.proficiency_choices?.[0]?.choose ?? 0,
    startEquip: (c.starting_equipment ?? []).map((e) => ({ id: e.equipment.index, qty: e.quantity })),
    // "(a) X or (b) Y" picks: each option is a list of fixed items or "n from a category"
    startOptions: (c.starting_equipment_options ?? []).map((set) => {
      const conv = (o) => {
        if (o.option_type === "counted_reference") return [{ id: o.of.index, qty: o.count }];
        if (o.option_type === "multiple") return o.items.flatMap(conv);
        if (o.option_type === "choice") return [{ category: o.choice.from.equipment_category?.index, n: o.choice.choose }];
        return [];
      };
      if (set.from.option_set_type === "equipment_category") return { options: [[{ category: set.from.equipment_category.index, n: set.choose }]] };
      return { options: set.from.options.map(conv).filter((x) => x.length) };
    }),
    subclasses: subclassesEn.filter((s) => s.class.index === c.index).map((s) => s.index),
    levels: lv,
  };
});

const subclasses = subclassesEn.map((s) => ({
  id: s.index,
  name: text("misc", `subclass:${s.index}`, "name", s.name),
  en: s.name,
  class: s.class.index,
  flavor: text("misc", `subclass:${s.index}`, "subclass_flavor", s.subclass_flavor),
  desc: text("misc", `subclass:${s.index}`, "desc", s.desc),
  levels: levels
    .filter((l) => l.subclass?.index === s.index)
    .sort((a, b) => a.level - b.level)
    .map((l) => ({ level: l.level, features: l.features.map((f) => f.index), cs: l.subclass_specific ?? null })),
  spells: (s.spells ?? []).map((sp) => ({
    spell: sp.spell.index,
    level: Number(sp.prerequisites?.find((p) => p.type === "level")?.index?.split("-").pop() ?? 1),
  })),
  tr: isTr("misc", `subclass:${s.index}`),
}));

// ---- Races ----
const traitsEn = en("Traits");
const traits = traitsEn.map((t) => {
  const ts = t.trait_specific ?? {};
  return {
    id: t.index,
    name: text("misc", `trait:${t.index}`, "name", t.name),
    en: t.name,
    desc: text("misc", `trait:${t.index}`, "desc", t.desc),
    profs: (t.proficiencies ?? []).map((p) => p.index),
    profChoice: t.proficiency_choices
      ? { n: t.proficiency_choices.choose, from: t.proficiency_choices.from.options.map((o) => o.item.index) }
      : null,
    options: ts.subtrait_options ? ts.subtrait_options.from.options.map((o) => o.item.index) : null,
    spellOptions: ts.spell_options ? ts.spell_options.from.options.map((o) => o.item.index) : null,
    damageType: ts.damage_type?.index ?? null,
    breath: ts.breath_weapon
      ? {
          area: ts.breath_weapon.area_of_effect,
          save: ts.breath_weapon.dc?.dc_type?.index ?? null,
          dmg: ts.breath_weapon.damage?.[0]?.damage_at_character_level ?? null,
          type: ts.breath_weapon.damage?.[0]?.damage_type?.index ?? null,
        }
      : null,
    parent: t.parent?.index ?? null,
    tr: isTr("misc", `trait:${t.index}`),
  };
});

const subracesEn = en("Subraces");
const races = en("Races").map((r) => ({
  id: r.index,
  name: text("misc", `race:${r.index}`, "name", r.name),
  en: r.name,
  speed: r.speed,
  size: SIZE_RU[r.size] ?? r.size,
  bonuses: Object.fromEntries(r.ability_bonuses.map((b) => [b.ability_score.index, b.bonus])),
  bonusChoice: r.ability_bonus_options
    ? { n: r.ability_bonus_options.choose, from: r.ability_bonus_options.from.options.map((o) => o.ability_score.index), bonus: r.ability_bonus_options.from.options[0].bonus }
    : null,
  languages: r.languages.map((l) => l.index),
  languageChoice: r.language_options ? { n: r.language_options.choose } : null,
  profs: (r.starting_proficiencies ?? []).map((p) => p.index),
  profChoice: r.starting_proficiency_options
    ? { n: r.starting_proficiency_options.choose, from: r.starting_proficiency_options.from.options.map((o) => o.item.index) }
    : null,
  traits: r.traits.map((t) => t.index),
  subraces: subracesEn.filter((s) => s.race.index === r.index).map((s) => s.index),
  age: text("misc", `race:${r.index}`, "age", r.age),
  alignment: text("misc", `race:${r.index}`, "alignment", r.alignment),
  sizeDesc: text("misc", `race:${r.index}`, "size_description", r.size_description),
  languageDesc: text("misc", `race:${r.index}`, "language_desc", r.language_desc),
  tr: isTr("misc", `race:${r.index}`),
}));

const subraces = subracesEn.map((s) => ({
  id: s.index,
  name: text("misc", `subrace:${s.index}`, "name", s.name),
  en: s.name,
  race: s.race.index,
  desc: text("misc", `subrace:${s.index}`, "desc", s.desc),
  bonuses: Object.fromEntries(s.ability_bonuses.map((b) => [b.ability_score.index, b.bonus])),
  traits: s.racial_traits.map((t) => t.index),
  profs: (s.starting_proficiencies ?? []).map((p) => p.index),
  languageChoice: s.language_options ? { n: s.language_options.choose } : null,
  tr: isTr("misc", `subrace:${s.index}`),
}));

// ---- Backgrounds & feats ----
const backgrounds = en("Backgrounds").map((b) => ({
  id: b.index,
  name: text("misc", `background:${b.index}`, "name", b.name),
  en: b.name,
  profs: b.starting_proficiencies.map((p) => p.index),
  languageChoice: b.language_options ? { n: b.language_options.choose } : null,
  equipment: b.starting_equipment.map((e) => ({ id: e.equipment.index, qty: e.quantity })),
  gold: b.starting_gold?.quantity ?? 0,
  feature: text("misc", `background:${b.index}`, "feature", b.feature),
  tr: isTr("misc", `background:${b.index}`),
}));

const feats = en("Feats").map((f) => ({
  id: f.index,
  name: text("misc", `feat:${f.index}`, "name", f.name),
  en: f.name,
  prereq: f.prerequisites?.map((p) => ({ ability: p.ability_score.index, min: p.minimum_score })) ?? [],
  desc: text("misc", `feat:${f.index}`, "desc", f.desc),
  tr: isTr("misc", `feat:${f.index}`),
}));

const proficiencies = Object.fromEntries(
  en("Proficiencies").map((p) => [
    p.index,
    { name: text("misc", `proficiency:${p.index}`, "name", p.name), type: p.type, ref: p.reference?.index ?? null },
  ]),
);

// ---- Equipment ----
const weaponProps = Object.fromEntries(
  en("Weapon-Properties").map((p) => [
    p.index,
    { name: text("equipment", `property:${p.index}`, "name", p.name), desc: text("equipment", `property:${p.index}`, "desc", p.desc) },
  ]),
);
const categories = Object.fromEntries(
  en("Equipment-Categories").map((c) => [c.index, text("equipment", `category:${c.index}`, "name", c.name)]),
);
const categoryItems = Object.fromEntries(
  en("Equipment-Categories").filter((c) => !/wondrous|rod|potion|ring|scroll|staff|wand/.test(c.index)).map((c) => [c.index, (c.equipment ?? []).map((e) => e.index)]),
);
const equipment = en("Equipment").map((e) => ({
  id: e.index,
  name: text("equipment", e.index, "name", e.name),
  en: e.name,
  cat: e.equipment_category.index,
  sub: e.gear_category?.index ?? e.tool_category ?? e.vehicle_category ?? null,
  weapon: e.weapon_category
    ? {
        cat: e.weapon_category.toLowerCase(),
        range: e.weapon_range.toLowerCase(),
        dice: e.damage?.damage_dice ?? null,
        type: e.damage?.damage_type?.index ?? null,
        twoHanded: e.two_handed_damage?.damage_dice ?? null,
        props: (e.properties ?? []).map((p) => p.index),
        normal: e.range?.normal ?? 5,
        long: e.range?.long ?? null,
        thrown: e.throw_range ?? null,
      }
    : null,
  armor: e.armor_category
    ? {
        cat: e.armor_category.toLowerCase(),
        base: e.armor_class.base,
        dex: e.armor_class.dex_bonus,
        max: e.armor_class.max_bonus ?? null,
        str: e.str_minimum ?? 0,
        stealth: e.stealth_disadvantage ?? false,
      }
    : null,
  weight: e.weight ?? 0,
  cost: e.cost ? { q: e.cost.quantity, u: e.cost.unit } : null,
  desc: e.desc?.length ? text("equipment", e.index, "desc", e.desc) : null,
  contents: e.contents?.map((c) => ({ id: c.item.index, qty: c.quantity })) ?? null,
  tr: isTr("equipment", e.index),
}));

const magicItems = en("Magic-Items").map((m) => {
  const desc = text("magic-items", m.index, "desc", m.desc);
  const head = m.desc[0] ?? "";
  return {
    id: m.index,
    name: text("magic-items", m.index, "name", m.name),
    en: m.name,
    cat: m.equipment_category.index,
    rarity: m.rarity.name,
    rarityName: RARITY_RU[m.rarity.name] ?? m.rarity.name,
    minLevel: RARITY_LEVEL[m.rarity.name] ?? 1,
    attune: /requires attunement/i.test(head),
    variant: m.variant,
    variants: m.variants.map((v) => v.index),
    desc,
    src: src("magic-items", m.index),
    tr: isTr("magic-items", m.index),
  };
});

// ---- Rulebook content (data/books/<book>/*.json), see docs/book-content-guide.md ----
const BOOKS = join(ROOT, "data", "books");
const SPELL_CAST = (s) => CAST_RU[s] ?? s;
for (const list of [spells, features, classes, subclasses, races, subraces, traits, backgrounds, feats]) for (const x of list) x.source ??= "srd";
let bookCount = 0;
if (existsSync(BOOKS)) {
  const seen = new Map();
  for (const [kind, list] of Object.entries({ spells, features, subclasses, races, subraces, traits, backgrounds, feats })) for (const x of list) seen.set(`${kind}:${x.id}`, "srd");
  const addUnique = (kind, list, item, file) => {
    const key = `${kind}:${item.id}`;
    if (seen.has(key)) throw new Error(`${file}: duplicate ${kind} id "${item.id}" (already in ${seen.get(key)})`);
    seen.set(key, file);
    list.push(item);
    bookCount++;
  };
  const pending = []; // feature options appended to their parent's choice after all files load
  for (const book of readdirSync(BOOKS)) {
    const dir = join(BOOKS, book);
    // class files first: their subclasses may live in other files of the same book
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort((a, b) => (b.startsWith("class") - a.startsWith("class")) || a.localeCompare(b));
    for (const file of files) {
      const rel = `${book}/${file}`;
      const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const src = (page) => (page ? `${book}:${page}` : null);
      const common = (x) => ({ source: book, tr: true, src: src(x.page), effects: x.effects ?? undefined });
      const addFeature = (f, cls, sub) => {
        addUnique("features", features, {
          id: f.id, name: f.name, en: f.en, class: f.class ?? cls, subclass: f.subclass ?? sub ?? null, level: f.level ?? 1,
          parent: f.parent ?? null, desc: f.desc ?? [], choice: f.choice ?? null, invocations: null, prereq: f.prereq ?? null,
          optional: Boolean(f.optional), ...common(f),
        }, rel);
        for (const target of f.addTo ?? []) pending.push({ target, id: f.id, rel });
      };
      // whole classes from books (Artificer); added before subclasses so they can attach
      for (const k of data.classes ?? []) {
        if (classes.some((c) => c.id === k.id)) throw new Error(`${rel}: duplicate class ${k.id}`);
        for (const f of k.features ?? []) addFeature(f, k.id, null);
        classes.push({
          id: k.id, name: k.name, en: k.en, hitDie: k.hitDie, saves: k.saves, profs: k.profs ?? [],
          skillChoice: k.skillChoice ?? null,
          casting: k.casting ?? null,
          multiclass: k.multiclass ?? [], multiProfs: k.multiProfs ?? [], multiSkill: k.multiSkill ?? 0,
          startEquip: k.startEquip ?? [], subclasses: [],
          levels: (k.levels ?? []).map((l) => ({
            level: l.level, prof: l.prof ?? Math.ceil(l.level / 4) + 1, asi: 0, features: l.features ?? [],
            spell: l.spell ? { cantrips: l.spell.cantrips ?? 0, known: l.spell.known ?? null, slots: Array.from({ length: 9 }, (_, i) => l.spell.slots?.[i] ?? 0) } : null,
            cs: l.cs ?? null,
          })),
          source: book, src: src(k.page), desc: k.desc ?? [],
        });
        bookCount++;
      }
      for (const s of data.subclasses ?? []) {
        const byLevel = new Map();
        for (const f of s.features ?? []) {
          addFeature(f, s.class, s.id);
          byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f.id]);
        }
        addUnique("subclasses", subclasses, {
          id: s.id, name: s.name, en: s.en, class: s.class, flavor: s.flavor ?? "", desc: s.desc ?? [],
          levels: [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, fs]) => ({ level, features: fs, cs: null })),
          spells: s.spells ?? [], spellMode: s.spellMode ?? "always", casting: s.casting ?? null, ...common(s),
        }, rel);
        const cls = classes.find((c) => c.id === s.class);
        if (!cls) throw new Error(`${rel}: unknown class ${s.class}`);
        cls.subclasses.push(s.id);
      }
      for (const f of data.features ?? []) addFeature(f, f.class, f.subclass);
      for (const s of data.spells ?? []) {
        addUnique("spells", spells, {
          id: s.id, name: s.name, en: s.en, level: s.level, school: s.school, cast: SPELL_CAST(s.cast), range: s.range, dur: s.dur,
          conc: Boolean(s.conc), ritual: Boolean(s.ritual), comp: s.comp, mat: s.mat ?? null, desc: s.desc, higher: s.higher ?? null,
          classes: s.classes ?? [], subclasses: s.subclasses ?? [], attack: s.attack ?? null, dmg: s.dmg ?? null, heal: s.heal ?? null,
          save: s.save ?? null, aoe: s.aoe ? { ...s.aoe, name: AOE_RU[s.aoe.type] ?? s.aoe.type } : null, ...common(s),
        }, rel);
      }
      for (const t of data.traits ?? []) {
        addUnique("traits", traits, {
          id: t.id, name: t.name, en: t.en, desc: t.desc ?? [], profs: t.profs ?? [], profChoice: null, options: t.options ?? null,
          spellOptions: t.spellOptions ?? null, damageType: t.damageType ?? null, breath: t.breath ?? null, parent: t.parent ?? null, ...common(t),
        }, rel);
      }
      for (const r of data.races ?? []) {
        addUnique("races", races, {
          id: r.id, name: r.name, en: r.en, speed: r.speed ?? 30, size: r.size ?? "Средний", bonuses: r.bonuses ?? {}, bonusChoice: r.bonusChoice ?? null,
          languages: r.languages ?? ["common"], languageChoice: r.languageChoice ?? null, profs: r.profs ?? [], profChoice: null,
          traits: r.traits ?? [], subraces: [], age: "", alignment: "", sizeDesc: "", languageDesc: "", desc: r.desc ?? [], ...common(r),
        }, rel);
      }
      for (const s of data.subraces ?? []) {
        addUnique("subraces", subraces, {
          id: s.id, name: s.name, en: s.en, race: s.race, desc: (s.desc ?? []).join("\n"), bonuses: s.bonuses ?? {}, traits: s.traits ?? [],
          profs: s.profs ?? [], languageChoice: s.languageChoice ?? null, speed: s.speed ?? null,
          replaceBonuses: Boolean(s.replaceBonuses), removeTraits: s.removeTraits ?? [], ...common(s),
        }, rel);
      }
      for (const b of data.backgrounds ?? []) {
        addUnique("backgrounds", backgrounds, {
          id: b.id, name: b.name, en: b.en, profs: b.profs ?? [], languageChoice: b.languageChoice ?? null, equipment: b.equipment ?? [],
          gold: b.gold ?? 0, feature: b.feature, desc: b.desc ?? [], ...common(b),
        }, rel);
      }
      for (const f of data.feats ?? []) {
        addUnique("feats", feats, { id: f.id, name: f.name, en: f.en, prereq: f.prereq ?? [], prereqText: f.prereqText ?? null, desc: f.desc ?? [], ...common(f) }, rel);
      }
      for (const a of data.classSpells ?? []) {
        // expanded class spell lists (e.g. Tasha's): {class, spells: [...]}
        for (const id of a.spells) pending.push({ classSpell: a.class, id, rel });
      }
    }
  }
  // attach subraces to races and feature options to their parent choices
  for (const s of subraces) {
    const r = races.find((x) => x.id === s.race);
    if (!r) throw new Error(`subrace ${s.id}: unknown race ${s.race}`);
    if (!r.subraces.includes(s.id)) r.subraces.push(s.id);
  }
  for (const p of pending) {
    if (p.classSpell) {
      const sp = spells.find((x) => x.id === p.id);
      if (!sp) throw new Error(`${p.rel}: classSpells unknown spell ${p.id}`);
      if (!sp.classes.includes(p.classSpell)) sp.classes.push(p.classSpell);
      continue;
    }
    const parent = features.find((f) => f.id === p.target);
    if (!parent) throw new Error(`${p.rel}: addTo unknown feature ${p.target}`);
    if (parent.invocations) parent.invocations.push(p.id);
    else {
      parent.choice ??= { kind: "feature", n: 1, options: [] };
      parent.choice.options = [...(parent.choice.options ?? []), p.id];
    }
  }
  // references must resolve
  const ids = (list) => new Set(list.map((x) => x.id));
  const spellIds = ids(spells), traitIds = ids(traits);
  for (const s of subclasses) for (const x of s.spells) if (!spellIds.has(x.spell)) throw new Error(`subclass ${s.id}: unknown spell ${x.spell}`);
  for (const r of [...races, ...subraces]) for (const t of r.traits) if (!traitIds.has(t)) throw new Error(`${r.id}: unknown trait ${t}`);
}

const schools = Object.entries(SCHOOL_RU).map(([id, name]) => ({ id, name }));
const abilities = Object.entries(ABILITY).map(([id, [short, name]]) => ({ id, short, name }));

// ---- Beginner guide texts (data/guide, see docs/guide-content.md) ----
const GUIDE_DIR = join(ROOT, "data", "guide");
const guide = { classes: {}, subclasses: {}, races: {}, backgrounds: {}, glossary: [] };
if (existsSync(GUIDE_DIR)) {
  for (const file of readdirSync(GUIDE_DIR)) {
    const kind = file.replace(/\.(json|md)$/, "").split("-")[0];
    const text = readFileSync(join(GUIDE_DIR, file), "utf8");
    if (file === "glossary.md") {
      for (const m of text.matchAll(/^- \*\*(.+?)\*\* — (.+)$/gm)) guide.glossary.push({ term: m[1], text: m[2].trim() });
    } else if (file.endsWith(".json") && guide[kind] && !Array.isArray(guide[kind])) {
      Object.assign(guide[kind], JSON.parse(text));
    }
  }
}

// ---- Write ----
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "guide.json"), JSON.stringify(guide));
const out = {
  ref: { abilities, skills, conditions, languages, alignments, damageTypes, schools, proficiencies, weaponProps, categories, categoryItems },
  spells, features, classes, subclasses, races, subraces, traits, backgrounds, feats, equipment, magicItems,
};
for (const [name, data] of Object.entries(out)) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data));
}
const count = (a) => (Array.isArray(a) ? a.length : Object.keys(a).length);
console.log(Object.entries(out).map(([k, v]) => `${k}=${count(v)}`).join(" "));
console.log(`без перевода: ${untranslated}; записей из книг: ${bookCount}`);

// Types of the generated catalog (src/data/gen/*.json, built by tools/build-data.mjs)

import type { Effect } from "./effects";

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

/** `tr: false` = no Russian translation yet, text is the English SRD original */
interface Translated {
  tr: boolean;
  /** "srd" or a rulebook code (phb, xge, tce, scag, eepc, vgm, mtf) */
  source?: string;
  /** machine-readable rules (book content); absent = text only */
  effects?: Effect[];
  /** "book:page" where the entry is described */
  src?: string | null;
}

export interface SpellDamage {
  type: string | null;
  /** slot level -> dice, e.g. {"3": "8d6"} */
  slot: Record<string, string> | null;
  /** character level -> dice, cantrips */
  char: Record<string, string> | null;
}

export interface Spell extends Translated {
  id: string;
  name: string;
  en: string;
  level: number;
  school: string;
  cast: string;
  range: string;
  dur: string;
  conc: boolean;
  ritual: boolean;
  comp: string[];
  mat: string | null;
  desc: string[];
  higher: string[] | null;
  classes: string[];
  subclasses: string[];
  attack: "melee" | "ranged" | null;
  dmg: SpellDamage[] | null;
  heal: Record<string, string> | null;
  save: { ability: Ability; success: "half" | "none" | "other" } | null;
  aoe: { type: string; size: number; name: string } | null;
  src: string | null;
}

export interface FeatureChoice {
  kind: "feature" | "expertise" | "enemy" | "terrain";
  /** fixed count, or by class level: {"3": 3, "7": 5} */
  n: number | Record<string, number>;
  options?: (string | null)[];
}

export interface Feature extends Translated {
  id: string;
  name: string;
  en: string;
  class: string;
  subclass: string | null;
  level: number;
  parent: string | null;
  desc: string[];
  choice: FeatureChoice | null;
  invocations: string[] | null;
  /** optional class feature (Tasha's): the player turns it on */
  optional?: boolean;
  prereq: unknown[] | null;
  src: string | null;
}

export interface ClassLevel {
  level: number;
  prof: number;
  asi: number;
  features: string[];
  spell: { cantrips: number; known: number | null; slots: number[] } | null;
  cs: Record<string, any> | null;
}

export interface CharClass {
  id: string;
  name: string;
  en: string;
  hitDie: number;
  saves: Ability[];
  profs: string[];
  skillChoice: { n: number; from: string[] } | null;
  casting: {
    ability: Ability;
    level: number;
    /** multiclass caster level: full, half (paladin), halfUp (artificer, rounded up) */
    progression?: "full" | "half" | "halfUp";
    /** prepared spells = mod + level / half level (rounded down) / half level (rounded up) */
    prepared?: "level" | "half" | "halfUp" | null;
  } | null;
  multiclass: { ability: Ability; min: number; any?: boolean }[];
  /** proficiencies gained when this class is taken as a second+ class */
  multiProfs: string[];
  multiSkill: number;
  startEquip: { id: string; qty: number }[];
  subclasses: string[];
  levels: ClassLevel[];
  source?: string;
  src?: string | null;
  desc?: string[];
}

export interface Subclass extends Translated {
  id: string;
  name: string;
  en: string;
  class: string;
  flavor: string;
  desc: string[];
  levels: { level: number; features: string[]; cs: Record<string, any> | null }[];
  spells: { spell: string; level: number }[];
  /** "always" = always prepared (domains, oaths); "expanded" = added to the class list (warlock patrons) */
  spellMode?: "always" | "expanded";
  /** subclass spellcasting (Eldritch Knight, Arcane Trickster): tables by class level */
  casting?: {
    ability: Ability;
    list: string;
    cantrips: Record<string, number>;
    known: Record<string, number>;
    slots: Record<string, number[]>;
  } | null;
}

export interface Race extends Translated {
  id: string;
  name: string;
  en: string;
  speed: number;
  size: string;
  bonuses: Partial<Record<Ability, number>>;
  bonusChoice: { n: number; from: Ability[]; bonus: number } | null;
  languages: string[];
  languageChoice: { n: number } | null;
  profs: string[];
  profChoice: { n: number; from: string[] } | null;
  traits: string[];
  subraces: string[];
  age: string;
  alignment: string;
  sizeDesc: string;
  languageDesc: string;
  desc?: string[];
}

export interface Subrace extends Translated {
  id: string;
  name: string;
  en: string;
  race: string;
  desc: string;
  bonuses: Partial<Record<Ability, number>>;
  traits: string[];
  profs: string[];
  languageChoice: { n: number } | null;
  /** walking speed replacing the race's (wood elf 35) */
  speed?: number | null;
  /** the race's ability bonuses don't apply (variant human) */
  replaceBonuses?: boolean;
}

export interface Trait extends Translated {
  id: string;
  name: string;
  en: string;
  desc: string[];
  profs: string[];
  profChoice: { n: number; from: string[] } | null;
  options: string[] | null;
  spellOptions: string[] | null;
  damageType: string | null;
  breath: { area: { type: string; size: number }; save: Ability | null; dmg: Record<string, string> | null; type: string | null } | null;
  parent: string | null;
}

export interface Background extends Translated {
  id: string;
  name: string;
  en: string;
  profs: string[];
  languageChoice: { n: number } | null;
  equipment: { id: string; qty: number }[];
  gold: number;
  feature: { name: string; desc: string[] };
}

export interface Feat extends Translated {
  id: string;
  name: string;
  en: string;
  prereq: { ability: Ability; min: number }[];
  prereqText?: string | null;
  desc: string[];
}

export interface WeaponData {
  cat: "simple" | "martial";
  range: "melee" | "ranged";
  dice: string | null;
  type: string | null;
  twoHanded: string | null;
  props: string[];
  normal: number;
  long: number | null;
  thrown: { normal: number; long: number } | null;
}

export interface ArmorData {
  cat: "light" | "medium" | "heavy" | "shield";
  base: number;
  dex: boolean;
  max: number | null;
  str: number;
  stealth: boolean;
}

export interface Equipment extends Translated {
  id: string;
  name: string;
  en: string;
  cat: string;
  sub: string | null;
  weapon: WeaponData | null;
  armor: ArmorData | null;
  weight: number;
  cost: { q: number; u: string } | null;
  desc: string[] | null;
  contents: { id: string; qty: number }[] | null;
}

export interface MagicItem extends Translated {
  id: string;
  name: string;
  en: string;
  cat: string;
  rarity: string;
  rarityName: string;
  minLevel: number;
  attune: boolean;
  variant: boolean;
  variants: string[];
  desc: string[];
  src: string | null;
}

export interface RefData {
  abilities: { id: Ability; short: string; name: string }[];
  skills: { id: string; name: string; en: string; ability: Ability; desc: string[] }[];
  conditions: { id: string; name: string; en: string; desc: string[] }[];
  languages: { id: string; name: string; en: string; type: string }[];
  alignments: { id: string; name: string }[];
  damageTypes: { id: string; name: string; instr: string; en: string }[];
  schools: { id: string; name: string }[];
  proficiencies: Record<string, { name: string; type: string; ref: string | null }>;
  weaponProps: Record<string, { name: string; desc: string[] }>;
  categories: Record<string, string>;
}

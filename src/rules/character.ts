import type { Ability } from "./types";

export interface ClassEntry {
  classId: string;
  subclassId: string | null;
  level: number;
  /** Rolled hit die results indexed by class level - 1 (the first class's level 1 is always max). Missing = average. */
  hpRolls: (number | null)[];
}

/** An ASI slot is identified as "<classId>:<classLevel>" */
export type AsiChoice =
  | { kind: "asi"; abilities: Partial<Record<Ability, number>> }
  | { kind: "feat"; featId: string };

export interface InvItem {
  uid: string;
  /** base equipment (longsword, chain-mail, ...) */
  baseId: string | null;
  /** magic item (weapon-1, ring-of-protection, ...) */
  magicId: string | null;
  /** free-form item the player added */
  custom: { name: string; desc?: string; weight?: number } | null;
  qty: number;
  equipped: boolean;
  attuned: boolean;
  /** weapon held in two hands (versatile) */
  twoHanded?: boolean;
  /** off-hand weapon for two-weapon fighting */
  offHand?: boolean;
  notes?: string;
}

export interface KnownSpell {
  id: string;
  /** class whose list/ability it is cast with */
  classId: string;
  prepared: boolean;
  /** always prepared (domain spells etc.) */
  always?: boolean;
}

export interface RollLogEntry {
  at: number;
  label: string;
  text: string;
  total: number;
}

export interface Character {
  v: 1;
  id: string;
  name: string;
  player: string;
  createdAt: number;
  updatedAt: number;

  raceId: string;
  subraceId: string | null;
  backgroundId: string | null;
  alignment: string | null;

  /** scores before racial bonuses and ASIs */
  base: Record<Ability, number>;
  /** chosen abilities for races with a choice (half-elf: two of them get +1) */
  raceBonusChoice: Ability[];

  classes: ClassEntry[];
  hpMethod: "average" | "rolled";
  asi: Record<string, AsiChoice>;

  /** skill ids the character is proficient in by choice (class / race / background picks) */
  skills: string[];
  /** skill ids or "thieves-tools" with doubled proficiency */
  expertise: string[];
  /** extra proficiency ids (tools, instruments, languages chosen) */
  extraProfs: string[];
  languages: string[];

  /** chosen sub-options: featureId|traitId -> option ids (fighting style, draconic ancestry, invocations, ...) */
  choices: Record<string, string[]>;

  spells: KnownSpell[];
  inventory: InvItem[];
  money: { cp: number; sp: number; ep: number; gp: number; pp: number };

  hp: { current: number; temp: number; maxOverride: number | null };
  hitDiceUsed: Record<string, number>; // die size -> used
  deathSaves: { ok: number; fail: number };
  slotsUsed: number[]; // 9 levels
  pactUsed: number;
  /** used counts of limited resources: rage, ki, channel-divinity, ... */
  used: Record<string, number>;
  conditions: string[];
  exhaustion: number;
  concentration: string | null;
  inspiration: boolean;
  /** temporary toggles that change math: raging, etc. */
  toggles: Record<string, boolean>;

  notes: string;
  log: RollLogEntry[];

  /** picture chosen by the player (small JPEG data URL); null = class emblem */
  portrait?: string | null;
  appearance?: { age?: string; height?: string; weight?: string; eyes?: string; hair?: string; skin?: string };
  story?: { personality?: string; ideals?: string; bonds?: string; flaws?: string; history?: string };
  /** finished the creation wizard */
  created?: boolean;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function blankCharacter(): Character {
  const now = Date.now();
  return {
    v: 1,
    id: newId(),
    name: "",
    player: "",
    createdAt: now,
    updatedAt: now,
    raceId: "human",
    subraceId: null,
    backgroundId: null,
    alignment: null,
    base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    raceBonusChoice: [],
    classes: [{ classId: "fighter", subclassId: null, level: 1, hpRolls: [] }],
    hpMethod: "average",
    asi: {},
    skills: [],
    expertise: [],
    extraProfs: [],
    languages: [],
    choices: {},
    spells: [],
    inventory: [],
    money: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    hp: { current: 0, temp: 0, maxOverride: null },
    hitDiceUsed: {},
    deathSaves: { ok: 0, fail: 0 },
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactUsed: 0,
    used: {},
    conditions: [],
    exhaustion: 0,
    concentration: null,
    inspiration: false,
    toggles: {},
    notes: "",
    log: [],
  };
}

export const totalLevel = (c: Character) => c.classes.reduce((s, e) => s + e.level, 0);

/** Standard array and point-buy costs, PHB chapter 1 "Determine Ability Scores" */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

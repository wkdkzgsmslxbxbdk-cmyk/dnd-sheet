// Machine-readable effects of features, traits, feats and backgrounds from the
// rulebooks (data/books). Each owner (feature / trait / feat) lists Effect objects;
// derive.ts applies them. Numbers are expressions over the character:
//   prof, level (character level), clevel (level in the owner's class),
//   mod.str..mod.cha, score.str..score.cha, slot (spell slot level, spells only)
// with + - * /, comparisons (>= > <= < return 1 or 0) and max/min/floor/ceil.
// Anything an effect can't express stays as rules text — the app never guesses.

import type { Ability } from "./types";

export type Expr = number | string;

export type Effect = (
  | { k: "prof"; ids: string[] }
  | { k: "skillChoice"; n: number; from?: string[] }
  | { k: "expertiseChoice"; n: number; from?: string[] }
  | { k: "toolChoice"; n: number; from?: string[] }
  | { k: "languageChoice"; n: number }
  | { k: "ability"; ability: Ability; value: number; max?: number }
  | { k: "abilityChoice"; n: number; value: number; from?: Ability[]; max?: number; saveProf?: boolean }
  | { k: "saveProf"; abilities: Ability[] }
  | { k: "ac"; value: Expr; armor?: "any" | "none" | "armored" }
  | { k: "acBase"; base: Expr; abilities: Ability[]; shield: boolean; label: string }
  | { k: "speed"; value: Expr; mode?: "walk" | "fly" | "swim" | "climb" | "burrow"; set?: boolean; armor?: "any" | "none" | "notHeavy" }
  | { k: "hp"; perLevel?: Expr; flat?: Expr }
  | { k: "save"; value: Expr; abilities?: Ability[] }
  | { k: "check"; value: Expr; abilities?: Ability[]; skills?: string[] }
  | { k: "initiative"; value: Expr }
  | { k: "spellDc"; value: Expr; classId?: string }
  | { k: "spellAttack"; value: Expr; classId?: string }
  | { k: "cantripDamage"; value: Expr; classId?: string }
  | { k: "spellDamage"; value: Expr; classId?: string; school?: string; spells?: string[]; damageType?: string; note?: string }
  | { k: "healBonus"; value: Expr; minLevel?: number }
  | { k: "weaponAttack"; value: Expr; range?: "melee" | "ranged" }
  | { k: "weaponDamage"; value: Expr; range?: "melee" | "ranged" }
  | { k: "weaponExtra"; dice: string; type: string; note: string; range?: "melee" | "ranged" }
  | { k: "attackAbility"; ability: Ability; note: string }
  | { k: "critFrom"; value: number }
  | { k: "resource"; id: string; name: string; max: Expr; reset: "short" | "long"; die?: string | Record<string, string>; note?: string }
  | { k: "toggle"; id: string; name: string }
  | { k: "resist"; types: string[] }
  | { k: "sense"; name: string; range: number }
  | {
      k: "spells";
      spells: { spell: string; level?: number }[];
      ability?: Ability;
      note?: string;
      mode?: "known" | "always";
      /** how leveled spells are cast: once per long rest without a slot (default), only as rituals, or with your slots */
      uses?: "longRest" | "ritual" | "slots";
    }
  | { k: "dc"; name: string; value: Expr }
  | { k: "featChoice"; n: number }
) & {
  /** only while this toggle is on (e.g. "bladesong", "rage") */
  when?: string;
};

export interface EffectOwner {
  id: string;
  name: string;
  /** class whose level is `clevel`; for race/feat/background effects clevel = level */
  classId?: string;
  effects: Effect[];
}

/** choice storage key in Character.choices */
export const choiceKey = (ownerId: string, index: number) => `${ownerId}#${index}`;

export const CHOICE_KINDS = new Set(["skillChoice", "expertiseChoice", "toolChoice", "languageChoice", "abilityChoice", "featChoice"]);

/** Resolve a count that may depend on class level: 3 or {"3": 3, "7": 5} */
export function countAt(n: number | Record<string, number> | undefined, clevel: number): number {
  if (n == null) return 0;
  if (typeof n === "number") return n;
  const keys = Object.keys(n).map(Number).filter((k) => k <= clevel).sort((a, b) => b - a);
  return keys.length ? n[String(keys[0])] : 0;
}

// ---------------- expression evaluator ----------------

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([a-z_][a-z_.]*)|(>=|<=|[-+*/(),<>]))/gy;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) {
      if (/^\s*$/.test(s.slice(pos))) break;
      throw new Error(`Bad expression "${s}" at ${pos}`);
    }
    if (m[1]) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2]) out.push({ t: "id", v: m[2] });
    else if (m[3]) out.push({ t: "op", v: m[3] });
    pos = re.lastIndex;
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  max: Math.max, min: Math.min, floor: Math.floor, ceil: Math.ceil,
};

export function evalExpr(e: Expr, vars: Record<string, number>): number {
  if (typeof e === "number") return e;
  const toks = tokenize(e);
  let i = 0;
  const peek = () => toks[i];
  const take = (v?: string) => {
    const t = toks[i++];
    if (!t || (v && t.v !== v)) throw new Error(`Bad expression "${e}"`);
    return t;
  };
  const primary = (): number => {
    const t = take();
    if (t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") {
      const v = cmp();
      take(")");
      return v;
    }
    if (t.t === "op" && t.v === "-") return -primary();
    if (t.t === "id") {
      if (FUNCS[t.v] && peek()?.v === "(") {
        take("(");
        const args = [cmp()];
        while (peek()?.v === ",") {
          take(",");
          args.push(cmp());
        }
        take(")");
        return FUNCS[t.v](...args);
      }
      if (!(t.v in vars)) throw new Error(`Unknown variable "${t.v}" in "${e}"`);
      return vars[t.v];
    }
    throw new Error(`Bad expression "${e}"`);
  };
  const term = (): number => {
    let v = primary();
    while (peek()?.v === "*" || peek()?.v === "/") v = take().v === "*" ? v * primary() : v / primary();
    return v;
  };
  const sum = (): number => {
    let v = term();
    while (peek()?.v === "+" || peek()?.v === "-") v = take().v === "+" ? v + term() : v - term();
    return v;
  };
  const cmp = (): number => {
    const a = sum();
    const op = peek()?.v;
    if (op === ">=" || op === "<=" || op === ">" || op === "<") {
      take();
      const b = sum();
      return Number(op === ">=" ? a >= b : op === "<=" ? a <= b : op === ">" ? a > b : a < b);
    }
    return a;
  };
  const v = cmp();
  if (i !== toks.length) throw new Error(`Bad expression "${e}"`);
  return v;
}

/** Validate an expression without a character (used by tests / data checks) */
export function checkExpr(e: Expr): string | null {
  const vars: Record<string, number> = { prof: 2, level: 1, clevel: 1, slot: 1 };
  for (const a of ["str", "dex", "con", "int", "wis", "cha"]) {
    vars[`mod.${a}`] = 0;
    vars[`score.${a}`] = 10;
  }
  try {
    evalExpr(e, vars);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

/** Die that changes with class level: {"3":"d8","10":"d10"} -> "d10" at 12 */
export function dieAt(die: string | Record<string, string> | undefined, clevel: number): string | undefined {
  if (!die || typeof die === "string") return die;
  const keys = Object.keys(die).map(Number).filter((k) => k <= clevel).sort((a, b) => b - a);
  return keys.length ? die[String(keys[0])] : undefined;
}

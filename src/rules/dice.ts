// Dice expressions: parse "2d6 + 3" / "2к6+3" / "1d8 + MOD", format in Russian
// notation ("2к6 + 3"), compute averages and roll.

export interface DiceTerm {
  n: number;
  d: number;
}

export interface DiceExpr {
  dice: DiceTerm[];
  flat: number;
}

export type Rng = () => number; // [0, 1)

export const EMPTY: DiceExpr = { dice: [], flat: 0 };

/** Parse "2d6 + 1d4 + 3", "к20", "1d8 + MOD" (vars: { MOD: 3 }). Throws on garbage. */
export function parseDice(input: string, vars: Record<string, number> = {}): DiceExpr {
  const s = input.replace(/\s+/g, "").replace(/[кК]/g, "d").replace(/−/g, "-");
  if (!s) return { dice: [], flat: 0 };
  const expr: DiceExpr = { dice: [], flat: 0 };
  const re = /([+-]?)(?:(\d*)d(\d+)|(\d+)|([A-Za-z_]+))/gy;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || m[0] === "") throw new Error(`Не понимаю выражение кубов: "${input}"`);
    const sign = m[1] === "-" ? -1 : 1;
    if (m[3]) {
      const n = m[2] === "" ? 1 : Number(m[2]);
      expr.dice.push({ n: sign * n, d: Number(m[3]) });
    } else if (m[4]) {
      expr.flat += sign * Number(m[4]);
    } else if (m[5]) {
      if (!(m[5] in vars)) throw new Error(`Неизвестная переменная "${m[5]}" в "${input}"`);
      expr.flat += sign * vars[m[5]];
    }
    pos = re.lastIndex;
  }
  return normalize(expr);
}

/** Merge equal dice, drop zeros, sort big dice first. */
export function normalize(expr: DiceExpr): DiceExpr {
  const byD = new Map<number, number>();
  for (const t of expr.dice) byD.set(t.d, (byD.get(t.d) ?? 0) + t.n);
  const dice = [...byD.entries()].filter(([, n]) => n !== 0).map(([d, n]) => ({ n, d })).sort((a, b) => b.d - a.d);
  return { dice, flat: expr.flat };
}

export function add(...exprs: DiceExpr[]): DiceExpr {
  return normalize({ dice: exprs.flatMap((e) => e.dice), flat: exprs.reduce((s, e) => s + e.flat, 0) });
}

export function scale(expr: DiceExpr, k: number): DiceExpr {
  return { dice: expr.dice.map((t) => ({ n: t.n * k, d: t.d })), flat: expr.flat * k };
}

export function dice(n: number, d: number): DiceExpr {
  return { dice: n ? [{ n, d }] : [], flat: 0 };
}

export function flat(v: number): DiceExpr {
  return { dice: [], flat: v };
}

/** "2к6 + 3", "1к20 − 1", "5" */
export function formatDice(expr: DiceExpr): string {
  const parts: string[] = [];
  for (const t of expr.dice) {
    const abs = Math.abs(t.n);
    const term = `${abs}к${t.d}`;
    if (parts.length === 0) parts.push(t.n < 0 ? `−${term}` : term);
    else parts.push(t.n < 0 ? `− ${term}` : `+ ${term}`);
  }
  if (expr.flat !== 0 || parts.length === 0) {
    const abs = Math.abs(expr.flat);
    if (parts.length === 0) parts.push(expr.flat < 0 ? `−${abs}` : `${abs}`);
    else parts.push(expr.flat < 0 ? `− ${abs}` : `+ ${abs}`);
  }
  return parts.join(" ");
}

export function formatMod(v: number): string {
  return v >= 0 ? `+${v}` : `−${Math.abs(v)}`;
}

export function average(expr: DiceExpr): number {
  return expr.dice.reduce((s, t) => s + (t.n * (t.d + 1)) / 2, 0) + expr.flat;
}

export function minimum(expr: DiceExpr): number {
  return expr.dice.reduce((s, t) => s + (t.n > 0 ? t.n : t.n * t.d), 0) + expr.flat;
}

export function maximum(expr: DiceExpr): number {
  return expr.dice.reduce((s, t) => s + (t.n > 0 ? t.n * t.d : t.n), 0) + expr.flat;
}

export const defaultRng: Rng = () => {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }
  return Math.random();
};

export function rollDie(d: number, rng: Rng = defaultRng): number {
  return 1 + Math.floor(rng() * d);
}

export interface RolledTerm {
  d: number;
  sign: 1 | -1;
  rolls: number[];
}

export interface ExprRoll {
  terms: RolledTerm[];
  flat: number;
  total: number;
}

/** Roll an expression. `crit` doubles the number of dice (PHB: "roll all of the attack's damage dice twice"). */
export function rollExpr(expr: DiceExpr, opts: { crit?: boolean; rng?: Rng; maxDice?: boolean } = {}): ExprRoll {
  const rng = opts.rng ?? defaultRng;
  const terms: RolledTerm[] = expr.dice.map((t) => {
    const count = Math.abs(t.n) * (opts.crit ? 2 : 1);
    const rolls = Array.from({ length: count }, () => (opts.maxDice ? t.d : rollDie(t.d, rng)));
    return { d: t.d, sign: t.n < 0 ? -1 : 1, rolls };
  });
  const total = terms.reduce((s, t) => s + t.sign * t.rolls.reduce((a, b) => a + b, 0), 0) + expr.flat;
  return { terms, flat: expr.flat, total };
}

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface D20Roll {
  rolls: number[]; // 1 or 2 d20 results
  kept: number;
  bonus: number;
  total: number;
  mode: RollMode;
  crit: boolean; // natural roll within crit range
  fumble: boolean; // natural 1
}

/** d20 test. critFrom: 20 normally, 19 for Improved Critical, 18 for Superior Critical. */
export function rollD20(bonus: number, mode: RollMode = "normal", opts: { rng?: Rng; critFrom?: number } = {}): D20Roll {
  const rng = opts.rng ?? defaultRng;
  const a = rollDie(20, rng);
  const rolls = mode === "normal" ? [a] : [a, rollDie(20, rng)];
  const kept = mode === "advantage" ? Math.max(...rolls) : mode === "disadvantage" ? Math.min(...rolls) : a;
  return {
    rolls, kept, bonus, total: kept + bonus, mode,
    crit: kept >= (opts.critFrom ?? 20),
    fumble: kept === 1,
  };
}

/** Probability that a d20 + bonus meets or beats `target` (natural 20 always hits, natural 1 always misses for attacks). */
export function hitChance(bonus: number, target: number, mode: RollMode = "normal", attack = true): number {
  let p = 0;
  for (let r = 1; r <= 20; r++) {
    const ok = attack ? (r === 20 ? true : r === 1 ? false : r + bonus >= target) : r + bonus >= target;
    if (ok) p++;
  }
  const single = p / 20;
  if (mode === "advantage") return 1 - (1 - single) ** 2;
  if (mode === "disadvantage") return single ** 2;
  return single;
}

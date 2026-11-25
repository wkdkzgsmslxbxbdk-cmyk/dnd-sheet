// Rolling helpers: turn a Calc (bonus with parts) or dice expression into a
// RollResult in the store, so every roll shows where its numbers came from.

import { useStore, type RollPart } from "../state/store";
import type { Calc } from "../rules/derive";
import { formatDice, rollD20, rollExpr, type DiceExpr, type ExprRoll } from "../rules/dice";

const MODE_RU = { normal: "", advantage: "преимущество", disadvantage: "помеха" } as const;

function exprDiceText(r: ExprRoll): string {
  return r.terms.map((t) => `${t.sign < 0 ? "−" : ""}${t.rolls.length}к${t.d}: ${t.rolls.join(", ")}`).join(" · ");
}

export function rollCheck(
  label: string,
  bonus: Calc,
  opts: { critFrom?: number; onHit?: { label: string; run: (crit: boolean) => void }; note?: string } = {},
) {
  const st = useStore.getState();
  const mode = st.rollMode;
  const r = rollD20(bonus.value, mode, { critFrom: opts.critFrom });
  const parts: RollPart[] = [{ label: mode === "normal" ? "к20" : `к20 (${MODE_RU[mode]}: ${r.rolls.join(" и ")})`, value: r.kept }, ...bonus.parts];
  // with advantage/disadvantage the other die is shown dropped
  const keptIdx = r.rolls.indexOf(r.kept);
  st.pushRoll({
    label,
    faces: r.rolls.map((v, i) => ({ d: 20, v, dropped: r.rolls.length > 1 && i !== keptIdx })),
    dice: `к20: ${r.rolls.join(", ")}${mode !== "normal" ? ` → ${r.kept}` : ""}`,
    parts,
    total: r.total,
    crit: r.crit,
    fumble: r.fumble,
    note: opts.note,
    followUp: opts.onHit,
  });
  return r;
}

export function rollDamage(label: string, expr: DiceExpr, opts: { crit?: boolean; partsText?: string[]; note?: string; maxDice?: boolean } = {}) {
  const r = rollExpr(expr, { crit: opts.crit, maxDice: opts.maxDice });
  const parts: RollPart[] = r.terms.map((t) => ({ label: `${t.rolls.length}к${t.d}${opts.crit ? " (крит, кубы ×2)" : ""}`, value: t.sign * t.rolls.reduce((a, b) => a + b, 0) }));
  if (r.flat) parts.push({ label: opts.partsText?.slice(1).join(" ") || "Модификаторы", value: r.flat });
  useStore.getState().pushRoll({
    label,
    faces: r.terms.flatMap((t) => t.rolls.map((v) => ({ d: t.d, v, negative: t.sign < 0 }))),
    dice: exprDiceText(r) || formatDice(expr),
    parts,
    total: r.total,
    crit: opts.crit,
    note: opts.note,
  });
  return r;
}

export function rollFree(expr: DiceExpr, label?: string) {
  return rollDamage(label ?? formatDice(expr), expr);
}

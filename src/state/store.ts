import { create } from "zustand";
import { persist } from "zustand/middleware";
import { blankCharacter, newId, type Character } from "../rules/character";
import type { RollMode } from "../rules/dice";

export interface RollPart {
  label: string;
  value: number | string;
}

export interface DieFace {
  d: number;
  v: number;
  /** the lower/higher d20 that advantage/disadvantage discards */
  dropped?: boolean;
  negative?: boolean;
}

export interface RollResult {
  id: string;
  at: number;
  label: string;
  /** individual dice for the animation */
  faces?: DieFace[];
  /** "к20: 14", "2к6: 3, 5" */
  dice: string;
  parts: RollPart[];
  total: number;
  crit?: boolean;
  fumble?: boolean;
  note?: string;
  /** follow-up roll offered after an attack hit (damage) */
  followUp?: { label: string; run: (crit: boolean) => void };
}

interface State {
  chars: Record<string, Character>;
  currentId: string | null;
  rollMode: RollMode;
  lastRoll: RollResult | null;
  history: RollResult[];
  seenHints: Record<string, boolean>;
  /** dice animation on/off (also skipped when the OS asks for reduced motion) */
  animateDice: boolean;
  setAnimateDice: (v: boolean) => void;

  createCharacter: () => string;
  select: (id: string | null) => void;
  update: (id: string, mut: (c: Character) => void) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => string;
  importCharacter: (c: Character) => string;
  setRollMode: (m: RollMode) => void;
  pushRoll: (r: Omit<RollResult, "id" | "at">) => void;
  clearRoll: () => void;
  markHint: (id: string) => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      chars: {},
      currentId: null,
      rollMode: "normal",
      lastRoll: null,
      history: [],
      seenHints: {},
      animateDice: true,
      setAnimateDice: (animateDice) => set({ animateDice }),

      createCharacter: () => {
        const c = blankCharacter();
        c.name = "Новый персонаж";
        c.created = false; // opens the step-by-step wizard
        c.backgroundId = "soldier"; // the PHB Quick Build background for the default class (fighter)
        set((s) => ({ chars: { ...s.chars, [c.id]: c }, currentId: c.id }));
        return c.id;
      },
      select: (id) => set({ currentId: id }),
      update: (id, mut) => {
        const cur = get().chars[id];
        if (!cur) return;
        const next = structuredClone(cur);
        mut(next);
        next.updatedAt = Date.now();
        set((s) => ({ chars: { ...s.chars, [id]: next } }));
      },
      remove: (id) =>
        set((s) => {
          const chars = { ...s.chars };
          delete chars[id];
          return { chars, currentId: s.currentId === id ? null : s.currentId };
        }),
      duplicate: (id) => {
        const src = get().chars[id];
        const c = structuredClone(src);
        c.id = newId();
        c.name = `${src.name} (копия)`;
        c.createdAt = c.updatedAt = Date.now();
        set((s) => ({ chars: { ...s.chars, [c.id]: c } }));
        return c.id;
      },
      importCharacter: (raw) => {
        const c = { ...blankCharacter(), ...raw, id: newId(), updatedAt: Date.now() };
        set((s) => ({ chars: { ...s.chars, [c.id]: c } }));
        return c.id;
      },
      setRollMode: (rollMode) => set({ rollMode }),
      pushRoll: (r) => {
        const full: RollResult = { ...r, id: newId(), at: Date.now() };
        set((s) => ({ lastRoll: full, history: [full, ...s.history].slice(0, 100), rollMode: "normal" }));
      },
      clearRoll: () => set({ lastRoll: null }),
      markHint: (id) => set((s) => ({ seenHints: { ...s.seenHints, [id]: true } })),
    }),
    {
      name: "dnd-sheet-v1",
      partialize: (s) => ({
        chars: s.chars,
        currentId: s.currentId,
        seenHints: s.seenHints,
        animateDice: s.animateDice,
        history: s.history.map(({ followUp: _f, ...rest }) => rest),
      }),
    },
  ),
);

export function useCurrent(): Character | null {
  return useStore((s) => (s.currentId ? s.chars[s.currentId] ?? null : null));
}

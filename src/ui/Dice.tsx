// Dice roll animation: each die tumbles in with its faces flickering, then lands on
// the real result (already decided by the roll — the animation never changes it).
import { useEffect, useRef, useState } from "react";
import type { DieFace } from "../state/store";

const ROLL_MS = 700;
const STAGGER_MS = 45;
const MAX_SHOWN = 12;

/** Outline of each die as an SVG path in a 100x100 box */
const SHAPES: Record<number, { outline: string; inner?: string }> = {
  4: { outline: "M50 6 L95 88 L5 88 Z", inner: "M50 6 L50 88" },
  6: { outline: "M14 14 H86 V86 H14 Z" },
  8: { outline: "M50 3 L94 50 L50 97 L6 50 Z", inner: "M6 50 H94" },
  10: { outline: "M50 3 L94 42 L50 97 L6 42 Z", inner: "M6 42 L50 58 L94 42 M50 58 V97" },
  12: { outline: "M50 3 L95 36 L78 92 H22 L5 36 Z", inner: "M50 22 L72 40 L64 68 H36 L28 40 Z" },
  20: { outline: "M50 2 L93 26 V74 L50 98 L7 74 V26 Z", inner: "M50 2 L50 22 M50 22 L78 66 H22 Z M93 26 L78 66 M7 26 L22 66 M50 98 L22 66 M50 98 L78 66 M7 74 L22 66 M93 74 L78 66" },
};

function shapeFor(d: number) {
  return SHAPES[d] ?? SHAPES[d === 100 ? 10 : d === 2 ? 6 : 20];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function Die({ face, rolling, delay, tone }: { face: DieFace; rolling: boolean; delay: number; tone?: "crit" | "fumble" }) {
  const [shown, setShown] = useState(face.v);
  useEffect(() => {
    if (!rolling) {
      setShown(face.v);
      return;
    }
    const id = window.setInterval(() => setShown(1 + Math.floor(Math.random() * face.d)), 55);
    return () => window.clearInterval(id);
  }, [rolling, face.d, face.v]);
  const shape = shapeFor(face.d);
  const cls = ["die", rolling ? "rolling" : "landed", face.dropped ? "dropped" : "", tone ?? ""].join(" ");
  return (
    <div className={cls} style={{ animationDelay: `${delay}ms` }} aria-label={`к${face.d}: ${face.v}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d={shape.outline} className="die-body" />
        {shape.inner && <path d={shape.inner} className="die-edge" />}
        <text x="50" y={face.d === 4 ? 70 : 56} className="die-num" fontSize={shown >= 10 ? 30 : 36}>
          {shown}
        </text>
      </svg>
      <span className="die-label">{face.negative ? "−" : ""}к{face.d}</span>
    </div>
  );
}

/**
 * Shows the dice of a roll. `animate=false` renders the results at once.
 * Calls onLanded when every die has landed (immediately without animation).
 */
export function DiceRow({ faces, animate, crit, fumble, onLanded }: {
  faces: DieFace[];
  animate: boolean;
  crit?: boolean;
  fumble?: boolean;
  onLanded?: () => void;
}) {
  const shown = faces.slice(0, MAX_SHOWN);
  const [rolling, setRolling] = useState(animate);
  const landed = useRef(onLanded);
  landed.current = onLanded;
  useEffect(() => {
    if (!animate) {
      setRolling(false);
      landed.current?.();
      return;
    }
    setRolling(true);
    const t = window.setTimeout(() => {
      setRolling(false);
      landed.current?.();
      if (navigator.vibrate) navigator.vibrate(crit || fumble ? [20, 40, 20] : 12);
    }, ROLL_MS + STAGGER_MS * (shown.length - 1));
    return () => window.clearTimeout(t);
    // faces identity changes on every new roll
  }, [faces, animate]); // eslint-disable-line react-hooks/exhaustive-deps
  const d20 = faces.length <= 2 && faces.every((f) => f.d === 20);
  return (
    <div className="dice-row">
      {shown.map((f, i) => (
        <Die
          key={i}
          face={f}
          rolling={rolling}
          delay={i * STAGGER_MS}
          tone={!rolling && d20 && !f.dropped ? (crit ? "crit" : fumble ? "fumble" : undefined) : undefined}
        />
      ))}
      {faces.length > MAX_SHOWN && <span className="faint">+{faces.length - MAX_SHOWN}</span>}
    </div>
  );
}

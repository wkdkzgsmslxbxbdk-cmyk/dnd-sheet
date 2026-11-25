import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Calc } from "../rules/derive";
import { formatMod } from "../rules/dice";
import { useStore } from "../state/store";

/** Bottom sheet modal */
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="grabber" />
        {title && (
          <div className="head" style={{ marginBottom: 10 }}>
            <h2>{title}</h2>
            <button className="ghost small" onClick={onClose} aria-label="Закрыть">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Lines "label ... value" with a total line */
export function Breakdown({ calc, totalLabel = "Итого", signed = false }: { calc: Calc; totalLabel?: string; signed?: boolean }) {
  return (
    <div className="breakdown">
      {calc.parts.map((p, i) => (
        <div className="ln" key={i}>
          <span>{p.label}</span>
          <b>{i === 0 && !signed ? p.value : formatMod(p.value)}</b>
        </div>
      ))}
      <div className="ln sum">
        <span>{totalLabel}</span>
        <b>{signed ? formatMod(calc.value) : calc.value}</b>
      </div>
    </div>
  );
}

/** Tap = action (roll), long press / right click = explain. */
export function usePress(onTap: () => void, onLong: () => void) {
  const timer = useRef<number | null>(null);
  const long = useRef(false);
  const start = () => {
    long.current = false;
    timer.current = window.setTimeout(() => {
      long.current = true;
      onLong();
      if (navigator.vibrate) navigator.vibrate(15);
    }, 450);
  };
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cancel();
      if (!long.current) onLong();
      long.current = true;
    },
    onClick: () => {
      if (long.current) {
        long.current = false;
        return;
      }
      onTap();
    },
  };
}

/** Explanation sheet state shared by a screen */
export function useExplain() {
  const [explain, setExplain] = useState<{ title: string; calc: Calc; signed?: boolean; note?: ReactNode } | null>(null);
  const node = (
    <Sheet open={!!explain} onClose={() => setExplain(null)} title={explain?.title}>
      {explain && (
        <>
          <Breakdown calc={explain.calc} signed={explain.signed} />
          {explain.note && <div style={{ marginTop: 10 }} className="faint">{explain.note}</div>}
        </>
      )}
    </Sheet>
  );
  return { setExplain, node };
}

/** Render SRD-style text: paragraphs, markdown tables, ***bold***, ### headings, "- " lists */
export function RulesText({ paras }: { paras: string[] | string | null | undefined }) {
  if (!paras) return null;
  const list = Array.isArray(paras) ? paras : [paras];
  const blocks: ReactNode[] = [];
  let table: string[][] = [];
  let bullets: string[] = [];
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
    blocks.push(
      <table key={`t${blocks.length}`}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (i === 0 ? <th key={j}>{inline(c)}</th> : <td key={j}>{inline(c)}</td>))}</tr>
          ))}
        </tbody>
      </table>,
    );
    table = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(<ul key={`u${blocks.length}`}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
    bullets = [];
  };
  for (const para of list) {
    for (const line of para.split("\n")) {
      const t = line.trim();
      if (t.startsWith("|")) {
        flushBullets();
        table.push(t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        continue;
      }
      flushTable();
      if (/^[-•*] /.test(t)) {
        bullets.push(t.slice(2));
        continue;
      }
      flushBullets();
      if (!t) continue;
      if (t.startsWith("#")) blocks.push(<h4 key={blocks.length}>{inline(t.replace(/^#+\s*/, ""))}</h4>);
      else blocks.push(<p key={blocks.length}>{inline(t)}</p>);
    }
  }
  flushTable();
  flushBullets();
  return <div className="rules">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<b key={out.length}><i>{m[1]}</i></b>);
    else if (m[2]) out.push(<b key={out.length}>{m[2]}</b>);
    else out.push(<i key={out.length}>{m[3] ?? m[4]}</i>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** One-time hint banner */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const seen = useStore((s) => s.seenHints[id]);
  const mark = useStore((s) => s.markHint);
  if (seen) return null;
  return (
    <div className="info-box row">
      <span className="grow">{children}</span>
      <button className="ghost small" onClick={() => mark(id)}>Понятно</button>
    </div>
  );
}

export function Counter({ value, min = 0, max, onChange }: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, max != null ? Math.min(max, v) : v);
  return (
    <div className="row" style={{ gap: 4 }}>
      <button className="small" onClick={() => onChange(clamp(value - 1))}>−</button>
      <span style={{ minWidth: 28, textAlign: "center", fontWeight: 600 }}>{value}</span>
      <button className="small" onClick={() => onChange(clamp(value + 1))}>+</button>
    </div>
  );
}

/** Russian plural: plural(3, ["луч", "луча", "лучей"]) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function srcLabel(src: string | null | undefined): string | null {
  if (!src) return null;
  const [book, page] = src.split(":");
  const names: Record<string, string> = { phb: "Книга игрока", dmg: "Руководство мастера", xge: "Занатар", tce: "Таша" };
  return `${names[book] ?? book}, стр. PDF ${page}`;
}

export function UntranslatedBadge({ tr }: { tr: boolean }) {
  return tr ? null : <span className="pill warn">нет перевода</span>;
}

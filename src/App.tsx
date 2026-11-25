import { useMemo, useRef, useState } from "react";
import { useCurrent, useStore } from "./state/store";
import { derive } from "./rules/derive";
import { catalog } from "./data/catalog";
import { totalLevel, type Character } from "./rules/character";
import { formatMod, parseDice } from "./rules/dice";
import { Sheet as Modal } from "./ui/common";
import { rollFree } from "./ui/roll";
import { DiceRow, prefersReducedMotion } from "./ui/Dice";
import { MainTab } from "./ui/tabs/MainTab";
import { CombatTab } from "./ui/tabs/CombatTab";
import { MagicTab } from "./ui/tabs/MagicTab";
import { ItemsTab } from "./ui/tabs/ItemsTab";
import { FeaturesTab } from "./ui/tabs/FeaturesTab";
import { Editor } from "./ui/Editor";

type Tab = "main" | "combat" | "magic" | "items" | "features";
const TABS: { id: Tab; label: string; ic: string }[] = [
  { id: "main", label: "Лист", ic: "◈" },
  { id: "combat", label: "Бой", ic: "⚔" },
  { id: "magic", label: "Магия", ic: "✦" },
  { id: "items", label: "Вещи", ic: "▣" },
  { id: "features", label: "Умения", ic: "❖" },
];

export function classLine(c: Character) {
  return c.classes
    .map((e) => {
      const cls = catalog.classes[e.classId];
      const sub = e.subclassId ? catalog.subclasses[e.subclassId] : null;
      return `${cls?.name ?? e.classId} ${e.level}${sub ? ` (${sub.name})` : ""}`;
    })
    .join(" / ");
}

export default function App() {
  const c = useCurrent();
  return (
    <div className="app">
      {c ? <CharacterView c={c} /> : <CharacterList />}
      <RollToast />
    </div>
  );
}

function CharacterList() {
  const chars = useStore((s) => s.chars);
  const create = useStore((s) => s.createCharacter);
  const select = useStore((s) => s.select);
  const importCharacter = useStore((s) => s.importCharacter);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const list = Object.values(chars).sort((a, b) => b.updatedAt - a.updatedAt);

  const onImport = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.v !== 1 || !Array.isArray(data.classes)) throw new Error();
      select(importCharacter(data));
      setError(null);
    } catch {
      setError("Это не файл персонажа из этого приложения.");
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="title"><b>Персонажи</b><span>D&D 5e (2014), SRD 5.1</span></div>
      </div>
      <div className="content">
        {list.length === 0 && (
          <div className="empty">
            <h2 style={{ marginBottom: 8 }}>Создайте первого персонажа</h2>
            <div>Расы, классы, заклинания и снаряжение уже внутри. Числа считаются сами.</div>
          </div>
        )}
        {list.map((ch) => (
          <button key={ch.id} className="card" style={{ textAlign: "left" }} onClick={() => select(ch.id)}>
            <b>{ch.name || "Без имени"}</b>
            <div className="muted" style={{ fontSize: 13 }}>
              {catalog.races[ch.raceId]?.name} · {classLine(ch)} · ур. {totalLevel(ch)}
            </div>
          </button>
        ))}
        <button className="primary" onClick={() => create()}>+ Новый персонаж</button>
        <button onClick={() => fileRef.current?.click()}>Импорт из файла</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        {error && <div className="bad-box">{error}</div>}
        <div className="faint" style={{ textAlign: "center" }}>
          Данные хранятся только на этом устройстве. Для переноса используйте экспорт в меню персонажа.
        </div>
        <div className="faint" style={{ textAlign: "center", fontSize: 11 }}>
          Включает материалы System Reference Document 5.1 («SRD 5.1») от Wizards of the Coast LLC, доступного по лицензии Creative Commons Attribution 4.0
          (creativecommons.org/licenses/by/4.0). Перевод на русский выполнен для этого приложения. Данные SRD — проект 5e-bits/5e-database (MIT).
        </div>
      </div>
    </>
  );
}

function CharacterView({ c }: { c: Character }) {
  const [tab, setTab] = useState<Tab>("main");
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(c.classes.length === 1 && c.name === "Новый персонаж" && c.updatedAt === c.createdAt);
  const [diceOpen, setDiceOpen] = useState(false);
  const select = useStore((s) => s.select);
  const mode = useStore((s) => s.rollMode);
  const setMode = useStore((s) => s.setRollMode);
  const sheet = useMemo(() => derive(c), [c]);

  if (edit) return <Editor c={c} onDone={() => setEdit(false)} />;

  return (
    <>
      <div className="topbar">
        <button className="ghost small" onClick={() => select(null)} aria-label="К списку">‹</button>
        <div className="title">
          <b>{c.name || "Без имени"}</b>
          <span>{catalog.races[c.raceId]?.name} · {classLine(c)}</span>
        </div>
        <button
          className={`small mode-btn ${mode}`}
          title="Следующий бросок к20: обычный → с преимуществом → с помехой"
          onClick={() => setMode(mode === "normal" ? "advantage" : mode === "advantage" ? "disadvantage" : "normal")}
        >
          {mode === "normal" ? "к20 обычно" : mode === "advantage" ? "▲ Преимущество" : "▼ Помеха"}
        </button>
        <button className="ghost small" onClick={() => setDiceOpen(true)} aria-label="Кубы">🎲</button>
        <button className="ghost small" onClick={() => setMenu(true)} aria-label="Меню">⋮</button>
      </div>
      <div className="content">
        {tab === "main" && <MainTab c={c} sheet={sheet} />}
        {tab === "combat" && <CombatTab c={c} sheet={sheet} />}
        {tab === "magic" && <MagicTab c={c} sheet={sheet} />}
        {tab === "items" && <ItemsTab c={c} sheet={sheet} />}
        {tab === "features" && <FeaturesTab c={c} sheet={sheet} />}
      </div>
      <nav className="bottomnav">
        <div className="inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <span className="ic">{t.ic}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <CharacterMenu c={c} open={menu} onClose={() => setMenu(false)} onEdit={() => { setMenu(false); setEdit(true); }} />
      <DiceTray open={diceOpen} onClose={() => setDiceOpen(false)} />
    </>
  );
}

function CharacterMenu({ c, open, onClose, onEdit }: { c: Character; open: boolean; onClose: () => void; onEdit: () => void }) {
  const remove = useStore((s) => s.remove);
  const duplicate = useStore((s) => s.duplicate);
  const select = useStore((s) => s.select);
  const [confirm, setConfirm] = useState(false);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(c, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${c.name || "персонаж"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Modal open={open} onClose={() => { setConfirm(false); onClose(); }} title="Персонаж">
      <div className="list">
        <button className="li tap ghost" onClick={onEdit}>✎ Редактировать: раса, классы, характеристики, уровень</button>
        <button className="li tap ghost" onClick={exportJson}>⇩ Экспорт в файл</button>
        <button className="li tap ghost" onClick={() => { select(duplicate(c.id)); onClose(); }}>⧉ Создать копию</button>
        {!confirm ? (
          <button className="li tap ghost danger" onClick={() => setConfirm(true)}>✕ Удалить персонажа</button>
        ) : (
          <div className="bad-box row">
            <span className="grow">Удалить «{c.name}» без возможности восстановления?</span>
            <button className="small danger" onClick={() => { remove(c.id); onClose(); }}>Удалить</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DiceTray({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const history = useStore((s) => s.history);
  const animateDice = useStore((s) => s.animateDice);
  const setAnimateDice = useStore((s) => s.setAnimateDice);
  const roll = (s: string) => {
    try {
      rollFree(parseDice(s));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Кубы">
      <div className="grid4" style={{ marginBottom: 10 }}>
        {[4, 6, 8, 10, 12, 20, 100].map((d) => (
          <button key={d} onClick={() => roll(`1d${d}`)}>к{d}</button>
        ))}
        <button onClick={() => roll("4d6")}>4к6</button>
      </div>
      <div className="row">
        <input value={expr} placeholder="2к6 + 3" onChange={(e) => { setExpr(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && roll(expr)} />
        <button className="primary" onClick={() => roll(expr)}>Бросить</button>
      </div>
      {err && <div className="bad-box" style={{ marginTop: 8 }}>{err}</div>}
      <label className="row" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={animateDice} onChange={(e) => setAnimateDice(e.target.checked)} /> Анимация бросков
      </label>
      <h3 style={{ margin: "14px 0 6px" }}>История</h3>
      <div className="list">
        {history.length === 0 && <div className="faint">Пока пусто</div>}
        {history.slice(0, 30).map((r) => (
          <div className="li" key={r.id}>
            <span className="grow">
              {r.label}
              <div className="faint">{r.dice}</div>
            </span>
            <span className="val" style={{ color: r.crit ? "var(--good)" : r.fumble ? "var(--bad)" : undefined }}>{r.total}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function RollToast() {
  const r = useStore((s) => s.lastRoll);
  const clear = useStore((s) => s.clearRoll);
  const animateDice = useStore((s) => s.animateDice);
  const [landedId, setLandedId] = useState<string | null>(null);
  if (!r) return null;
  const animate = animateDice && !prefersReducedMotion() && Boolean(r.faces?.length);
  const landed = !animate || landedId === r.id;
  const isDamage = /урон|лечение|хиты/i.test(r.label);
  return (
    <div className="roll" onClick={clear}>
      <div className="box" onClick={(e) => e.stopPropagation()} role="status" aria-live="polite">
        <div className="row">
          <div className="grow">
            <b>{r.label}</b>
            <div className="faint">{r.dice}</div>
          </div>
          <div className={`total${r.crit ? " crit" : r.fumble ? " fumble" : ""}${landed ? "" : " counting"}`}>{landed ? r.total : "…"}</div>
        </div>
        {r.faces?.length ? (
          <DiceRow key={r.id} faces={r.faces} animate={animate} crit={r.crit && !isDamage} fumble={r.fumble} onLanded={() => setLandedId(r.id)} />
        ) : null}
        {landed && r.crit && <div className="pill good" style={{ marginTop: 4 }}>{isDamage ? "Критический урон: кубы удвоены" : "Критическое попадание!"}</div>}
        {landed && r.fumble && <div className="pill bad" style={{ marginTop: 4 }}>Естественная 1</div>}
        <div className="breakdown" style={{ marginTop: 6 }}>
          {r.parts.map((p, i) => (
            <div className="ln" key={i}>
              <span>{p.label}</span>
              <b>{typeof p.value === "number" ? (i === 0 ? p.value : formatMod(p.value)) : p.value}</b>
            </div>
          ))}
        </div>
        {r.note && <div className="faint" style={{ marginTop: 4 }}>{r.note}</div>}
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
          {r.followUp && landed && (
            <button className="primary small" onClick={() => r.followUp!.run(Boolean(r.crit))}>
              {r.followUp.label}{r.crit ? " (крит)" : ""}
            </button>
          )}
          <button className="small" onClick={clear}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

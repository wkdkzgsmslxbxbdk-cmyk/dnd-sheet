// Step-by-step character creation for people who have never played.
// One decision per screen, cards with plain-language summaries, a "what you get"
// sheet for every option, and a one-tap "recommended" path from the books' Quick Build.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { newId, STANDARD_ARRAY, type Character } from "../rules/character";
import { derive, mod, type Sheet } from "../rules/derive";
import { ABILITIES, type Ability, type CharClass, type Race, type StartItem } from "../rules/types";
import { catalog } from "../data/catalog";
import { DIFFICULTY_RU, guide } from "../data/guide";
import { formatMod, parseDice, rollExpr } from "../rules/dice";
import { CHOICE_KINDS, choiceKey, countAt } from "../rules/effects";
import { useStore } from "../state/store";
import { Counter, Sheet as Modal, RulesText, srcLabel } from "./common";
import { Avatar, CLASS_HUE, CLASS_ICON, RACE_ICON, imageToPortrait } from "./Avatar";
import { subclassLevel } from "./Editor";
import { bookLabel, EffectChoices } from "./tabs/FeaturesTab";
import { SpellBrowser } from "./tabs/MagicTab";
import { IconUserCircle } from "@tabler/icons-react";

const SHORT: Record<Ability, string> = { str: "СИЛ", dex: "ЛОВ", con: "ТЕЛ", int: "ИНТ", wis: "МДР", cha: "ХАР" };
const FULL: Record<Ability, string> = { str: "Сила", dex: "Ловкость", con: "Телосложение", int: "Интеллект", wis: "Мудрость", cha: "Харизма" };
/** what each ability is for, in one line (plain-language summary of the PHB chapter on abilities) */
const ABILITY_WHAT: Record<Ability, string> = {
  str: "Удары тяжёлым оружием, атлетика, переноска груза",
  dex: "Лёгкое и дальнобойное оружие, КД в лёгком доспехе, скрытность, инициатива",
  con: "Хиты на каждом уровне и стойкость к ядам, усталости, сбитой концентрации",
  int: "Знания, расследование, магия волшебника и изобретателя",
  wis: "Внимательность, чутьё, магия жреца, друида и следопыта",
  cha: "Убеждение, обман, магия барда, чародея, колдуна и паладина",
};
const ALIGN_WHAT: Record<string, string> = {
  "lawful-good": "Поступает правильно и по правилам",
  "neutral-good": "Помогает другим, как может",
  "chaotic-good": "Добро важнее законов",
  "lawful-neutral": "Закон, традиция или кодекс превыше всего",
  neutral: "Держится в стороне от крайностей",
  "chaotic-neutral": "Ценит свободу и свои прихоти",
  "lawful-evil": "Берёт своё, но в рамках порядка",
  "neutral-evil": "Делает, что хочет, без жалости",
  "chaotic-evil": "Жестокость и произвол",
};

type StepId = "class" | "subclass" | "race" | "subrace" | "abilities" | "background" | "skills" | "choices" | "spells" | "gear" | "look" | "done";

export function Wizard({ c, onDone, onAdvanced, onExit }: { c: Character; onDone: () => void; onAdvanced: () => void; onExit: () => void }) {
  const update = useStore((s) => s.update);
  const upd = (f: (x: Character) => void) => update(c.id, f);
  const sheet = useMemo(() => derive(c), [c]);
  const [stepIdx, setStepIdx] = useState(0);
  const [glossary, setGlossary] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const gearTake = useRef<(() => void) | null>(null);
  const skillAuto = useRef<(() => void) | null>(null);

  const e0 = c.classes[0];
  const cls = catalog.classes[e0.classId];
  const race = catalog.races[c.raceId];
  const level = e0.level;

  const pendingChoices = countPending(c, sheet);
  // once the "special choices" step has appeared it stays, so finishing the last pick doesn't yank the screen away
  const [hadChoices, setHadChoices] = useState(false);
  if (pendingChoices > 0 && !hadChoices) setHadChoices(true);
  const steps: { id: StepId; title: string; lead: string }[] = [
    { id: "class", title: "Кем вы хотите играть?", lead: "Класс — это профессия героя: как он сражается и чем полезен команде." },
    ...(level >= subclassLevel(e0.classId) ? [{ id: "subclass" as StepId, title: "Специализация", lead: `На ${subclassLevel(e0.classId)} уровне класс выбирает направление: ${catalog.subclasses[cls.subclasses[0]]?.flavor?.toLowerCase() ?? "подкласс"}.` }] : []),
    { id: "race", title: "Раса", lead: "Народ, к которому принадлежит герой. Даёт прибавки к характеристикам и врождённые способности." },
    ...(race?.subraces.length ? [{ id: "subrace" as StepId, title: `${race.name}: разновидность`, lead: "Уточните, к какой ветви народа принадлежит герой." }] : []),
    { id: "abilities", title: "Характеристики", lead: "Шесть чисел, от которых зависят все броски. Проще всего — расставить по совету для вашего класса." },
    { id: "background", title: "Предыстория", lead: "Кем герой был до приключений. Даёт навыки и полезную особенность." },
    { id: "skills", title: "Навыки", lead: "В чём герой особенно хорош. К броску такого навыка прибавляется бонус мастерства." },
    ...(pendingChoices > 0 || hadChoices ? [{ id: "choices" as StepId, title: "Особые выборы", lead: "Раса, класс или предыстория предлагают выбрать ещё кое-что." }] : []),
    ...(cls.casting && level >= cls.casting.level ? [{ id: "spells" as StepId, title: "Заклинания", lead: "Можно взять рекомендованные — потом их легко поменять." }] : []),
    { id: "gear", title: "Снаряжение", lead: "Стартовый набор класса и предыстории. Его можно дополнить позже." },
    { id: "look", title: "Внешность и имя", lead: "Всё на этом шаге необязательно, но помогает вжиться в роль." },
    { id: "done", title: "Готово!", lead: "Проверьте итог. Всё можно поменять потом в меню ⋮ → Редактировать." },
  ];
  const idx = Math.min(stepIdx, steps.length - 1);
  const step = steps[idx];
  const go = (d: number) => {
    setStepIdx(Math.max(0, Math.min(steps.length - 1, idx + d)));
    top.current?.scrollIntoView({ block: "start" });
    window.scrollTo(0, 0);
  };
  const finish = () => {
    upd((x) => {
      x.created = true;
      x.hp.current = sheet.hpMax.value;
      if (!x.name.trim() || x.name === "Новый персонаж") x.name = `${race?.name ?? ""} ${cls.name}`.trim();
    });
    onDone();
  };

  return (
    <div className="wiz" ref={top}>
      <div className="topbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="row">
          <button className="ghost small" onClick={onExit} aria-label="Выйти из мастера">✕</button>
          <div className="title">
            <b>Новый персонаж</b>
            <span>Шаг {idx + 1} из {steps.length}</span>
          </div>
          <button className="ghost small" onClick={() => setGlossary(true)}>Словарь</button>
        </div>
        <div className="wiz-progress"><div style={{ width: `${((idx + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <div className="content" style={{ paddingBottom: 110 }}>
        <div>
          <h1 className="wiz-step-title">{step.title}</h1>
          <p className="wiz-lead">{step.lead}</p>
        </div>
        {step.id === "class" && <ClassStep c={c} upd={upd} />}
        {step.id === "subclass" && <SubclassStep c={c} upd={upd} />}
        {step.id === "race" && <RaceStep c={c} upd={upd} />}
        {step.id === "subrace" && <SubraceStep c={c} upd={upd} />}
        {step.id === "abilities" && <AbilityStep c={c} upd={upd} sheet={sheet} />}
        {step.id === "background" && <BackgroundStep c={c} upd={upd} />}
        {step.id === "skills" && <SkillStep c={c} upd={upd} sheet={sheet} autoRef={skillAuto} />}
        {step.id === "choices" && <ChoicesStep c={c} upd={upd} sheet={sheet} />}
        {step.id === "spells" && <SpellStep c={c} upd={upd} sheet={sheet} />}
        {step.id === "gear" && <GearStep c={c} upd={upd} sheet={sheet} takeRef={gearTake} />}
        {step.id === "look" && <LookStep c={c} upd={upd} />}
        {step.id === "done" && <SummaryStep c={c} sheet={sheet} />}
        {idx === 0 && (
          <button className="ghost small" style={{ alignSelf: "center" }} onClick={onAdvanced}>
            Я знаю правила — открыть обычный редактор
          </button>
        )}
      </div>
      <div className="wiz-footer">
        <div className="inner">
          {idx > 0 && <button onClick={() => go(-1)}>Назад</button>}
          <div className="preview">
            {cls.name} {level} · {race?.name} · хиты {sheet.hpMax.value} · КД {sheet.ac.value}
          </div>
          {step.id === "done" ? (
            <button className="primary" onClick={finish}>Начать играть</button>
          ) : step.id === "gear" && c.inventory.length === 0 ? (
            <>
              <button className="ghost small" onClick={() => go(1)}>Без вещей</button>
              <button className="primary" onClick={() => { gearTake.current?.(); go(1); }}>Взять и дальше</button>
            </>
          ) : step.id === "choices" && pendingChoices > 0 ? (
            <button onClick={() => go(1)}>Пропустить</button>
          ) : (
            <button className="primary" onClick={() => { if (step.id === "skills") skillAuto.current?.(); go(1); }}>Далее</button>
          )}
        </div>
      </div>
      <Modal open={glossary} onClose={() => setGlossary(false)} title="Словарь">
        {guide.glossary.length ? (
          <div className="list">
            {guide.glossary.map((g) => (
              <div className="li" key={g.term} style={{ display: "block" }}>
                <b>{g.term}</b> — <span className="muted">{g.text}</span>
              </div>
            ))}
          </div>
        ) : <div className="faint">Словарь пока пуст.</div>}
      </Modal>
    </div>
  );
}

type StepProps = { c: Character; upd: (f: (x: Character) => void) => void; sheet?: Sheet };

/** How many choices (features with options, effect choices, trait options) are still open */
function countPending(c: Character, sheet: Sheet): number {
  let n = 0;
  for (const { feature, classId } of sheet.features) {
    if (feature.choice?.kind === "feature" && feature.choice.options?.length) {
      const need = countAt(feature.choice.n, c.classes.find((e) => e.classId === classId)?.level ?? 1);
      n += Math.max(0, need - (c.choices[feature.id] ?? []).length);
    }
  }
  for (const o of sheet.owners)
    o.effects.forEach((e, i) => {
      if (CHOICE_KINDS.has(e.k)) n += Math.max(0, (e as { n: number }).n - (c.choices[choiceKey(o.id, i)] ?? []).length);
    });
  for (const t of sheet.traits) if ((t.options || t.spellOptions || t.profChoice) && !(c.choices[t.id] ?? []).length) n++;
  n += Math.max(0, raceLanguageBudget(c, sheet) - c.languages.length);
  return n;
}

/** SRD race / subrace language picks (human, half-elf, high elf "Extra Language") */
function raceLanguageBudget(c: Character, sheet: Sheet): number {
  const race = catalog.races[c.raceId];
  const sub = c.subraceId ? catalog.subraces[c.subraceId] : null;
  return (race?.languageChoice?.n ?? 0) + (sub?.languageChoice?.n ?? 0) + (sheet.traits.some((t) => t.id === "extra-language") ? 1 : 0);
}

// ---------- shared card ----------
function Choice({ on, icon, hue, name, tagline, chips, onPick, onInfo, badge }: {
  on: boolean; icon?: ReactNode; hue?: number; name: string; tagline?: string; chips?: ReactNode[]; badge?: ReactNode; onPick: () => void; onInfo?: () => void;
}) {
  return (
    <button className={`choice${on ? " on" : ""}`} onClick={onPick} aria-pressed={on}>
      {icon && <span className="choice-icon" style={hue != null ? ({ ["--h" as string]: hue } as React.CSSProperties) : undefined}>{icon}</span>}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="row" style={{ gap: 6, alignItems: "baseline" }}>
          <span className="nm grow">{name}</span>
          {badge}
        </span>
        {tagline && <span className="tg" style={{ display: "block" }}>{tagline}</span>}
        {chips && chips.length > 0 && <span className="chips" style={{ display: "flex" }}>{chips}</span>}
      </span>
      {onInfo && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Подробнее: ${name}`}
          className="pill"
          style={{ alignSelf: "center" }}
          onClick={(e) => { e.stopPropagation(); onInfo(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onInfo(); } }}
        >
          ⓘ
        </span>
      )}
    </button>
  );
}
const pill = (text: string, kind = "", key?: string) => <span key={key ?? text} className={`pill ${kind}`}>{text}</span>;

// ---------- class ----------
function classTimeline(k: CharClass) {
  const subLv = subclassLevel(k.id);
  const flavor = catalog.subclasses[k.subclasses[0]]?.flavor ?? "подкласс";
  // levels at which any subclass of this class gains features
  const subLevels = new Set(k.subclasses.flatMap((s) => catalog.subclasses[s]?.levels.map((l) => l.level) ?? []));
  let prevSpellLevel = 0;
  return k.levels.map((l) => {
    const names = l.features
      .map((f) => catalog.features[f])
      .filter((f) => f && !f.parent)
      .map((f) => (/ability-score-improvement/.test(f!.id) ? "Характеристики или черта" : f!.name))
      // pointers like "Path feature" and the subclass name itself are replaced by the markers below
      .filter((n) => !/^Умение /.test(n) && n.toLowerCase() !== flavor.toLowerCase());
    if (l.level === subLv) names.unshift(`Выбор: ${flavor.toLowerCase()}`);
    else if (subLevels.has(l.level) && l.level > subLv) names.push(`умение: ${flavor.toLowerCase()}`);
    const spellLevel = l.spell ? l.spell.slots.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0) : 0;
    if (spellLevel > prevSpellLevel && l.level > 1) names.push(`заклинания ${spellLevel} уровня`);
    prevSpellLevel = Math.max(prevSpellLevel, spellLevel);
    return { level: l.level, text: [...new Set(names)].join(" · ") || "больше хитов", sub: l.level === subLv };
  });
}

function ClassInfo({ k, onPick, picked }: { k: CharClass; onPick: () => void; picked: boolean }) {
  const g = guide.classes[k.id];
  const tl = classTimeline(k);
  return (
    <>
      {g?.about && <RulesText paras={g.about} />}
      <div className="chips" style={{ margin: "6px 0" }}>
        {g?.difficulty && pill(`Сложность: ${DIFFICULTY_RU[g.difficulty]}`)}
        {g?.primary && pill(`Главное: ${g.primary.map((a) => SHORT[a]).join(", ")}`, "accent")}
        {pill(`Кость Хитов к${k.hitDie}`)}
        {k.casting && pill("Заклинатель")}
      </div>
      {g?.roles?.length ? <div className="faint">Совет: роль в команде — {g.roles.join(", ")}.</div> : null}
      <h3 style={{ margin: "12px 0 4px" }}>Путь до 20 уровня</h3>
      <div className="timeline">
        {tl.map((l) => (
          <div key={l.level} className={`lvl${l.sub ? " sub" : ""}`}><b>{l.level}</b><span>{l.text || "—"}</span></div>
        ))}
      </div>
      <button className="primary" style={{ width: "100%", marginTop: 12 }} onClick={onPick}>{picked ? "Выбрано" : `Выбрать: ${k.name}`}</button>
    </>
  );
}

function ClassStep({ c, upd }: StepProps) {
  const [info, setInfo] = useState<CharClass | null>(null);
  const e0 = c.classes[0];
  const pick = (id: string) =>
    upd((x) => {
      if (x.classes[0].classId === id) return;
      // keep a background the player chose; otherwise follow the new class's book recommendation
      const prevRec = guide.classes[x.classes[0].classId]?.quickBuild?.background;
      if (!x.backgroundId || x.backgroundId === prevRec) x.backgroundId = guide.classes[id]?.quickBuild?.background ?? x.backgroundId;
      x.classes = [{ classId: id, subclassId: null, level: x.classes[0].level, hpRolls: [] }];
      x.spells = [];
      x.skills = [];
      x.choices = Object.fromEntries(Object.entries(x.choices).filter(([k]) => !catalog.features[k] && !k.startsWith("optional:")));
    });
  const list = [...catalog.classList].sort((a, b) => (guide.classes[a.id]?.difficulty ?? 2) - (guide.classes[b.id]?.difficulty ?? 2) || a.name.localeCompare(b.name, "ru"));
  return (
    <>
      <div className="card row">
        <span className="grow">
          Уровень персонажа
          <div className="faint">Первая игра — оставьте 1. Мастер скажет, если нужно выше.</div>
        </span>
        <Counter value={e0.level} min={1} max={20} onChange={(v) => upd((x) => (x.classes[0].level = v))} />
      </div>
      {list.map((k) => {
        const g = guide.classes[k.id];
        const Icon = CLASS_ICON[k.id] ?? IconUserCircle;
        return (
          <Choice
            key={k.id}
            on={e0.classId === k.id}
            icon={<Icon size={22} />}
            hue={CLASS_HUE[k.id]}
            name={k.name}
            tagline={g?.tagline}
            badge={g?.difficulty === 1 ? pill("для новичка", "good") : undefined}
            chips={[
              ...(g?.primary ? [pill(g.primary.map((a) => SHORT[a]).join(" / "), "accent", "p")] : []),
              ...(g?.roles ?? []).slice(0, 2).map((r) => pill(r, "", r)),
              ...(k.source && k.source !== "srd" && k.source !== "phb" ? [pill(bookLabel(k.source), "", "src")] : []),
            ]}
            onPick={() => pick(k.id)}
            onInfo={() => setInfo(k)}
          />
        );
      })}
      {info && (
        <Modal open onClose={() => setInfo(null)} title={info.name}>
          <ClassInfo k={info} picked={e0.classId === info.id} onPick={() => { pick(info.id); setInfo(null); }} />
        </Modal>
      )}
    </>
  );
}

function SubclassStep({ c, upd }: StepProps) {
  const [info, setInfo] = useState<string | null>(null);
  const e0 = c.classes[0];
  const k = catalog.classes[e0.classId];
  const pick = (id: string) => upd((x) => (x.classes[0].subclassId = id));
  const subs = k.subclasses.map((s) => catalog.subclasses[s]).filter(Boolean);
  return (
    <>
      {subs.map((s) => {
        const g = guide.subclasses[s.id];
        return (
          <Choice
            key={s.id}
            on={e0.subclassId === s.id}
            name={s.name}
            tagline={g?.tagline}
            chips={[...(g?.roles ?? []).slice(0, 2).map((r) => pill(r, "", r)), pill(bookLabel(s.source), "", "src")]}
            badge={g?.difficulty === 1 ? pill("просто", "good") : undefined}
            onPick={() => pick(s.id)}
            onInfo={() => setInfo(s.id)}
          />
        );
      })}
      {info && (() => {
        const s = catalog.subclasses[info];
        const g = guide.subclasses[info];
        return (
          <Modal open onClose={() => setInfo(null)} title={s.name}>
            {g?.about ? <RulesText paras={g.about} /> : <RulesText paras={s.desc} />}
            <h3 style={{ margin: "12px 0 4px" }}>Умения по уровням</h3>
            <div className="timeline">
              {s.levels.map((l) => (
                <div key={l.level} className="lvl">
                  <b>{l.level}</b>
                  <span>{l.features.map((f) => catalog.features[f]?.name).filter(Boolean).join(" · ")}</span>
                </div>
              ))}
            </div>
            <div className="faint" style={{ marginTop: 6 }}>{srcLabel(s.src as string | undefined)}</div>
            <button className="primary" style={{ width: "100%", marginTop: 12 }} onClick={() => { pick(info); setInfo(null); }}>Выбрать</button>
          </Modal>
        );
      })()}
    </>
  );
}

// ---------- race ----------
function raceChips(r: Race | null, bonuses: Partial<Record<Ability, number>>, traitIds: string[], speed: number) {
  const chips: ReactNode[] = Object.entries(bonuses).filter(([, v]) => v).map(([a, v]) => pill(`${SHORT[a as Ability]} +${v}`, "accent", a));
  if (r?.bonusChoice) chips.push(pill(`+${r.bonusChoice.bonus} к ${r.bonusChoice.n} на выбор`, "accent", "choice"));
  chips.push(pill(`${speed} фт`, "", "speed"));
  const traits = traitIds.map((t) => catalog.traits[t]).filter(Boolean);
  if (traits.some((t) => /darkvision/.test(t.id) || t.effects?.some((e) => e.k === "sense"))) chips.push(pill("Тёмное зрение", "", "dv"));
  for (const t of traits) for (const e of t.effects ?? []) if (e.k === "speed" && e.mode && e.mode !== "walk") chips.push(pill(e.mode === "fly" ? "Полёт" : e.mode === "swim" ? "Плавание" : "Лазание", "", `m${e.mode}`));
  return chips;
}

/** races whose bonuses hit the class's main abilities */
function fitsClass(bonuses: Partial<Record<Ability, number>>, classId: string, choice?: Race["bonusChoice"]) {
  const primary = guide.classes[classId]?.primary ?? [];
  return Boolean(choice) || primary.some((a) => (bonuses[a] ?? 0) > 0);
}

function TraitList({ ids }: { ids: string[] }) {
  return (
    <div className="list">
      {ids.map((id) => catalog.traits[id]).filter(Boolean).map((t) => (
        <details key={t.id} className="li" style={{ display: "block" }}>
          <summary><b>{t.name}</b>{t.effects?.length ? <span className="pill good" style={{ marginLeft: 6 }}>учтено в листе</span> : null}</summary>
          <RulesText paras={t.desc} />
        </details>
      ))}
    </div>
  );
}

function RaceStep({ c, upd }: StepProps) {
  const [info, setInfo] = useState<Race | null>(null);
  const classId = c.classes[0].classId;
  const pick = (id: string) =>
    upd((x) => {
      if (x.raceId === id) return;
      x.raceId = id;
      x.subraceId = catalog.races[id].subraces.find((s) => catalog.subraces[s]?.source === "srd") ?? catalog.races[id].subraces[0] ?? null;
      x.raceBonusChoice = [];
    });
  const list = [...catalog.raceList].sort((a, b) => Number(b.source === "srd" || b.source === "phb") - Number(a.source === "srd" || a.source === "phb") || a.name.localeCompare(b.name, "ru"));
  return (
    <>
      <div className="faint">Отметка «подходит» — раса даёт прибавку к главной характеристике вашего класса. Это не обязательно: играть можно кем угодно.</div>
      {list.map((r) => {
        const g = guide.races[r.id];
        const Icon = RACE_ICON[r.id] ?? IconUserCircle;
        return (
          <Choice
            key={r.id}
            on={c.raceId === r.id}
            icon={<Icon size={22} />}
            name={r.name}
            tagline={g?.tagline}
            badge={fitsClass(r.bonuses, classId, r.bonusChoice) ? pill("подходит", "good") : undefined}
            chips={[...raceChips(r, r.bonuses, r.traits, r.speed), ...(r.subraces.length ? [pill(`${r.subraces.length} разновидн.`, "", "sub")] : []), ...(r.source && r.source !== "srd" && r.source !== "phb" ? [pill(bookLabel(r.source), "", "src")] : [])]}
            onPick={() => pick(r.id)}
            onInfo={() => setInfo(r)}
          />
        );
      })}
      {info && (
        <Modal open onClose={() => setInfo(null)} title={info.name}>
          {guide.races[info.id]?.about && <RulesText paras={guide.races[info.id].about} />}
          <div className="chips" style={{ margin: "6px 0" }}>{raceChips(info, info.bonuses, info.traits, info.speed)}</div>
          <TraitList ids={info.traits} />
          {info.subraces.length > 0 && <div className="faint" style={{ marginTop: 6 }}>Разновидность выберете на следующем шаге.</div>}
          <button className="primary" style={{ width: "100%", marginTop: 12 }} onClick={() => { pick(info.id); setInfo(null); }}>Выбрать: {info.name}</button>
        </Modal>
      )}
    </>
  );
}

function SubraceStep({ c, upd }: StepProps) {
  const [info, setInfo] = useState<string | null>(null);
  const race = catalog.races[c.raceId];
  const classId = c.classes[0].classId;
  const hasDefault = race.subraces.some((s) => catalog.subraces[s]?.source === "srd");
  const options = [...(hasDefault ? [] : [null]), ...race.subraces];
  const bonusesOf = (sid: string | null) => {
    const s = sid ? catalog.subraces[sid] : null;
    return { ...(s?.replaceBonuses ? {} : race.bonuses), ...(s?.bonuses ?? {}) } as Partial<Record<Ability, number>>;
  };
  const traitsOf = (sid: string | null) => {
    const s = sid ? catalog.subraces[sid] : null;
    const removed = new Set(s?.removeTraits ?? []);
    return [...race.traits.filter((t) => !removed.has(t)), ...(s?.traits ?? [])];
  };
  return (
    <>
      {options.map((sid) => {
        const s = sid ? catalog.subraces[sid] : null;
        const g = sid ? guide.races[sid] : guide.races[race.id];
        const b = bonusesOf(sid);
        const extra = s ? s.traits.map((t) => catalog.traits[t]?.name).filter(Boolean) : [];
        return (
          <Choice
            key={sid ?? "base"}
            on={c.subraceId === sid}
            name={s?.name ?? `Обычный: ${race.name.toLowerCase()}`}
            tagline={g?.tagline}
            badge={fitsClass(b, classId) ? pill("подходит", "good") : undefined}
            chips={[
              ...raceChips(s?.replaceBonuses ? null : race, b, traitsOf(sid), s?.speed ?? race.speed),
              ...extra.slice(0, 2).map((n) => pill(n!, "", n)),
              ...(s?.source && s.source !== "srd" && s.source !== "phb" ? [pill(bookLabel(s.source), "", "src")] : []),
            ]}
            onPick={() => upd((x) => { x.subraceId = sid; x.raceBonusChoice = []; })}
            onInfo={() => setInfo(sid ?? "__base")}
          />
        );
      })}
      {info && (() => {
        const sid = info === "__base" ? null : info;
        const s = sid ? catalog.subraces[sid] : null;
        return (
          <Modal open onClose={() => setInfo(null)} title={s?.name ?? race.name}>
            {(sid ? guide.races[sid] : guide.races[race.id])?.about && <RulesText paras={(sid ? guide.races[sid] : guide.races[race.id])!.about} />}
            {s?.desc && <RulesText paras={s.desc} />}
            <div className="chips" style={{ margin: "6px 0" }}>{raceChips(null, bonusesOf(sid), traitsOf(sid), s?.speed ?? race.speed)}</div>
            <TraitList ids={traitsOf(sid)} />
            <button className="primary" style={{ width: "100%", marginTop: 12 }} onClick={() => { upd((x) => { x.subraceId = sid; x.raceBonusChoice = []; }); setInfo(null); }}>Выбрать</button>
          </Modal>
        );
      })()}
    </>
  );
}

// ---------- abilities ----------
/** Quick Build order from the guide, or primary abilities then CON */
function recommendedOrder(classId: string): Ability[] {
  const qb = guide.classes[classId]?.quickBuild?.abilities;
  if (qb?.length === 6) return qb;
  const primary = guide.classes[classId]?.primary ?? [];
  return [...new Set<Ability>([...primary, "con", "dex", "wis", "str", "cha", "int"])];
}

function AbilityStep({ c, upd, sheet }: StepProps & { sheet: Sheet }) {
  const classId = c.classes[0].classId;
  const order = recommendedOrder(classId);
  const race = catalog.races[c.raceId];
  const isStd = [...ABILITIES.map((a) => c.base[a])].sort((x, y) => y - x).join() === STANDARD_ARRAY.join();
  const applyRecommended = () => upd((x) => order.forEach((a, i) => (x.base[a] = STANDARD_ARRAY[i])));
  // untouched scores (all 10) get the recommended spread right away, so "Далее" never leaves a weak hero
  useEffect(() => {
    if (ABILITIES.every((a) => c.base[a] === 10)) applyRecommended();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const swap = (a: Ability, v: number) =>
    upd((x) => {
      const other = ABILITIES.find((b) => b !== a && x.base[b] === v);
      if (other) x.base[other] = x.base[a];
      x.base[a] = v;
    });
  const note = guide.classes[classId]?.quickBuild?.note;
  return (
    <>
      <button className={isStd ? "" : "primary"} onClick={applyRecommended}>
        {isStd ? "Расставить заново по совету" : "Расставить по совету для класса"}
      </button>
      <div className="faint">
        Используется стандартный набор 15, 14, 13, 12, 10, 8 — честный и сбалансированный.
        {note ? ` Совет книги: ${note}` : ""}
      </div>
      <div className="card">
        {ABILITIES.map((a) => {
          const final = sheet.scores[a].value;
          const bonus = final - c.base[a];
          return (
            <div className="ability-row" key={a}>
              <span>
                <b>{FULL[a]}</b> {order.indexOf(a) < 2 && <span className="pill accent">важно</span>}
                <div className="tip">{ABILITY_WHAT[a]}</div>
              </span>
              <select value={c.base[a]} aria-label={FULL[a]} onChange={(e) => swap(a, Number(e.target.value))}>
                {[...new Set([c.base[a], ...STANDARD_ARRAY])].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <span style={{ textAlign: "right" }}>
                <b>{formatMod(mod(final))}</b>
                <div className="tip">{final}{bonus ? ` (+${bonus})` : ""}</div>
              </span>
            </div>
          );
        })}
      </div>
      {race?.bonusChoice && !catalog.subraces[c.subraceId ?? ""]?.replaceBonuses && (
        <div className="card">
          <b>{race.name}: ещё +{race.bonusChoice.bonus} к {race.bonusChoice.n} характеристикам</b>
          <div className="chips" style={{ marginTop: 6 }}>
            {race.bonusChoice.from.map((a) => (
              <span key={a} className={`chip${c.raceBonusChoice.includes(a) ? " on" : ""}`} onClick={() => upd((x) => {
                x.raceBonusChoice = x.raceBonusChoice.includes(a) ? x.raceBonusChoice.filter((y) => y !== a) : [...x.raceBonusChoice, a].slice(-race.bonusChoice!.n);
              })}>{SHORT[a]}</span>
            ))}
          </div>
          <div className="tip" style={{ marginTop: 4 }}>Совет: возьмите {order.filter((a) => race.bonusChoice!.from.includes(a)).slice(0, race.bonusChoice.n).map((a) => SHORT[a]).join(" и ")}.</div>
        </div>
      )}
      <div className="faint">Модификатор (большое число) — то, что прибавляется к броску. Другие способы (покупка очков, бросок кубов) — в обычном редакторе.</div>
    </>
  );
}

// ---------- background ----------
function BackgroundStep({ c, upd }: StepProps) {
  const [info, setInfo] = useState<string | null>(null);
  const recommended = guide.classes[c.classes[0].classId]?.quickBuild?.background;
  const list = Object.values(catalog.backgrounds).sort((a, b) => Number(b.id === recommended) - Number(a.id === recommended) || a.name.localeCompare(b.name, "ru"));
  const skillName = (p: string) => catalog.ref.skills.find((s) => `skill-${s.id}` === p)?.name;
  return (
    <>
      {list.map((b) => (
        <Choice
          key={b.id}
          on={c.backgroundId === b.id}
          name={b.name}
          tagline={guide.backgrounds[b.id]?.tagline}
          badge={b.id === recommended ? pill("совет книги", "good") : undefined}
          chips={[...b.profs.filter((p) => p.startsWith("skill-")).map((p) => pill(skillName(p) ?? p, "accent", p)), ...(b.source !== "srd" && b.source !== "phb" ? [pill(bookLabel(b.source), "", "src")] : [])]}
          onPick={() => upd((x) => (x.backgroundId = b.id))}
          onInfo={() => setInfo(b.id)}
        />
      ))}
      {info && (() => {
        const b = catalog.backgrounds[info];
        return (
          <Modal open onClose={() => setInfo(null)} title={b.name}>
            {guide.backgrounds[info]?.about && <RulesText paras={guide.backgrounds[info].about} />}
            <div className="chips" style={{ margin: "6px 0" }}>{b.profs.map((p) => pill(catalog.ref.proficiencies[p]?.name ?? p, "", p))}</div>
            <h3 style={{ margin: "10px 0 4px" }}>{b.feature.name}</h3>
            <RulesText paras={b.feature.desc} />
            <button className="primary" style={{ width: "100%", marginTop: 12 }} onClick={() => { upd((x) => (x.backgroundId = info)); setInfo(null); }}>Выбрать</button>
          </Modal>
        );
      })()}
    </>
  );
}

// ---------- skills ----------
function SkillStep({ c, upd, sheet, autoRef }: StepProps & { sheet: Sheet; autoRef: { current: (() => void) | null } }) {
  const k = catalog.classes[c.classes[0].classId];
  const race = catalog.races[c.raceId];
  const bg = c.backgroundId ? catalog.backgrounds[c.backgroundId] : null;
  const fixed = new Set(
    [...(bg?.profs ?? []), ...(race?.profs ?? []), ...sheet.traits.flatMap((t) => t.profs)].filter((p) => p.startsWith("skill-")).map((p) => p.slice(6)),
  );
  const from = k.skillChoice?.from ?? [];
  const n = (k.skillChoice?.n ?? 0) + (race?.profChoice?.n ?? 0);
  const mine = c.skills.filter((s) => !fixed.has(s));
  // recommend class skills that use the character's best abilities
  const best = [...ABILITIES].sort((a, b) => sheet.mods[b] - sheet.mods[a]).slice(0, 2);
  const skills = catalog.ref.skills.filter((s) => from.includes(s.id) || race?.profChoice);
  const toggle = (id: string) =>
    upd((x) => {
      x.skills = x.skills.includes(id) ? x.skills.filter((s) => s !== id) : [...x.skills, id];
    });
  const auto = () =>
    upd((x) => {
      // keep what the player already ticked, top up with skills of the best abilities
      const kept = x.skills.filter((s) => !fixed.has(s));
      const pool = skills.filter((s) => !fixed.has(s.id) && !kept.includes(s.id)).sort((a, b) => sheet.mods[b.ability] - sheet.mods[a.ability]);
      x.skills = [...kept, ...pool.map((s) => s.id)].slice(0, n);
    });
  // leaving the step with free picks: fill them with the best-fitting skills (changeable later)
  autoRef.current = () => { if (mine.length < n) auto(); };
  return (
    <>
      <div className="row">
        <span className={`pill ${mine.length === n ? "good" : "warn"}`}>Выбрано {mine.length} из {n}</span>
        <span className="grow" />
        <button className="small" onClick={auto}>Выбрать за меня</button>
      </div>
      {fixed.size > 0 && <div className="faint">Уже есть от предыстории и расы: {[...fixed].map((s) => catalog.ref.skills.find((x) => x.id === s)?.name).join(", ")}.</div>}
      <div className="list card">
        {skills.map((s) => {
          const has = fixed.has(s.id) || c.skills.includes(s.id);
          return (
            <label key={s.id} className="li" style={{ margin: 0, color: "var(--text)", fontSize: 15 }}>
              <input type="checkbox" checked={has} disabled={fixed.has(s.id) || (!has && mine.length >= n)} onChange={() => toggle(s.id)} />
              <span className="grow">
                {s.name} <span className="faint">{SHORT[s.ability]} {formatMod(sheet.mods[s.ability])}</span>
                {best.includes(s.ability) && !has && <span className="pill good" style={{ marginLeft: 6 }}>совет</span>}
                <div className="tip">{(s.desc?.[0] ?? "").split(". ")[0].replace(/\.+$/, "")}.</div>
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}

// ---------- special choices ----------
function ChoicesStep({ c, upd, sheet }: StepProps & { sheet: Sheet }) {
  const blocks: ReactNode[] = [];
  for (const { feature, classId } of sheet.features) {
    const opts = feature.choice?.kind === "feature" ? (feature.choice.options?.filter(Boolean) as string[] | undefined) : undefined;
    if (!opts?.length) continue;
    const lv = c.classes.find((e) => e.classId === classId)?.level ?? 1;
    const n = countAt(feature.choice!.n, lv);
    const picked = c.choices[feature.id] ?? [];
    blocks.push(
      <div className="card" key={feature.id}>
        <div className="head"><h2>{feature.name}</h2><span className={`pill ${picked.length >= n ? "good" : "warn"}`}>{picked.length}/{n}</span></div>
        <div className="list">
          {opts.map((id) => {
            const f = catalog.features[id];
            if (!f || f.level > lv) return null;
            const on = picked.includes(id);
            return (
              <label key={id} className="li" style={{ margin: 0, color: "var(--text)", fontSize: 15, alignItems: "flex-start" }}>
                <input type={n === 1 ? "radio" : "checkbox"} checked={on} name={feature.id} onChange={() => upd((x) => {
                  const cur = x.choices[feature.id] ?? [];
                  x.choices[feature.id] = on ? cur.filter((v) => v !== id) : n === 1 ? [id] : [...cur, id].slice(-n);
                })} />
                <span className="grow">
                  {f.name.replace(/^[^:]+:\s*/, "")}
                  <div className="tip">{(f.desc[0] ?? "").slice(0, 160)}{(f.desc[0] ?? "").length > 160 ? "…" : ""}</div>
                </span>
              </label>
            );
          })}
        </div>
      </div>,
    );
  }
  for (const t of sheet.traits) {
    const opts = t.options?.map((o) => ({ id: o, name: catalog.traits[o]?.name ?? o })) ?? t.spellOptions?.map((o) => ({ id: o, name: catalog.spells[o]?.name ?? o }));
    if (!opts) continue;
    const picked = c.choices[t.id] ?? [];
    blocks.push(
      <div className="card" key={t.id}>
        <div className="head"><h2>{t.name}</h2><span className={`pill ${picked.length ? "good" : "warn"}`}>{picked.length}/1</span></div>
        <div className="chips">
          {opts.map((o) => <span key={o.id} className={`chip${picked.includes(o.id) ? " on" : ""}`} onClick={() => upd((x) => (x.choices[t.id] = [o.id]))}>{o.name}</span>)}
        </div>
      </div>,
    );
  }
  const langN = raceLanguageBudget(c, sheet);
  if (langN > 0) {
    const known = new Set(catalog.races[c.raceId]?.languages ?? []);
    blocks.push(
      <div className="card" key="race-languages">
        <div className="head"><h2>Языки расы</h2><span className={`pill ${c.languages.length >= langN ? "good" : "warn"}`}>{c.languages.length}/{langN}</span></div>
        <div className="chips">
          {catalog.ref.languages.filter((l) => !known.has(l.id)).map((l) => {
            const on = c.languages.includes(l.id);
            return (
              <span key={l.id} className={`chip${on ? " on" : ""}`} onClick={() => upd((x) => {
                x.languages = on ? x.languages.filter((y) => y !== l.id) : [...x.languages, l.id].slice(-langN);
              })}>{l.name}</span>
            );
          })}
        </div>
      </div>,
    );
  }
  for (const o of sheet.owners) {
    if (!o.effects.some((e) => CHOICE_KINDS.has(e.k))) continue;
    blocks.push(
      <div className="card" key={o.id}>
        <h2>{o.name}</h2>
        <EffectChoices owner={o} c={c} sheet={sheet} />
      </div>,
    );
  }
  void upd;
  return <>{blocks}<div className="faint">Если сомневаетесь — выберите что нравится по описанию. Всё можно поменять на вкладке «Умения».</div></>;
}

// ---------- spells ----------
function SpellStep({ c, upd, sheet }: StepProps & { sheet: Sheet }) {
  const [browse, setBrowse] = useState(false);
  const classId = c.classes[0].classId;
  const caster = sheet.casting.find((k) => k.classId === classId);
  const recommended = (guide.classes[classId]?.quickBuild?.spells ?? []).filter((id) => {
    const s = catalog.spells[id];
    return s && s.classes.includes(classId) && s.level <= (caster?.maxLevel ?? 0);
  });
  const mine = c.spells.filter((s) => s.classId === classId);
  const cantrips = mine.filter((s) => catalog.spells[s.id]?.level === 0).length;
  const leveled = mine.length - cantrips;
  const takeRecommended = () =>
    upd((x) => {
      // prepared casters: don't mark more spells prepared than the limit (a wizard's book can hold more)
      let preparedLeft = caster?.prepared ? caster.prepared.value - x.spells.filter((s) => s.classId === classId && s.prepared && catalog.spells[s.id]?.level).length : Infinity;
      for (const id of recommended) {
        if (x.spells.some((s) => s.id === id)) continue;
        const cantrip = catalog.spells[id].level === 0;
        const prepared = cantrip || preparedLeft > 0;
        if (!cantrip && prepared) preparedLeft--;
        x.spells.push({ id, classId, prepared });
      }
    });
  if (!caster) return <div className="faint">У класса пока нет заклинаний на этом уровне.</div>;
  const limit = caster.prepared ? `можно подготовить ${caster.prepared.value}` : caster.known != null ? `известно ${caster.known}` : "";
  return (
    <>
      <div className="card">
        <div className="row wrap" style={{ gap: 6 }}>
          {caster.cantrips > 0 && <span className={`pill ${cantrips === caster.cantrips ? "good" : "warn"}`}>Заговоры {cantrips}/{caster.cantrips}</span>}
          <span className="pill">Заклинания: {leveled}{limit ? ` (${limit})` : ""}</span>
        </div>
        <div className="tip" style={{ marginTop: 6 }}>
          Заговоры — магия без ограничений, ими можно пользоваться каждый ход. Заклинания тратят ячейки, ячейки возвращаются после продолжительного отдыха.
          {caster.prepared && (classId === "wizard"
            ? " Волшебник записывает заклинания в книгу и после отдыха готовит часть из них — сколько, видно выше."
            : " Ваш класс после продолжительного отдыха выбирает, какие заклинания подготовить из всего списка класса.")}
        </div>
      </div>
      {recommended.length > 0 && (
        <button className="primary" onClick={takeRecommended}>
          Взять рекомендованные книгой: {recommended.map((id) => catalog.spells[id].name).join(", ")}
        </button>
      )}
      <button onClick={() => setBrowse(true)}>Выбрать заклинания самому</button>
      {mine.length > 0 && (
        <div className="card list">
          {mine.map((s) => {
            const sp = catalog.spells[s.id];
            return (
              <div className="li" key={s.id}>
                <span className="grow">
                  {sp?.name} <span className="faint">{sp?.level === 0 ? "заговор" : `${sp?.level} ур.`}</span>
                  {sp?.level ? <span className={`pill ${s.prepared ? "good" : ""}`} style={{ marginLeft: 6 }}>{s.prepared ? "подготовлено" : "в книге"}</span> : null}
                </span>
                <button className="small ghost" aria-label="Убрать" onClick={() => upd((x) => (x.spells = x.spells.filter((y) => y.id !== s.id)))}>✕</button>
              </div>
            );
          })}
        </div>
      )}
      {browse && <SpellBrowser caster={caster} c={c} onClose={() => setBrowse(false)} />}
    </>
  );
}

// ---------- gear ----------
function itemLabel(it: StartItem): string {
  if (it.category !== undefined) {
    const name = (catalog.ref.categories[it.category] ?? it.category).toLowerCase();
    return it.n > 1 ? `${it.n} × ${name} на выбор` : `${name} на выбор`;
  }
  const e = catalog.equipment[it.id];
  return `${e?.name ?? it.id}${it.qty > 1 ? ` ×${it.qty}` : ""}`;
}

function GearStep({ c, upd, sheet, takeRef }: StepProps & { sheet: Sheet; takeRef: { current: (() => void) | null } }) {
  const k = catalog.classes[c.classes[0].classId];
  const bg = c.backgroundId ? catalog.backgrounds[c.backgroundId] : null;
  const sets = k.startOptions ?? [];
  // which option of each "(a) or (b)" set, and the concrete items picked from categories
  const [pick, setPick] = useState<number[]>(() => sets.map(() => 0));
  const [catPick, setCatPick] = useState<Record<string, string>>({});
  const has = c.inventory.length > 0;
  const profs = sheet.profs;
  const usable = (id: string) => {
    const e = catalog.equipment[id];
    if (e?.weapon) return profs.has(`${e.weapon.cat}-weapons`) || profs.has(`${id}s`);
    if (e?.armor) return e.armor.cat === "shield" ? profs.has("shields") : profs.has(`${e.armor.cat}-armor`) || profs.has("all-armor");
    return true;
  };
  const catOptions = (cat: string) => (catalog.ref.categoryItems[cat] ?? []).filter((id) => catalog.equipment[id]);
  const catValue = (key: string, cat: string) => catPick[key] ?? catOptions(cat).find(usable) ?? catOptions(cat)[0];

  const take = () =>
    upd((x) => {
      const add: { id: string; qty: number }[] = [...k.startEquip, ...(bg?.equipment ?? [])];
      sets.forEach((set, si) => {
        const opt = set.options[pick[si]] ?? set.options[0];
        opt?.forEach((it, ii) => {
          if (it.category === undefined) add.push({ id: it.id, qty: it.qty });
          else for (let n = 0; n < it.n; n++) {
            const id = catValue(`${si}:${ii}:${n}`, it.category);
            if (id) add.push({ id, qty: 1 });
          }
        });
      });
      for (const e of add) {
        const eq = catalog.equipment[e.id];
        if (!eq) continue;
        // equipment packs are unpacked so the contents show up as separate items
        if (eq.contents?.length) for (const ci of eq.contents) x.inventory.push({ uid: newId(), baseId: ci.id, magicId: null, custom: null, qty: ci.qty * e.qty, equipped: false, attuned: false });
        else x.inventory.push({ uid: newId(), baseId: e.id, magicId: null, custom: null, qty: e.qty, equipped: false, attuned: false });
      }
      if (bg) x.money.gp += bg.gold;
      // wear the best armour the character can use, a shield if proficient, and hold up to two weapons
      const armor = x.inventory
        .filter((i) => catalog.equipment[i.baseId ?? ""]?.armor && catalog.equipment[i.baseId!].armor!.cat !== "shield" && usable(i.baseId!))
        .sort((a, b) => catalog.equipment[b.baseId!].armor!.base - catalog.equipment[a.baseId!].armor!.base)[0];
      if (armor) armor.equipped = true;
      const shield = x.inventory.find((i) => i.baseId === "shield");
      if (shield && usable("shield")) shield.equipped = true;
      for (const w of x.inventory.filter((i) => catalog.equipment[i.baseId ?? ""]?.weapon && usable(i.baseId!)).slice(0, 2)) w.equipped = true;
    });

  takeRef.current = take;
  if (has)
    return (
      <>
        <div className="info-box row">
          <span className="grow">Снаряжение получено, доспех и оружие надеты. Поменять — на вкладке «Вещи».</span>
          <button className="small" onClick={() => upd((x) => { x.inventory = []; if (bg) x.money.gp = Math.max(0, x.money.gp - bg.gold); })}>Выбрать заново</button>
        </div>
        <div className="card list">
          {c.inventory.map((i) => (
            <div className="li" key={i.uid}>
              <span className="grow">{catalog.equipment[i.baseId ?? ""]?.name ?? i.custom?.name} {i.qty > 1 && <span className="faint">×{i.qty}</span>}</span>
              {i.equipped && <span className="pill good">надето</span>}
            </div>
          ))}
        </div>
      </>
    );

  return (
    <>
      {sets.map((set, si) => (
        <div className="card" key={si}>
          <div className="faint" style={{ marginBottom: 6 }}>Выбор {si + 1}</div>
          <div className="list">
            {set.options.map((opt, oi) => (
              <label key={oi} className="li" style={{ margin: 0, color: "var(--text)", fontSize: 15, alignItems: "flex-start" }}>
                <input type="radio" name={`set${si}`} checked={pick[si] === oi} onChange={() => setPick((p) => p.map((v, i) => (i === si ? oi : v)))} />
                <span className="grow">
                  {opt.map(itemLabel).join(" + ")}
                  {pick[si] === oi && opt.map((it, ii) => it.category
                    ? Array.from({ length: it.n }, (_, n) => {
                        const key = `${si}:${ii}:${n}`;
                        return (
                          <select key={key} style={{ marginTop: 6 }} value={catValue(key, it.category)} onChange={(e) => setCatPick((p) => ({ ...p, [key]: e.target.value }))}>
                            {catOptions(it.category).map((id) => (
                              <option key={id} value={id}>{catalog.equipment[id].name}{usable(id) ? "" : " (нет владения)"}</option>
                            ))}
                          </select>
                        );
                      })
                    : null)}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="tip">
        Плюс без выбора: {[...k.startEquip.map((e) => catalog.equipment[e.id]?.name), ...(bg?.equipment ?? []).map((e) => catalog.equipment[e.id]?.name)].filter(Boolean).join(", ") || "—"}
        {bg ? `, ${bg.gold} зм` : ""}. Наборы (путешественника, учёного…) распакуются на отдельные вещи.
      </div>
      <div className="info-box">Выберите варианты и нажмите «Взять и дальше» внизу — доспех и оружие наденутся сами.</div>
    </>
  );
}

// ---------- appearance ----------
function rollBody(raceId: string, subraceId: string | null) {
  const b = (subraceId && guide.races[subraceId]?.body) || guide.races[raceId]?.body;
  if (!b) return null;
  const h = b.heightDice ? rollExpr(parseDice(b.heightDice)).total : 0;
  const w = b.weightDice ? rollExpr(parseDice(b.weightDice)).total : 1;
  const inches = b.baseIn + h;
  const lb = b.baseLb + h * w;
  // feet/inches as in the books, plus metric for convenience
  return {
    height: `${Math.floor(inches / 12)}'${inches % 12}" (${Math.round(inches * 2.54)} см)`,
    weight: `${lb} фнт (${Math.round(lb * 0.4536)} кг)`,
  };
}

export function LookStep({ c, upd }: StepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const ap = c.appearance ?? {};
  const st = c.story ?? {};
  const age = (c.subraceId && guide.races[c.subraceId]?.age) || guide.races[c.raceId]?.age;
  const body = (c.subraceId && guide.races[c.subraceId]?.body) || guide.races[c.raceId]?.body;
  const setAp = (k: keyof NonNullable<Character["appearance"]>, v: string) => upd((x) => (x.appearance = { ...(x.appearance ?? {}), [k]: v }));
  const setSt = (k: keyof NonNullable<Character["story"]>, v: string) => upd((x) => (x.story = { ...(x.story ?? {}), [k]: v }));
  return (
    <>
      <div className="card row" style={{ gap: 14 }}>
        <Avatar c={c} size={72} />
        <div className="grow">
          <button className="small" onClick={() => fileRef.current?.click()}>{c.portrait ? "Другой портрет" : "Загрузить портрет"}</button>
          {c.portrait && <button className="small ghost" onClick={() => upd((x) => (x.portrait = null))}>Убрать</button>}
          <div className="tip" style={{ marginTop: 4 }}>Без картинки — герб класса и расы.</div>
          {err && <div className="bad-box" style={{ marginTop: 4 }}>{err}</div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const p = await imageToPortrait(f);
            upd((x) => (x.portrait = p));
            setErr(null);
          } catch (ex) {
            setErr((ex as Error).message);
          }
        }} />
      </div>
      <div className="card">
        <label>Имя</label>
        <input value={c.name === "Новый персонаж" ? "" : c.name} placeholder="Как зовут героя?" onChange={(e) => upd((x) => (x.name = e.target.value))} />
        <label style={{ marginTop: 10 }}>Мировоззрение</label>
        <select value={c.alignment ?? ""} onChange={(e) => upd((x) => (x.alignment = e.target.value || null))}>
          <option value="">— не важно —</option>
          {catalog.ref.alignments.map((a) => <option key={a.id} value={a.id}>{a.name}: {ALIGN_WHAT[a.id]}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="head">
          <h2>Внешность</h2>
          {body && (
            <button className="small" onClick={() => { const r = rollBody(c.raceId, c.subraceId); if (r) upd((x) => (x.appearance = { ...(x.appearance ?? {}), ...r })); }}>
              🎲 Рост и вес
            </button>
          )}
        </div>
        <div className="grid2">
          <div><label>Возраст</label><input value={ap.age ?? ""} placeholder={age ? `взрослеет к ${age.adult}, живёт до ${age.max}` : "лет"} onChange={(e) => setAp("age", e.target.value)} /></div>
          <div><label>Рост</label><input value={ap.height ?? ""} onChange={(e) => setAp("height", e.target.value)} /></div>
          <div><label>Вес</label><input value={ap.weight ?? ""} onChange={(e) => setAp("weight", e.target.value)} /></div>
          <div><label>Глаза</label><input value={ap.eyes ?? ""} onChange={(e) => setAp("eyes", e.target.value)} /></div>
          <div><label>Волосы</label><input value={ap.hair ?? ""} onChange={(e) => setAp("hair", e.target.value)} /></div>
          <div><label>Кожа</label><input value={ap.skin ?? ""} onChange={(e) => setAp("skin", e.target.value)} /></div>
        </div>
        {body && <div className="tip" style={{ marginTop: 4 }}>Рост и вес бросаются по таблице из книги для вашей расы.</div>}
      </div>
      <details className="card">
        <summary><b>Характер и история</b> <span className="faint">— необязательно</span></summary>
        <label style={{ marginTop: 8 }}>Черты характера</label>
        <textarea style={{ minHeight: 60 }} value={st.personality ?? ""} placeholder="Как герой ведёт себя? Что в нём сразу замечают?" onChange={(e) => setSt("personality", e.target.value)} />
        <label>Идеалы</label>
        <textarea style={{ minHeight: 60 }} value={st.ideals ?? ""} placeholder="Во что он верит? Ради чего готов рискнуть?" onChange={(e) => setSt("ideals", e.target.value)} />
        <label>Привязанности</label>
        <textarea style={{ minHeight: 60 }} value={st.bonds ?? ""} placeholder="Кто или что ему дорого? Кому он должен?" onChange={(e) => setSt("bonds", e.target.value)} />
        <label>Слабости</label>
        <textarea style={{ minHeight: 60 }} value={st.flaws ?? ""} placeholder="Чего он боится? Какая привычка мешает жить?" onChange={(e) => setSt("flaws", e.target.value)} />
        <label>История</label>
        <textarea value={st.history ?? ""} placeholder="Откуда он и почему отправился в путь?" onChange={(e) => setSt("history", e.target.value)} />
      </details>
    </>
  );
}

// ---------- summary ----------
function SummaryStep({ c, sheet }: { c: Character; sheet: Sheet }) {
  const e0 = c.classes[0];
  const top = Object.entries(sheet.skills).filter(([, s]) => s.prof !== "none" && s.prof !== "half").map(([id, s]) => `${catalog.ref.skills.find((x) => x.id === id)?.name} ${formatMod(s.calc.value)}`);
  const todo = sheet.warnings.filter((w) => w.level === "info");
  return (
    <>
      <div className="card row" style={{ gap: 14 }}>
        <Avatar c={c} size={64} />
        <div className="grow">
          <h2>{c.name && c.name !== "Новый персонаж" ? c.name : "Без имени"}</h2>
          <div className="muted">
            {catalog.subraces[c.subraceId ?? ""]?.name ?? catalog.races[c.raceId]?.name} · {catalog.classes[e0.classId].name} {e0.level}
            {e0.subclassId ? ` (${catalog.subclasses[e0.subclassId]?.name})` : ""}
          </div>
        </div>
      </div>
      <div className="grid4">
        <div className="stat"><div className="lb">Хиты</div><div className="vl">{sheet.hpMax.value}</div></div>
        <div className="stat"><div className="lb">КД</div><div className="vl">{sheet.ac.value}</div></div>
        <div className="stat"><div className="lb">Иниц.</div><div className="vl">{formatMod(sheet.initiative.value)}</div></div>
        <div className="stat"><div className="lb">Скор.</div><div className="vl">{sheet.speed.value}</div></div>
      </div>
      <div className="card">
        <div className="grid6">
          {ABILITIES.map((a) => (
            <div className="stat" key={a}><div className="lb">{SHORT[a]}</div><div className="vl">{formatMod(sheet.mods[a])}</div><div className="sub">{sheet.scores[a].value}</div></div>
          ))}
        </div>
        <div className="tip" style={{ marginTop: 8 }}>Навыки: {top.join(", ") || "—"}</div>
        <div className="tip">Атаки: {sheet.attacks.filter((a) => a.uid !== "unarmed").map((a) => `${a.name} ${formatMod(a.toHit.value)}`).join(", ") || "только безоружный удар"}</div>
        {sheet.casting[0] && <div className="tip">Заклинания: Сл {sheet.casting[0].dc.value}, атака {formatMod(sheet.casting[0].attack.value)}, выбрано {c.spells.length}</div>}
      </div>
      {todo.length > 0 && (
        <div className="info-box">
          Можно доделать позже:
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{todo.map((w, i) => <li key={i}>{w.text}</li>)}</ul>
        </div>
      )}
      <div className="faint">После создания: нажимайте на любое число, чтобы бросить кубы. Долгое нажатие покажет, откуда число взялось.</div>
    </>
  );
}

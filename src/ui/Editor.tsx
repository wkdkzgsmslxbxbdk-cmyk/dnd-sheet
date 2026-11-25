import { useMemo, useState } from "react";
import { POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY, totalLevel, type AsiChoice, type Character } from "../rules/character";
import { derive, mod } from "../rules/derive";
import { ABILITIES, type Ability } from "../rules/types";
import { catalog } from "../data/catalog";
import { formatMod, rollDie } from "../rules/dice";
import { useStore } from "../state/store";
import { Counter, RulesText } from "./common";
import { bookLabel } from "./tabs/FeaturesTab";

const FULL: Record<Ability, string> = { str: "Сила", dex: "Ловкость", con: "Телосложение", int: "Интеллект", wis: "Мудрость", cha: "Харизма" };
const SHORT: Record<Ability, string> = { str: "СИЛ", dex: "ЛОВ", con: "ТЕЛ", int: "ИНТ", wis: "МДР", cha: "ХАР" };
type Method = "standard" | "pointbuy" | "roll" | "manual";

/** class level at which the subclass is chosen (first level that lists a subclass feature) */
function subclassLevel(classId: string): number {
  const sub = catalog.subclasses[catalog.classes[classId]?.subclasses[0]];
  return sub?.levels[0]?.level ?? 3;
}

export function Editor({ c, onDone }: { c: Character; onDone: () => void }) {
  const update = useStore((s) => s.update);
  const upd = (f: (x: Character) => void) => update(c.id, f);
  const sheet = useMemo(() => derive(c), [c]);
  const [method, setMethod] = useState<Method>("standard");
  const [rolled, setRolled] = useState<{ sets: number[][]; values: number[] } | null>(null);
  const race = catalog.races[c.raceId];
  const level = totalLevel(c);

  const usedStd = (a: Ability) => ABILITIES.filter((b) => b !== a).map((b) => c.base[b]);
  const stdOk = [...ABILITIES.map((a) => c.base[a])].sort((x, y) => y - x).join() === STANDARD_ARRAY.join();
  const pointsUsed = ABILITIES.reduce((s, a) => s + (POINT_BUY_COST[c.base[a]] ?? 99), 0);

  const rollStats = () => {
    // PHB: roll four d6, drop the lowest, six times
    const sets = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => rollDie(6)));
    const values = sets.map((s) => [...s].sort((a, b) => b - a).slice(0, 3).reduce((x, y) => x + y, 0));
    setRolled({ sets, values });
  };

  const canMulticlass = (classId: string) => {
    // PHB: you must meet the prerequisites of your current class and the new one
    const check = (id: string) => {
      const reqs = catalog.classes[id].multiclass;
      const any = reqs.some((r) => r.any);
      const ok = (r: (typeof reqs)[number]) => sheet.scores[r.ability].value >= r.min;
      return any ? reqs.some(ok) : reqs.every(ok);
    };
    return [...c.classes.map((e) => e.classId), classId].every(check);
  };

  // skills
  const first = catalog.classes[c.classes[0]?.classId];
  const bg = c.backgroundId ? catalog.backgrounds[c.backgroundId] : null;
  const fixedSkills = new Set(
    [...(bg?.profs ?? []), ...(race?.profs ?? []), ...sheet.traits.flatMap((t) => t.profs)].filter((p) => p.startsWith("skill-")).map((p) => p.slice(6)),
  );
  const skillBudget =
    (first?.skillChoice?.n ?? 0) +
    (race?.profChoice ? race.profChoice.n : 0) +
    c.classes.slice(1).reduce((s, e) => s + (catalog.classes[e.classId]?.multiSkill ?? 0), 0) +
    (c.classes.some((e) => e.subclassId === "lore" && e.level >= 3) ? 3 : 0) +
    (c.backgroundId === null ? 2 : 0);
  const toggleSkill = (id: string) =>
    upd((x) => {
      x.skills = x.skills.includes(id) ? x.skills.filter((s) => s !== id) : [...x.skills, id];
      x.expertise = x.expertise.filter((e) => x.skills.includes(e) || fixedSkills.has(e) || e === "thieves-tools");
    });

  // languages
  const raceLangs = new Set(race?.languages ?? []);
  const langBudget = (race?.languageChoice?.n ?? 0) + (c.subraceId ? catalog.subraces[c.subraceId]?.languageChoice?.n ?? 0 : 0) + (bg?.languageChoice?.n ?? 0) + (sheet.traits.some((t) => t.id === "extra-language") ? 1 : 0) + (c.backgroundId === null ? 2 : 0);

  // ASI slots reached
  const asiSlots: { key: string; label: string }[] = [];
  for (const e of c.classes) {
    const cls = catalog.classes[e.classId];
    for (const lv of cls.levels) {
      if (lv.level <= e.level && lv.features.some((f) => f.includes("ability-score-improvement"))) asiSlots.push({ key: `${e.classId}:${lv.level}`, label: `${cls.name}, ${lv.level} уровень` });
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="title"><b>Редактор</b><span>{c.name}</span></div>
        <button className="primary small" onClick={onDone}>Готово</button>
      </div>
      <div className="content">
        <div className="card">
          <label>Имя персонажа</label>
          <input value={c.name} onChange={(e) => upd((x) => (x.name = e.target.value))} />
          <div className="grid2" style={{ marginTop: 8 }}>
            <div>
              <label>Игрок</label>
              <input value={c.player} onChange={(e) => upd((x) => (x.player = e.target.value))} />
            </div>
            <div>
              <label>Мировоззрение</label>
              <select value={c.alignment ?? ""} onChange={(e) => upd((x) => (x.alignment = e.target.value || null))}>
                <option value="">—</option>
                {catalog.ref.alignments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Раса</h2>
          <div className="grid2">
            <select
              value={c.raceId}
              onChange={(e) => upd((x) => {
                x.raceId = e.target.value;
                // races whose SRD entry has no subrace (human) start without one
                x.subraceId = catalog.races[e.target.value].subraces.find((s) => catalog.subraces[s]?.source === "srd") ?? null;
                x.raceBonusChoice = [];
              })}
            >
              {[...catalog.raceList].sort((a, b) => a.name.localeCompare(b.name, "ru")).map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.source && r.source !== "srd" ? ` (${bookLabel(r.source)})` : ""}</option>
              ))}
            </select>
            {race?.subraces.length ? (
              <select value={c.subraceId ?? ""} onChange={(e) => upd((x) => { x.subraceId = e.target.value || null; })}>
                {!race.subraces.some((s) => catalog.subraces[s]?.source === "srd") && <option value="">Обычный</option>}
                {race.subraces.map((s) => (
                  <option key={s} value={s}>{catalog.subraces[s]?.name}{catalog.subraces[s]?.source !== "srd" ? ` (${bookLabel(catalog.subraces[s]?.source)})` : ""}</option>
                ))}
              </select>
            ) : <div />}
          </div>
          <div className="faint" style={{ marginTop: 6 }}>
            {Object.entries({ ...(c.subraceId && catalog.subraces[c.subraceId]?.replaceBonuses ? {} : race?.bonuses), ...(c.subraceId ? catalog.subraces[c.subraceId]?.bonuses : {}) }).map(([a, v]) => `${SHORT[a as Ability]} +${v}`).join(", ")}
            {` · скорость ${(c.subraceId && catalog.subraces[c.subraceId]?.speed) || race?.speed} фт · ${race?.size}`}
            {c.subraceId && catalog.subraces[c.subraceId]?.replaceBonuses && " · характеристики на выбор — на вкладке «Умения»"}
          </div>
          {race?.bonusChoice && (
            <div style={{ marginTop: 8 }}>
              <label>Ещё +{race.bonusChoice.bonus} к {race.bonusChoice.n} характеристикам на выбор</label>
              <div className="chips">
                {race.bonusChoice.from.map((a) => (
                  <span key={a} className={`chip${c.raceBonusChoice.includes(a) ? " on" : ""}`} onClick={() => upd((x) => {
                    x.raceBonusChoice = x.raceBonusChoice.includes(a) ? x.raceBonusChoice.filter((y) => y !== a) : [...x.raceBonusChoice, a].slice(-race.bonusChoice!.n);
                  })}>{SHORT[a]}</span>
                ))}
              </div>
            </div>
          )}
          <details style={{ marginTop: 8 }}>
            <summary className="faint">О расе</summary>
            <RulesText paras={[...(race?.desc ?? []), race?.age, race?.alignment, race?.sizeDesc, race?.languageDesc].filter(Boolean) as string[]} />
          </details>
        </div>

        <div className="card">
          <div className="head"><h2>Классы</h2><span className="faint">уровень персонажа {level}</span></div>
          {c.classes.map((e, i) => {
            const cls = catalog.classes[e.classId];
            const subLv = subclassLevel(e.classId);
            return (
              <div key={i} className="li" style={{ flexWrap: "wrap" }}>
                <select style={{ flex: "1 1 140px" }} value={e.classId} onChange={(ev) => upd((x) => { x.classes[i] = { classId: ev.target.value, subclassId: null, level: x.classes[i].level, hpRolls: [] }; })}>
                  {catalog.classList.map((k) => <option key={k.id} value={k.id} disabled={k.id !== e.classId && c.classes.some((y) => y.classId === k.id)}>{k.name}</option>)}
                </select>
                <Counter value={e.level} min={1} max={20 - (level - e.level)} onChange={(v) => upd((x) => (x.classes[i].level = v))} />
                {i > 0 && <button className="small danger" onClick={() => upd((x) => x.classes.splice(i, 1))}>✕</button>}
                <div style={{ flexBasis: "100%" }} />
                {e.level >= subLv ? (
                  <select value={e.subclassId ?? ""} onChange={(ev) => upd((x) => (x.classes[i].subclassId = ev.target.value || null))}>
                    <option value="">— подкласс не выбран —</option>
                    {cls.subclasses.map((s) => (
                      <option key={s} value={s}>{catalog.subclasses[s]?.name} ({bookLabel(catalog.subclasses[s]?.source)})</option>
                    ))}
                  </select>
                ) : (
                  <span className="faint">Подкласс выбирается на {subLv} уровне.</span>
                )}
                <span className="faint">Кость Хитов к{cls.hitDie} · спасброски {cls.saves.map((s) => SHORT[s]).join(", ")}{i > 0 ? " (от первого класса)" : ""}</span>
              </div>
            );
          })}
          {level < 20 && (
            <details style={{ marginTop: 8 }}>
              <summary className="faint">+ Мультикласс</summary>
              <div className="faint" style={{ margin: "6px 0" }}>Нужно значение 13 в основных характеристиках и старого, и нового класса (Книга игрока, «Мультиклассирование»).</div>
              <div className="chips">
                {catalog.classList.filter((k) => !c.classes.some((e) => e.classId === k.id)).map((k) => {
                  const ok = canMulticlass(k.id);
                  return (
                    <span key={k.id} className="chip" style={{ opacity: ok ? 1 : 0.45 }} onClick={() => ok && upd((x) => x.classes.push({ classId: k.id, subclassId: null, level: 1, hpRolls: [] }))}>
                      {k.name} {k.multiclass.map((r) => `${SHORT[r.ability]} ${r.min}`).join(k.multiclass.some((r) => r.any) ? " или " : ", ")}
                    </span>
                  );
                })}
              </div>
            </details>
          )}
          <div className="faint" style={{ marginTop: 6 }}>В скобках — книга: SRD, КИ (Книга игрока), Занатар, Таша и другие.</div>
        </div>

        <div className="card">
          <div className="head"><h2>Характеристики</h2></div>
          <div className="seg" style={{ marginBottom: 8, flexWrap: "wrap" }}>
            {(["standard", "pointbuy", "roll", "manual"] as Method[]).map((m) => (
              <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>
                {{ standard: "Стандарт", pointbuy: "Покупка", roll: "Бросок", manual: "Вручную" }[m]}
              </button>
            ))}
          </div>
          {method === "standard" && (
            <div className={stdOk ? "faint" : "info-box"} style={{ marginBottom: 6 }}>
              Распределите 15, 14, 13, 12, 10, 8. Если значение уже занято (⇄), характеристики поменяются местами.
              {!stdOk && <button className="small" style={{ marginLeft: 8 }} onClick={() => upd((x) => ABILITIES.forEach((b, i) => (x.base[b] = STANDARD_ARRAY[i])))}>Заполнить по порядку</button>}
            </div>
          )}
          {method === "pointbuy" && (
            <div className={pointsUsed > POINT_BUY_BUDGET ? "bad-box" : "faint"} style={{ marginBottom: 6 }}>
              Очки: {pointsUsed}/{POINT_BUY_BUDGET}. Значения от 8 до 15, 14 и 15 стоят дороже.
            </div>
          )}
          {method === "roll" && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={rollStats}>Бросить 4к6 × 6</button>
              {rolled && (
                <div className="faint" style={{ marginTop: 6 }}>
                  {rolled.sets.map((s, i) => `[${s.join(" ")}] → ${rolled.values[i]}`).join(" · ")}
                  <div>Выберите значения ниже из выпавших: {rolled.values.join(", ")}</div>
                </div>
              )}
            </div>
          )}
          <div className="list">
            {ABILITIES.map((a) => {
              const final = sheet.scores[a].value;
              return (
                <div className="li" key={a}>
                  <span style={{ width: 110 }}>{FULL[a]}</span>
                  {method === "standard" ? (
                    <select
                      value={c.base[a]}
                      aria-label={FULL[a]}
                      onChange={(e) => upd((x) => {
                        // picking a value another ability holds swaps the two
                        const v = Number(e.target.value);
                        const other = ABILITIES.find((b) => b !== a && x.base[b] === v);
                        if (other) x.base[other] = x.base[a];
                        x.base[a] = v;
                      })}
                      style={{ width: 80 }}
                    >
                      {[...new Set([c.base[a], ...STANDARD_ARRAY])].map((v) => (
                        <option key={v} value={v}>{v}{usedStd(a).includes(v) && v !== c.base[a] ? " ⇄" : ""}</option>
                      ))}
                    </select>
                  ) : method === "pointbuy" ? (
                    <Counter value={c.base[a]} min={8} max={15} onChange={(v) => upd((x) => (x.base[a] = v))} />
                  ) : method === "roll" && rolled ? (
                    <select value={c.base[a]} onChange={(e) => upd((x) => (x.base[a] = Number(e.target.value)))} style={{ width: 80 }}>
                      {[...new Set([c.base[a], ...rolled.values])].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <Counter value={c.base[a]} min={1} max={30} onChange={(v) => upd((x) => (x.base[a] = v))} />
                  )}
                  <span className="grow" />
                  <span className="faint">итог</span>
                  <b style={{ width: 28, textAlign: "right" }}>{final}</b>
                  <span className="pill" style={{ width: 40, justifyContent: "center" }}>{formatMod(mod(final))}</span>
                </div>
              );
            })}
          </div>
        </div>

        {asiSlots.length > 0 && (
          <div className="card">
            <h2>Увеличение характеристик</h2>
            <div className="faint" style={{ marginBottom: 6 }}>+2 к одной или +1 к двум характеристикам (не выше 20), либо черта вместо этого.</div>
            {asiSlots.map((s) => <AsiEditor key={s.key} label={s.label} value={c.asi[s.key]} scores={sheet.scores} onChange={(v) => upd((x) => { if (v) x.asi[s.key] = v; else delete x.asi[s.key]; })} />)}
            <div className="faint">Выборы внутри черты (характеристика, навыки) — на вкладке «Умения».</div>
          </div>
        )}

        <div className="card">
          <h2>Предыстория</h2>
          <select value={c.backgroundId ?? ""} onChange={(e) => upd((x) => (x.backgroundId = e.target.value || null))}>
            {Object.values(catalog.backgrounds).sort((a, b) => a.name.localeCompare(b.name, "ru")).map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({bookLabel(b.source)})</option>
            ))}
            <option value="">Своя предыстория</option>
          </select>
          <div className="faint" style={{ marginTop: 6 }}>
            {bg
              ? `Навыки: ${bg.profs.filter((p) => p.startsWith("skill-")).map((p) => catalog.ref.skills.find((s) => `skill-${s.id}` === p)?.name).join(", ")} · ${bg.gold} зм. Выбор инструментов и языков — на вкладке «Умения».`
              : "По правилу «Настройка предыстории» из Книги игрока: два любых навыка и два языка или инструмента. Отметьте их ниже."}
          </div>
        </div>

        <div className="card">
          <div className="head">
            <h2>Навыки</h2>
            <span className={`pill ${c.skills.length > skillBudget ? "bad" : c.skills.length === skillBudget ? "good" : ""}`}>{c.skills.length}/{skillBudget}</span>
          </div>
          {first?.skillChoice && (
            <div className="faint" style={{ marginBottom: 6 }}>
              {first.name}: {first.skillChoice.n} из {first.skillChoice.from.map((s) => catalog.ref.skills.find((k) => k.id === s)?.name).join(", ")}.
              {race?.profChoice ? ` ${race.name}: ещё ${race.profChoice.n} любых.` : ""}
              {c.classes.some((e) => e.subclassId === "lore" && e.level >= 3) ? " Коллегия знаний: ещё 3 любых." : ""}
            </div>
          )}
          <div className="chips">
            {catalog.ref.skills.map((s) => {
              const fixed = fixedSkills.has(s.id);
              const on = fixed || c.skills.includes(s.id);
              const fromClass = first?.skillChoice?.from.includes(s.id);
              return (
                <span key={s.id} className={`chip${on ? " on" : ""}`} style={{ opacity: fixed ? 0.7 : 1, fontWeight: fromClass ? 600 : 400 }} onClick={() => !fixed && toggleSkill(s.id)}>
                  {s.name}{fixed ? " ✓" : ""}
                </span>
              );
            })}
          </div>
          <div className="faint" style={{ marginTop: 6 }}>✓ — от расы или предыстории. Жирным — навыки из списка класса.</div>
        </div>

        <div className="card">
          <div className="head"><h2>Языки</h2><span className="pill">{c.languages.length}/{langBudget} на выбор</span></div>
          <div className="chips">
            {catalog.ref.languages.map((l) => {
              const fixed = raceLangs.has(l.id);
              const on = fixed || c.languages.includes(l.id);
              return (
                <span key={l.id} className={`chip${on ? " on" : ""}`} style={{ opacity: fixed ? 0.7 : 1 }} onClick={() => !fixed && upd((x) => (x.languages = x.languages.includes(l.id) ? x.languages.filter((y) => y !== l.id) : [...x.languages, l.id]))}>
                  {l.name}{fixed ? " ✓" : ""}
                </span>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>Хиты</h2>
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={c.hpMethod === "average" ? "on" : ""} onClick={() => upd((x) => (x.hpMethod = "average"))}>Среднее</button>
            <button className={c.hpMethod === "rolled" ? "on" : ""} onClick={() => upd((x) => (x.hpMethod = "rolled"))}>Бросок</button>
          </div>
          <div className="faint">1 уровень — максимум Кости Хитов. Дальше {c.hpMethod === "average" ? "среднее значение (половина кости + 1)" : "результат броска за каждый уровень"} + модификатор ТЕЛ.</div>
          {c.hpMethod === "rolled" && c.classes.map((e, ci) => {
            const d = catalog.classes[e.classId].hitDie;
            // the first class's 1st level is always the maximum, so it is not rolled
            const levels = Array.from({ length: e.level }, (_, k) => k + 1).filter((lvl) => ci > 0 || lvl > 1);
            if (!levels.length) return null;
            return (
              <div key={ci} style={{ marginTop: 8 }}>
                <div className="faint">{catalog.classes[e.classId].name} (к{d})</div>
                <div className="row wrap">
                  {levels.map((lvl) => (
                    <div key={lvl} style={{ width: 64 }}>
                      <label>ур. {lvl}</label>
                      <input
                        inputMode="numeric"
                        value={e.hpRolls[lvl - 1] ?? ""}
                        placeholder={String(d / 2 + 1)}
                        onChange={(ev) => upd((x) => {
                          const n = Math.max(1, Math.min(d, Number(ev.target.value) || 0));
                          x.classes[ci].hpRolls[lvl - 1] = ev.target.value ? n : null;
                        })}
                      />
                    </div>
                  ))}
                  <button className="small" onClick={() => upd((x) => { for (const lvl of levels) x.classes[ci].hpRolls[lvl - 1] = rollDie(d); })}>Бросить все</button>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 8 }}>Максимум хитов: <b>{sheet.hpMax.value}</b></div>
          <label style={{ marginTop: 8 }}>
            <input type="checkbox" checked={c.hp.maxOverride != null} onChange={(e) => upd((x) => (x.hp.maxOverride = e.target.checked ? sheet.hpMax.value : null))} /> Задать максимум вручную
          </label>
          {c.hp.maxOverride != null && <input inputMode="numeric" value={c.hp.maxOverride} onChange={(e) => upd((x) => (x.hp.maxOverride = Number(e.target.value) || 0))} />}
        </div>

        <button className="primary" onClick={() => { upd((x) => { if (x.hp.current === 0 || x.hp.current > sheet.hpMax.value) x.hp.current = sheet.hpMax.value; }); onDone(); }}>Готово</button>
      </div>
    </>
  );
}

function AsiEditor({ label, value, scores, onChange }: { label: string; value: AsiChoice | undefined; scores: Record<Ability, { value: number }>; onChange: (v: AsiChoice | null) => void }) {
  const kind = value?.kind ?? "asi";
  const abilities = value?.kind === "asi" ? value.abilities : {};
  const spent = Object.values(abilities).reduce((s, v) => s + (v ?? 0), 0);
  return (
    <div className="li" style={{ flexWrap: "wrap" }}>
      <b className="grow">{label}</b>
      <div className="seg">
        <button className={kind === "asi" ? "on" : ""} onClick={() => onChange({ kind: "asi", abilities: {} })}>Характеристики</button>
        <button className={kind === "feat" ? "on" : ""} onClick={() => onChange({ kind: "feat", featId: Object.keys(catalog.feats)[0] })}>Черта</button>
      </div>
      <div style={{ flexBasis: "100%" }} />
      {kind === "asi" ? (
        <div className="chips">
          {ABILITIES.map((a) => (
            <span key={a} className={`chip${abilities[a] ? " on" : ""}`} onClick={() => {
              const cur = abilities[a] ?? 0;
              const next = { ...abilities };
              if (cur === 2 || (cur === 1 && spent >= 2)) delete next[a];
              else if (spent < 2) next[a] = cur + 1;
              onChange({ kind: "asi", abilities: next });
            }}>
              {SHORT[a]}{abilities[a] ? ` +${abilities[a]}` : ""}
            </span>
          ))}
          <span className="faint">{spent}/2</span>
        </div>
      ) : (
        <>
          <select value={value?.kind === "feat" ? value.featId : ""} onChange={(e) => onChange({ kind: "feat", featId: e.target.value })}>
            {Object.values(catalog.feats).sort((a, b) => a.name.localeCompare(b.name, "ru")).map((f) => {
              const unmet = f.prereq.some((p) => scores[p.ability].value < p.min);
              return (
                <option key={f.id} value={f.id} disabled={unmet}>
                  {f.name}{f.prereq.length ? ` (${f.prereq.map((p) => `${SHORT[p.ability]} ${p.min}`).join(", ")})` : ""}{f.prereqText ? " *" : ""}
                </option>
              );
            })}
          </select>
          {value?.kind === "feat" && catalog.feats[value.featId]?.prereqText && <div className="faint">Требование: {catalog.feats[value.featId].prereqText}</div>}
        </>
      )}
    </div>
  );
}

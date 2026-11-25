import type { Character } from "../../rules/character";
import { abilityShort, calc, type Calc, type Sheet } from "../../rules/derive";
import { ABILITIES, type Ability } from "../../rules/types";
import { catalog, skillById } from "../../data/catalog";
import { formatMod } from "../../rules/dice";
import { Hint, Sheet as Modal, RulesText, useExplain, usePress } from "../common";
import { rollCheck } from "../roll";
import { useState } from "react";

const FULL: Record<Ability, string> = { str: "Сила", dex: "Ловкость", con: "Телосложение", int: "Интеллект", wis: "Мудрость", cha: "Харизма" };

function StatTile({ label, value, sub, onTap, onLong, hl }: { label: string; value: string; sub?: string; onTap: () => void; onLong: () => void; hl?: boolean }) {
  const press = usePress(onTap, onLong);
  return (
    <div className={`stat${hl ? " hl" : ""}`} {...press}>
      <div className="lb">{label}</div>
      <div className="vl">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function RowRoll({ dot, label, value, sub, onTap, onLong }: { dot: string; label: string; value: number; sub?: string; onTap: () => void; onLong: () => void }) {
  const press = usePress(onTap, onLong);
  return (
    <div className="li tap" {...press}>
      <span className={`dot ${dot}`} />
      <span className="grow">
        {label} {sub && <span className="faint">{sub}</span>}
      </span>
      <span className="val">{formatMod(value)}</span>
    </div>
  );
}

export function MainTab({ c, sheet }: { c: Character; sheet: Sheet }) {
  const { setExplain, node } = useExplain();
  const [skillInfo, setSkillInfo] = useState<string | null>(null);
  const casting = sheet.casting[0];
  const tiles: { label: string; calc: Calc; signed?: boolean; roll?: () => void; note?: string }[] = [
    { label: "КД", calc: sheet.ac, note: sheet.acNote ?? undefined },
    { label: "Инициатива", calc: sheet.initiative, signed: true, roll: () => rollCheck("Инициатива", sheet.initiative) },
    { label: "Скорость", calc: sheet.speed },
    { label: "Мастерство", calc: sheet.prof, signed: true },
  ];
  const profDot = (p: string) => (p === "expert" ? "x2" : p === "prof" ? "on" : p === "half" ? "half" : "");

  return (
    <>
      <Hint id="tap-roll">Нажмите на характеристику, спасбросок или навык, чтобы бросить к20 со всеми бонусами. Долгое нажатие покажет, из чего сложилось число.</Hint>

      {sheet.warnings.length > 0 && (
        <div className="list">
          {sheet.warnings.map((w, i) => (
            <div key={i} className={w.level === "warn" ? "warn-box" : "info-box"} style={{ marginBottom: 6 }}>{w.text}</div>
          ))}
        </div>
      )}

      <div className="grid4">
        {tiles.map((t) => (
          <StatTile
            key={t.label}
            label={t.label}
            value={t.signed ? formatMod(t.calc.value) : String(t.calc.value)}
            onTap={() => (t.roll ? t.roll() : setExplain({ title: t.label, calc: t.calc, signed: t.signed, note: t.note }))}
            onLong={() => setExplain({ title: t.label, calc: t.calc, signed: t.signed, note: t.note })}
          />
        ))}
      </div>

      <div className="card">
        <h2>Характеристики</h2>
        <div className="grid6">
          {ABILITIES.map((a) => (
            <StatTile
              key={a}
              label={abilityShort(a)}
              value={formatMod(sheet.mods[a])}
              sub={String(sheet.scores[a].value)}
              hl={casting?.ability === a}
              onTap={() => rollCheck(`Проверка: ${FULL[a]}`, sheet.checkBonus[a])}
              onLong={() =>
                setExplain({
                  title: `${FULL[a]} ${sheet.scores[a].value}`,
                  calc: sheet.scores[a],
                  note: `Модификатор = (значение − 10) / 2 с округлением вниз = ${formatMod(sheet.mods[a])}`,
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Спасброски</h2>
        <div className="list">
          {ABILITIES.map((a) => (
            <RowRoll
              key={a}
              dot={sheet.saves[a].prof ? "on" : ""}
              label={FULL[a]}
              value={sheet.saves[a].calc.value}
              onTap={() => rollCheck(`Спасбросок: ${FULL[a]}`, sheet.saves[a].calc)}
              onLong={() => setExplain({ title: `Спасбросок: ${FULL[a]}`, calc: sheet.saves[a].calc, signed: true })}
            />
          ))}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="faint grow">Спасброски от смерти — на вкладке «Бой»</span>
        </div>
      </div>

      <div className="card">
        <div className="head">
          <h2>Навыки</h2>
          <span className="faint">● владение · ◐ половина · ◉ компетентность</span>
        </div>
        <div className="list">
          {catalog.ref.skills.map((s) => {
            const sk = sheet.skills[s.id];
            return (
              <RowRoll
                key={s.id}
                dot={profDot(sk.prof)}
                label={s.name}
                sub={abilityShort(sk.ability)}
                value={sk.calc.value}
                onTap={() => rollCheck(`${s.name} (${abilityShort(sk.ability)})`, sk.calc)}
                onLong={() => setSkillInfo(s.id)}
              />
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Пассивные значения</h2>
        <div className="grid3">
          <StatTile label="Внимательность" value={String(sheet.passive.perception.value)} onTap={() => setExplain({ title: "Пассивная Внимательность", calc: sheet.passive.perception })} onLong={() => setExplain({ title: "Пассивная Внимательность", calc: sheet.passive.perception })} />
          <StatTile label="Проницательность" value={String(sheet.passive.insight.value)} onTap={() => setExplain({ title: "Пассивная Проницательность", calc: sheet.passive.insight })} onLong={() => setExplain({ title: "Пассивная Проницательность", calc: sheet.passive.insight })} />
          <StatTile label="Анализ" value={String(sheet.passive.investigation.value)} onTap={() => setExplain({ title: "Пассивный Анализ", calc: sheet.passive.investigation })} onLong={() => setExplain({ title: "Пассивный Анализ", calc: sheet.passive.investigation })} />
        </div>
        <div className="faint" style={{ marginTop: 6 }}>10 + бонус проверки. Мастер сравнивает с ним Сл, когда вы не бросаете кубы.</div>
      </div>

      <div className="card">
        <h2>Владения и языки</h2>
        <ProfLine title="Доспехи" items={sheet.profNames.armor} />
        <ProfLine title="Оружие" items={sheet.profNames.weapons} />
        <ProfLine title="Инструменты" items={sheet.profNames.tools} />
        <ProfLine title="Языки" items={sheet.profNames.languages} />
      </div>

      <Modal open={!!skillInfo} onClose={() => setSkillInfo(null)} title={skillInfo ? skillById[skillInfo]?.name : ""}>
        {skillInfo && (
          <>
            <ExplainCalc calc={sheet.skills[skillInfo].calc} />
            <hr />
            <RulesText paras={skillById[skillInfo]?.desc} />
          </>
        )}
      </Modal>
      {node}
    </>
  );
}

function ExplainCalc({ calc: c }: { calc: Calc }) {
  return (
    <div className="breakdown">
      {c.parts.map((p, i) => (
        <div className="ln" key={i}><span>{p.label}</span><b>{formatMod(p.value)}</b></div>
      ))}
      <div className="ln sum"><span>Итого</span><b>{formatMod(c.value)}</b></div>
    </div>
  );
}

function ProfLine({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span className="faint">{title}: </span>
      {items.length ? items.join(", ") : <span className="faint">—</span>}
    </div>
  );
}

export { calc };

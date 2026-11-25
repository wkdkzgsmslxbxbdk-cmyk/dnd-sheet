import { useState } from "react";
import type { Character } from "../../rules/character";
import type { AttackInfo, Sheet } from "../../rules/derive";
import { catalog, conditionById, damageTypeById } from "../../data/catalog";
import { add, dice, flat, formatDice, formatMod, parseDice, rollDie } from "../../rules/dice";
import { useStore } from "../../state/store";
import { Counter, Hint, Sheet as Modal, RulesText, useExplain, usePress } from "../common";
import { rollCheck, rollDamage } from "../roll";

export function CombatTab({ c, sheet }: { c: Character; sheet: Sheet }) {
  const update = useStore((s) => s.update);
  const pushRoll = useStore((s) => s.pushRoll);
  const upd = (f: (x: Character) => void) => update(c.id, f);
  const { setExplain, node } = useExplain();
  const [amount, setAmount] = useState("");
  const [rest, setRest] = useState<null | "short" | "long">(null);
  const [condInfo, setCondInfo] = useState<string | null>(null);
  const max = sheet.hpMax.value;
  const cur = c.hp.current;
  const n = Number(amount) || 0;

  const damage = () => {
    if (!n) return;
    upd((x) => {
      let left = n;
      const fromTemp = Math.min(x.hp.temp, left);
      x.hp.temp -= fromTemp;
      left -= fromTemp;
      const before = x.hp.current;
      x.hp.current = Math.max(0, x.hp.current - left);
      // PHB: massive damage — remaining damage >= max HP means instant death
      if (before - left <= -max) x.deathSaves.fail = 3;
      if (x.concentration && n > 0) {
        /* reminder handled below */
      }
    });
    if (c.concentration) {
      const dc = Math.max(10, Math.floor(n / 2));
      rollCheck(`Концентрация: спасбросок ТЕЛ, Сл ${dc}`, sheet.saves.con.calc, { note: `Сл = 10 или половина урона (${Math.floor(n / 2)}), что больше. Провал — концентрация на «${catalog.spells[c.concentration]?.name}» прерывается.` });
    }
    setAmount("");
  };
  const heal = () => {
    if (!n) return;
    upd((x) => {
      x.hp.current = Math.min(max, x.hp.current + n);
      if (x.hp.current > 0) x.deathSaves = { ok: 0, fail: 0 };
    });
    setAmount("");
  };
  const temp = () => {
    if (!n) return;
    // PHB: temporary hit points don't stack, keep the higher
    upd((x) => (x.hp.temp = Math.max(x.hp.temp, n)));
    setAmount("");
  };

  const deathSave = () => {
    const r = rollDie(20);
    upd((x) => {
      if (r === 20) {
        x.hp.current = 1;
        x.deathSaves = { ok: 0, fail: 0 };
      } else if (r === 1) x.deathSaves.fail = Math.min(3, x.deathSaves.fail + 2);
      else if (r >= 10) x.deathSaves.ok = Math.min(3, x.deathSaves.ok + 1);
      else x.deathSaves.fail = Math.min(3, x.deathSaves.fail + 1);
    });
    pushRoll({
      label: "Спасбросок от смерти",
      dice: `к20: ${r}`,
      parts: [{ label: "к20", value: r }],
      total: r,
      crit: r === 20,
      fumble: r === 1,
      note: r === 20 ? "20: вы приходите в себя с 1 хитом." : r === 1 ? "1: два провала." : r >= 10 ? "Успех." : "Провал.",
    });
  };

  const attack = (a: AttackInfo) => {
    rollCheck(`Атака: ${a.name}`, a.toHit, {
      critFrom: a.critFrom,
      onHit: { label: "Урон", run: (crit) => rollAttackDamage(a, crit, sheet) },
    });
  };

  const pct = max ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  const down = cur <= 0;

  return (
    <>
      <Hint id="combat">Нажмите на атаку, чтобы бросить попадание. После броска появится кнопка «Урон», при критическом попадании кубы удвоятся сами.</Hint>
      <div className="card">
        <div className="head">
          <h2>Хиты</h2>
          <span className="faint" onClick={() => setExplain({ title: "Максимум хитов", calc: sheet.hpMax })} style={{ cursor: "pointer" }}>
            максимум {max} ⓘ
          </span>
        </div>
        <div className="row" style={{ alignItems: "baseline" }}>
          <span style={{ fontSize: 34, fontWeight: 700 }}>{cur}</span>
          <span className="muted">/ {max}</span>
          {c.hp.temp > 0 && <span className="pill accent">+{c.hp.temp} врем.</span>}
          <span className="grow" />
          <button className="small" onClick={() => upd((x) => (x.hp.current = max))}>Полностью</button>
        </div>
        <div className="hp-bar" style={{ margin: "6px 0 10px" }}><div className={pct < 34 ? "low" : ""} style={{ width: `${pct}%` }} /></div>
        <div className="row">
          <input inputMode="numeric" placeholder="Число" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} style={{ width: 90, flex: "none" }} />
          <button className="danger grow" onClick={damage}>Урон</button>
          <button className="grow" onClick={heal}>Лечение</button>
          <button className="grow" onClick={temp}>Временные</button>
        </div>
        {c.concentration && (
          <div className="info-box row" style={{ marginTop: 8 }}>
            <span className="grow">Концентрация: <b>{catalog.spells[c.concentration]?.name}</b></span>
            <button className="small" onClick={() => upd((x) => (x.concentration = null))}>Прервать</button>
          </div>
        )}
        {down && (
          <div style={{ marginTop: 10 }}>
            <div className="bad-box">При 0 хитов вы без сознания. В начале хода совершайте спасбросок от смерти: 10+ успех, 3 успеха — стабилизация, 3 провала — смерть.</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span>Успехи</span>
              {[0, 1, 2].map((i) => <span key={i} className={`dot ${c.deathSaves.ok > i ? "on" : ""}`} />)}
              <span style={{ marginLeft: 12 }}>Провалы</span>
              {[0, 1, 2].map((i) => <span key={i} className="dot" style={c.deathSaves.fail > i ? { background: "var(--bad)", borderColor: "var(--bad)" } : undefined} />)}
              <span className="grow" />
              <button className="primary small" onClick={deathSave}>Бросить</button>
            </div>
            {c.deathSaves.fail >= 3 && <div className="bad-box" style={{ marginTop: 6 }}>Три провала — персонаж погиб.</div>}
            {c.deathSaves.ok >= 3 && <div className="info-box" style={{ marginTop: 6 }}>Три успеха — персонаж стабилизирован.</div>}
          </div>
        )}
      </div>

      <div className="grid4">
        <Tile label="КД" value={String(sheet.ac.value)} onTap={() => setExplain({ title: "Класс Доспеха", calc: sheet.ac, note: sheet.acNote })} />
        <Tile label="Инициатива" value={formatMod(sheet.initiative.value)} onTap={() => rollCheck("Инициатива", sheet.initiative)} onLong={() => setExplain({ title: "Инициатива", calc: sheet.initiative, signed: true })} />
        <Tile label="Скорость" value={`${sheet.speed.value} фт`} onTap={() => setExplain({ title: "Скорость", calc: sheet.speed })} />
        <Tile label="Вдохновение" value={c.inspiration ? "★" : "☆"} onTap={() => upd((x) => (x.inspiration = !x.inspiration))} />
      </div>

      <div className="card">
        <div className="head">
          <h2>Атаки</h2>
          {sheet.resources.some((r) => r.id === "rage") && (
            <label className="row" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!c.toggles.rage} onChange={(e) => upd((x) => (x.toggles.rage = e.target.checked))} /> Ярость
            </label>
          )}
        </div>
        <div className="list">
          {sheet.attacks.map((a) => (
            <AttackRow key={a.uid} a={a} onTap={() => attack(a)} onLong={() => setExplain({ title: `${a.name}: бонус атаки`, calc: a.toHit, signed: true, note: <>Урон: {a.damageParts.join(" ")}. {a.notes.join(" ")}</> })} />
          ))}
        </div>
        {sheet.attacks.length <= 1 && <div className="faint">Экипируйте оружие на вкладке «Вещи», и атаки появятся здесь.</div>}
        {sheet.sneakAttack && <div className="faint" style={{ marginTop: 6 }}>Скрытая атака: {sheet.sneakAttack}, раз в ход.</div>}
        {sheet.breath && (
          <div className="li tap" onClick={() => {
            const b = sheet.breath!;
            rollDamage(`Оружие дыхания (${damageTypeById[b.type ?? ""]?.name ?? ""})`, parseDice(b.dice), { note: `Спасбросок ${b.save.toUpperCase()} Сл ${b.dc.value}, при успехе половина урона. ${b.area.type === "line" ? "Линия 5 × 30 фт" : "Конус 15 фт"}.` });
            upd((x) => (x.used["breath-weapon"] = 1));
          }}>
            <span className="grow">
              <b>Оружие дыхания</b>
              <div className="faint">{formatDice(parseDice(sheet.breath.dice))} · спас Сл {sheet.breath.dc.value}</div>
            </span>
            <span className="val">{formatDice(parseDice(sheet.breath.dice))}</span>
          </div>
        )}
      </div>

      {sheet.resources.length > 0 && (
        <div className="card">
          <h2>Ресурсы</h2>
          <div className="list">
            {sheet.resources.map((r) => (
              <div className="li" key={r.id}>
                <span className="grow">
                  {r.name} {r.die && <span className="pill accent">{r.die}</span>}
                  <div className="faint">{r.reset === "short" ? "Короткий отдых" : "Продолжительный отдых"}{r.note ? ` · ${r.note}` : ""}</div>
                </span>
                {r.unlimited ? (
                  <span className="pill good">без ограничений</span>
                ) : (
                  <>
                    <span className="faint">{r.max - r.used}/{r.max}</span>
                    <Counter value={r.max - r.used} max={r.max} onChange={(v) => upd((x) => (x.used[r.id] = r.max - v))} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Кости Хитов</h2>
        <div className="list">
          {sheet.hitDice.map((h) => (
            <div className="li" key={h.die}>
              <span className="grow">к{h.die}: осталось {h.total - h.used} из {h.total}</span>
              <button
                className="small"
                disabled={h.total - h.used <= 0}
                onClick={() => {
                  const r = rollDamage(`Кость Хитов к${h.die} + ТЕЛ`, add(dice(1, h.die), flat(sheet.mods.con)));
                  const gain = Math.max(0, r.total);
                  upd((x) => {
                    x.hitDiceUsed[h.die] = (x.hitDiceUsed[h.die] ?? 0) + 1;
                    x.hp.current = Math.min(max, x.hp.current + gain);
                  });
                }}
              >
                Потратить
              </button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="grow" onClick={() => setRest("short")}>Короткий отдых</button>
          <button className="grow" onClick={() => setRest("long")}>Продолжительный отдых</button>
        </div>
      </div>

      <div className="card">
        <div className="head">
          <h2>Состояния</h2>
          <div className="row">
            <span className="faint">Истощение</span>
            <Counter value={c.exhaustion} max={6} onChange={(v) => upd((x) => (x.exhaustion = v))} />
          </div>
        </div>
        <div className="chips">
          {catalog.ref.conditions.filter((x) => x.id !== "exhaustion").map((cd) => {
            const on = c.conditions.includes(cd.id);
            return (
              <ChipPress
                key={cd.id}
                on={on}
                label={cd.name}
                onTap={() => upd((x) => (x.conditions = on ? x.conditions.filter((y) => y !== cd.id) : [...x.conditions, cd.id]))}
                onLong={() => setCondInfo(cd.id)}
              />
            );
          })}
        </div>
        {c.exhaustion > 0 && <div className="warn-box" style={{ marginTop: 8 }}>{EXHAUSTION[c.exhaustion - 1]}</div>}
        {c.conditions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {c.conditions.map((id) => (
              <details key={id} style={{ marginBottom: 6 }}>
                <summary><b>{conditionById[id]?.name}</b></summary>
                <RulesText paras={conditionById[id]?.desc} />
              </details>
            ))}
          </div>
        )}
        <div className="faint" style={{ marginTop: 6 }}>Долгое нажатие на состояние — что оно делает.</div>
      </div>

      <RestDialog kind={rest} c={c} sheet={sheet} onClose={() => setRest(null)} />
      <Modal open={!!condInfo} onClose={() => setCondInfo(null)} title={condInfo ? conditionById[condInfo]?.name : ""}>
        {condInfo && <RulesText paras={conditionById[condInfo]?.desc} />}
      </Modal>
      {node}
    </>
  );
}

// PHB Appendix A, Exhaustion: effects are cumulative
const EXHAUSTION = [
  "1: помеха на проверки характеристик.",
  "2: помеха на проверки, скорость уменьшена вдвое.",
  "3: помеха на проверки, атаки и спасброски, скорость вдвое меньше.",
  "4: всё выше, максимум хитов уменьшен вдвое.",
  "5: всё выше, скорость 0.",
  "6: смерть.",
];

function rollAttackDamage(a: AttackInfo, crit: boolean, sheet: Sheet) {
  let expr = a.damage;
  const notes: string[] = [];
  for (const e of a.extra) {
    expr = add(expr, parseDice(e.dice));
    notes.push(`+${e.dice} ${damageTypeById[e.type]?.instr ?? ""} (${e.when})`);
  }
  // Brutal Critical: "roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack"
  const brutal = crit && a.melee ? sheet.brutalDice : 0;
  if (brutal && a.damage.dice[0]) {
    expr = add(expr, dice(brutal, a.damage.dice[0].d));
    notes.push(`Сильный критический удар: +${brutal}к${a.damage.dice[0].d}`);
  }
  rollDamage(`Урон: ${a.name}${a.damageType ? ` (${damageTypeById[a.damageType]?.name ?? ""})` : ""}`, expr, {
    crit,
    partsText: a.damageParts,
    note: [formatDice(expr), ...notes].join(" · "),
  });
}

function Tile({ label, value, onTap, onLong }: { label: string; value: string; onTap: () => void; onLong?: () => void }) {
  const press = usePress(onTap, onLong ?? onTap);
  return (
    <div className="stat" {...press}>
      <div className="lb">{label}</div>
      <div className="vl">{value}</div>
    </div>
  );
}

function AttackRow({ a, onTap, onLong }: { a: AttackInfo; onTap: () => void; onLong: () => void }) {
  const press = usePress(onTap, onLong);
  return (
    <div className="li tap" {...press}>
      <span className="grow">
        <b>{a.name}</b>
        <div className="faint">
          {formatDice(a.damage)} {a.damageType ? damageTypeById[a.damageType]?.name : ""} · {a.range}
          {a.extra.length > 0 && ` · +${a.extra.map((e) => e.dice).join(" +")}`}
          {!a.proficient && " · без владения"}
        </div>
      </span>
      <span className="val">{formatMod(a.toHit.value)}</span>
    </div>
  );
}

function ChipPress({ on, label, onTap, onLong }: { on: boolean; label: string; onTap: () => void; onLong: () => void }) {
  const press = usePress(onTap, onLong);
  return <span className={`chip${on ? " on" : ""}`} {...press}>{label}</span>;
}

function RestDialog({ kind, c, sheet, onClose }: { kind: null | "short" | "long"; c: Character; sheet: Sheet; onClose: () => void }) {
  const update = useStore((s) => s.update);
  if (!kind) return null;
  const apply = () => {
    update(c.id, (x) => {
      for (const r of sheet.resources) {
        if (r.reset === "short" || kind === "long") delete x.used[r.id];
      }
      x.pactUsed = 0;
      if (kind === "long") {
        x.hp.current = sheet.hpMax.value;
        x.slotsUsed = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        x.deathSaves = { ok: 0, fail: 0 };
        // PHB: regain spent Hit Dice up to half of total (minimum 1)
        let regain = Math.max(1, Math.floor(sheet.level / 2));
        for (const h of sheet.hitDice) {
          const back = Math.min(regain, x.hitDiceUsed[h.die] ?? 0);
          x.hitDiceUsed[h.die] = (x.hitDiceUsed[h.die] ?? 0) - back;
          regain -= back;
        }
        if (x.exhaustion > 0) x.exhaustion -= 1;
      }
    });
    onClose();
  };
  const restored = sheet.resources.filter((r) => r.reset === "short" || kind === "long").map((r) => r.name);
  if (sheet.pact) restored.push("ячейки колдуна");
  return (
    <Modal open onClose={onClose} title={kind === "short" ? "Короткий отдых" : "Продолжительный отдых"}>
      {kind === "short" ? (
        <p className="muted">Минимум 1 час. Можно тратить Кости Хитов: каждая восстанавливает кость + модификатор ТЕЛ хитов. Кнопки «Потратить» — в блоке «Кости Хитов».</p>
      ) : (
        <p className="muted">Минимум 8 часов, не чаще раза в 24 часа. Хиты восстанавливаются полностью, возвращается половина Костей Хитов (минимум 1), все ячейки заклинаний, истощение уменьшается на 1.</p>
      )}
      <div className="faint" style={{ marginBottom: 10 }}>Восстановится: {restored.length ? restored.join(", ") : "ничего из ресурсов"}{kind === "long" ? ", хиты, ячейки заклинаний" : ""}.</div>
      <button className="primary" style={{ width: "100%" }} onClick={apply}>Отдохнуть</button>
    </Modal>
  );
}

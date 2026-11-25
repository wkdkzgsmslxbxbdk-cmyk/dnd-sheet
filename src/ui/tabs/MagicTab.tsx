import { useMemo, useState } from "react";
import type { Character } from "../../rules/character";
import type { Sheet, SpellcastingInfo } from "../../rules/derive";
import { abilityShort } from "../../rules/derive";
import type { Spell } from "../../rules/types";
import { catalog, damageTypeById, schoolById } from "../../data/catalog";
import { average, formatDice, formatMod, hitChance } from "../../rules/dice";
import { computeSpell, effectTotal, type SpellEffect } from "../../rules/spellcalc";
import { useStore } from "../../state/store";
import { Hint, Sheet as Modal, RulesText, plural, srcLabel, useExplain, UntranslatedBadge } from "../common";
import { rollCheck, rollDamage } from "../roll";
import { bookLabel } from "./FeaturesTab";

const LEVEL_NAME = (l: number) => (l === 0 ? "Заговоры" : `${l} уровень`);
const PREPARE_ALL = new Set(["cleric", "druid", "paladin"]); // prepare from the whole class list
const COUNT_FORMS: Record<string, [string, string, string]> = { луч: ["луч", "луча", "лучей"], снаряд: ["снаряд", "снаряда", "снарядов"] };

interface ListedSpell {
  spell: Spell;
  classId: string;
  prepared: boolean;
  always: boolean;
  note?: string;
  fixedSlot?: number;
  resourceId?: string;
}

export function MagicTab({ c, sheet }: { c: Character; sheet: Sheet }) {
  const update = useStore((s) => s.update);
  const upd = (f: (x: Character) => void) => update(c.id, f);
  const { setExplain, node } = useExplain();
  const [open, setOpen] = useState<ListedSpell | null>(null);
  const [browse, setBrowse] = useState<SpellcastingInfo | null>(null);

  const isGranted = (id: string) => id === "race" || id.startsWith("owner:");
  const classCasters = sheet.casting.filter((k) => !isGranted(k.classId));
  const listed = useMemo(() => {
    const out: ListedSpell[] = [];
    const seen = new Set<string>();
    // always-prepared subclass spells (domain / circle spells)
    for (const e of c.classes) {
      const sub = e.subclassId ? catalog.subclasses[e.subclassId] : null;
      if (sub?.spellMode === "expanded") continue; // patron lists only widen the class list
      for (const s of sub?.spells ?? []) {
        const sp = catalog.spells[s.spell];
        if (sp && e.level >= s.level && !seen.has(sp.id)) {
          seen.add(sp.id);
          out.push({ spell: sp, classId: e.classId, prepared: true, always: true, note: `${sub!.name}: всегда подготовлено` });
        }
      }
    }
    for (const k of c.spells) {
      const sp = catalog.spells[k.id];
      if (!sp || seen.has(sp.id)) continue;
      seen.add(sp.id);
      out.push({ spell: sp, classId: k.classId, prepared: k.prepared, always: false });
    }
    for (const r of sheet.racialSpells) {
      const sp = catalog.spells[r.spellId];
      if (!sp || seen.has(sp.id)) continue;
      seen.add(sp.id);
      out.push({ spell: sp, classId: r.classId ?? "race", prepared: true, always: true, note: r.note, fixedSlot: r.fixedSlot, resourceId: r.resourceId });
    }
    return out.sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name, "ru"));
  }, [c, sheet]);

  if (!sheet.casting.length) {
    return (
      <div className="empty">
        <h2 style={{ marginBottom: 6 }}>Нет заклинаний</h2>
        Ваш класс пока не накладывает заклинания. У паладина и следопыта они появляются со 2 уровня.
      </div>
    );
  }

  const byLevel = new Map<number, ListedSpell[]>();
  for (const l of listed) byLevel.set(l.spell.level, [...(byLevel.get(l.spell.level) ?? []), l]);

  return (
    <>
      <Hint id="magic">Нажмите на заклинание: урон, лечение, Сл и атака уже посчитаны от ваших характеристик. Выберите ячейку, и числа пересчитаются.</Hint>

      {sheet.casting.map((k) => {
        // a race/feat caster with nothing granted yet (high-elf cantrip not picked) is just noise
        if (isGranted(k.classId) && !listed.some((l) => l.classId === k.classId)) return null;
        const mine = listed.filter((l) => l.classId === k.classId && !l.always);
        const cantrips = mine.filter((l) => l.spell.level === 0).length;
        const leveled = mine.filter((l) => l.spell.level > 0);
        const prepared = leveled.filter((l) => l.prepared).length;
        return (
          <div className="card" key={k.classId}>
            <div className="head">
              <h2>{k.className}</h2>
              <span className="pill accent">{abilityShort(k.ability)}</span>
            </div>
            <div className="grid2">
              <div className="stat" onClick={() => setExplain({ title: "Сл спасброска от заклинаний", calc: k.dc })}>
                <div className="lb">Сл спасброска</div>
                <div className="vl">{k.dc.value}</div>
              </div>
              <div className="stat" onClick={() => rollCheck(`Атака заклинанием (${k.className})`, k.attack)} onContextMenu={(e) => { e.preventDefault(); setExplain({ title: "Бонус атаки заклинанием", calc: k.attack, signed: true }); }}>
                <div className="lb">Атака</div>
                <div className="vl">{formatMod(k.attack.value)}</div>
              </div>
            </div>
            {!isGranted(k.classId) && (
              <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
                {k.cantrips > 0 && <span className={`pill ${cantrips > k.cantrips ? "bad" : cantrips === k.cantrips ? "good" : ""}`}>Заговоры {cantrips}/{k.cantrips}</span>}
                {k.prepared && <span className={`pill ${prepared > k.prepared.value ? "bad" : prepared === k.prepared.value ? "good" : ""}`} onClick={() => setExplain({ title: "Сколько можно подготовить", calc: k.prepared! })}>Подготовлено {prepared}/{k.prepared.value}</span>}
                {k.known != null && <span className={`pill ${leveled.length > k.known ? "bad" : leveled.length === k.known ? "good" : ""}`}>Известно {leveled.length}/{k.known}</span>}
                {k.classId === "wizard" && <span className="pill">В книге заклинаний: {leveled.length}</span>}
                <span className="grow" />
                <button className="small" onClick={() => setBrowse(k)}>+ Заклинания</button>
              </div>
            )}
            {isGranted(k.classId) && <div className="faint" style={{ marginTop: 6 }}>{k.classId === "race" ? "Расовая магия" : "Заклинания от умения, расы или черты"}</div>}
          </div>
        );
      })}

      {c.concentration && catalog.spells[c.concentration] && (
        <div className="info-box row">
          <span className="grow">Концентрация: <b>{catalog.spells[c.concentration].name}</b></span>
          <button className="small" onClick={() => upd((x) => (x.concentration = null))}>Прервать</button>
        </div>
      )}

      {(sheet.slots.some((n) => n > 0) || sheet.pact) && (
        <div className="card">
          <h2>Ячейки</h2>
          <div className="list">
            {sheet.slots.map((n, i) =>
              n > 0 ? (
                <div className="li" key={i}>
                  <span style={{ width: 70 }}>{i + 1} уровень</span>
                  <div className="slots grow">
                    {Array.from({ length: n }, (_, j) => (
                      <button
                        key={j}
                        className={`slot${j < (c.slotsUsed[i] ?? 0) ? " used" : ""}`}
                        aria-label={`Ячейка ${i + 1} уровня`}
                        onClick={() => upd((x) => (x.slotsUsed[i] = j < (x.slotsUsed[i] ?? 0) ? j : j + 1))}
                      />
                    ))}
                  </div>
                  <span className="faint">{n - (c.slotsUsed[i] ?? 0)}/{n}</span>
                </div>
              ) : null,
            )}
            {sheet.pact && (
              <div className="li">
                <span style={{ width: 70 }}>Договор</span>
                <div className="slots grow">
                  {Array.from({ length: sheet.pact.count }, (_, j) => (
                    <button key={j} className={`slot${j < c.pactUsed ? " used" : ""}`} onClick={() => upd((x) => (x.pactUsed = j < x.pactUsed ? j : j + 1))} />
                  ))}
                </div>
                <span className="faint">{sheet.pact.level} ур. · короткий отдых</span>
              </div>
            )}
          </div>
          <div className="faint" style={{ marginTop: 4 }}>Нажмите на ячейку, чтобы отметить её потраченной. Продолжительный отдых возвращает все.</div>
        </div>
      )}

      {listed.length === 0 && <div className="empty">Добавьте заклинания кнопкой «+ Заклинания».</div>}
      {[...byLevel.entries()].map(([lv, items]) => (
        <div className="card" key={lv}>
          <h2>{LEVEL_NAME(lv)}</h2>
          <div className="list">
            {items.map((l) => {
              const r = computeSpell(l.spell, c, sheet, { classId: l.classId, slot: l.fixedSlot });
              const main = r.effects[0];
              return (
                <div className="li tap" key={l.spell.id} onClick={() => setOpen(l)}>
                  {l.spell.level > 0 && !l.always && (
                    <input
                      type="checkbox"
                      title="Подготовлено"
                      checked={l.prepared}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => upd((x) => { const s = x.spells.find((y) => y.id === l.spell.id); if (s) s.prepared = e.target.checked; })}
                    />
                  )}
                  <span className="grow">
                    <b style={{ opacity: l.prepared || l.spell.level === 0 ? 1 : 0.55 }}>{l.spell.name}</b>{" "}
                    {l.spell.conc && (c.concentration === l.spell.id ? <span className="pill accent">концентрация</span> : <span className="pill" title="Концентрация">К</span>)}{" "}
                    {l.spell.ritual && <span className="pill" title="Ритуал">Р</span>}
                    <div className="faint">
                      {l.spell.cast} · {l.spell.range}
                      {r.save && ` · спас ${abilityShort(r.save.ability)} Сл ${r.save.dc.value}`}
                      {r.attack && ` · атака ${formatMod(r.attack.value)}`}
                      {l.note && ` · ${l.note}`}
                    </div>
                  </span>
                  {main && <span className="val" style={{ fontSize: 13 }}>{effectShort(main)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {open && <SpellCard l={open} c={c} sheet={sheet} onClose={() => setOpen(null)} />}
      {browse && <SpellBrowser caster={browse} c={c} onClose={() => setBrowse(null)} />}
      {classCasters.length === 0 && null}
      {node}
    </>
  );
}

function effectShort(e: SpellEffect) {
  const one = formatDice(e.expr);
  return e.count > 1 ? `${e.count}×${one}` : one;
}

const KIND_RU: Record<string, string> = {
  damage: "Урон", heal: "Лечение", temp: "Временные хиты", hpmax: "Максимум хитов", pool: "Хиты существ", rider: "Доп. урон",
};

export function SpellCard({ l, c, sheet, onClose }: { l: ListedSpell; c: Character; sheet: Sheet; onClose: () => void }) {
  const update = useStore((s) => s.update);
  const [slot, setSlot] = useState<number | undefined>(l.fixedSlot);
  const [targetAc, setTargetAc] = useState("");
  const sp = l.spell;
  const r = computeSpell(sp, c, sheet, { classId: l.classId, slot: l.fixedSlot ?? slot });
  const slotsLeft = (lv: number) => (sheet.slots[lv - 1] ?? 0) - (c.slotsUsed[lv - 1] ?? 0);
  const pactLeft = sheet.pact ? sheet.pact.count - c.pactUsed : 0;
  const usePact = l.classId === "warlock" && sheet.pact && r.slot === sheet.pact.level && pactLeft > 0;
  const canCast = sp.level === 0 || l.resourceId ? true : usePact || slotsLeft(r.slot) > 0;
  const ac = Number(targetAc) || 0;

  const cast = () => {
    update(c.id, (x) => {
      if (l.resourceId) x.used[l.resourceId] = (x.used[l.resourceId] ?? 0) + 1;
      else if (sp.level > 0) {
        if (usePact) x.pactUsed += 1;
        else x.slotsUsed[r.slot - 1] = (x.slotsUsed[r.slot - 1] ?? 0) + 1;
      }
      if (sp.conc) x.concentration = sp.id;
    });
  };

  const rollEffect = (e: SpellEffect, crit = false) => {
    const total = effectTotal(e);
    rollDamage(`${KIND_RU[e.kind]}: ${sp.name}${e.type ? ` (${damageTypeById[e.type]?.name ?? ""})` : ""}`, total, {
      crit,
      note: [e.count > 1 ? `${e.count} × (${formatDice(e.expr)})` : formatDice(e.expr), e.note].filter(Boolean).join(" · "),
    });
  };

  return (
    <Modal open onClose={onClose} title={<>{sp.name} <UntranslatedBadge tr={sp.tr} /></>}>
      <div className="faint" style={{ marginBottom: 8 }}>
        {sp.level === 0 ? "Заговор" : `${sp.level} уровень`}, {schoolById[sp.school]?.name?.toLowerCase()}
        {sp.ritual && " (ритуал)"} · {sp.cast} · {sp.range} · {sp.comp.join(", ")}
        {sp.mat ? ` (${sp.mat})` : ""} · {sp.conc ? `Концентрация, ${sp.dur}` : sp.dur}
        {sp.aoe && ` · ${sp.aoe.name} ${sp.aoe.size} фт`}
      </div>

      {sp.level > 0 && !l.fixedSlot && r.slotOptions.length > 1 && (
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <span className="faint">Ячейка</span>
          <div className="seg">
            {r.slotOptions.map((s) => (
              <button key={s} className={s === r.slot ? "on" : ""} onClick={() => setSlot(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid2" style={{ marginBottom: 10 }}>
        {r.save && (
          <div className="stat">
            <div className="lb">Спасбросок {abilityShort(r.save.ability)}</div>
            <div className="vl">Сл {r.save.dc.value}</div>
            <div className="sub">{r.save.success === "half" ? "успех — половина" : r.save.success === "none" ? "успех — без эффекта" : "см. описание"}</div>
          </div>
        )}
        {r.attack && (
          <div className="stat" onClick={() => rollCheck(`Атака: ${sp.name}`, r.attack!, { onHit: r.effects[0] ? { label: "Урон", run: (crit) => rollEffect(r.effects[0], crit) } : undefined })}>
            <div className="lb">Атака заклинанием</div>
            <div className="vl">{formatMod(r.attack.value)}</div>
            <div className="sub">нажмите, чтобы бросить</div>
          </div>
        )}
        {r.effects.map((e, i) => (
          <div className="stat hl" key={i} onClick={() => rollEffect(e)}>
            <div className="lb">{KIND_RU[e.kind]}{e.type ? ` ${damageTypeById[e.type]?.instr ?? ""}` : ""}</div>
            <div className="vl">{e.count > 1 ? `${e.count} × ${formatDice(e.expr)}` : formatDice(e.expr)}</div>
            <div className="sub">
              {e.count > 1 && `${e.count} ${plural(e.count, COUNT_FORMS[e.countLabel ?? "луч"] ?? ["раз", "раза", "раз"])}, `}
              в среднем {fmt(average(effectTotal(e)))}
            </div>
          </div>
        ))}
      </div>

      {r.effects.length > 0 && (
        <div className="breakdown" style={{ marginBottom: 10 }}>
          {r.effects.map((e, i) => (
            <div className="ln" key={i}>
              <span>{KIND_RU[e.kind]}{e.note ? ` (${e.note})` : ""}</span>
              <b>{e.parts.join(" ")}</b>
            </div>
          ))}
          {r.cite && <div className="faint" style={{ marginTop: 4 }}>Правило по тексту SRD: «{r.cite}»</div>}
        </div>
      )}

      {r.attack && r.effects[0]?.kind === "damage" && (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="faint">КД цели</span>
          <input inputMode="numeric" style={{ width: 70 }} value={targetAc} onChange={(e) => setTargetAc(e.target.value.replace(/\D/g, ""))} placeholder="15" />
          {ac > 0 && (
            <span className="faint">
              шанс попасть {Math.round(hitChance(r.attack.value, ac) * 100)}%, ожидаемый урон ≈ {fmt(hitChance(r.attack.value, ac) * average(effectTotal(r.effects[0])))}
            </span>
          )}
        </div>
      )}

      {r.notes.map((n, i) => (
        <div className="info-box" key={i} style={{ marginBottom: 6 }}>{n}</div>
      ))}

      <button className="primary" style={{ width: "100%", marginBottom: 12 }} disabled={!canCast} onClick={() => { cast(); onClose(); }}>
        {sp.level === 0 ? "Наложить" : l.resourceId ? "Наложить (особенность расы)" : canCast ? `Наложить, ячейка ${r.slot} уровня${usePact ? " (договор)" : ""}` : `Нет ячеек ${r.slot} уровня`}
        {sp.conc ? " · концентрация" : ""}
      </button>

      <RulesText paras={sp.desc} />
      {sp.higher && (
        <>
          <h4 style={{ margin: "8px 0 4px" }}>На больших уровнях</h4>
          <RulesText paras={sp.higher} />
        </>
      )}
      <div className="faint">
        Классы: {sp.classes.map((x) => catalog.classes[x]?.name).join(", ")}
        {srcLabel(sp.src) && ` · ${srcLabel(sp.src)}`}
        {` · ${sp.en}`}
      </div>
    </Modal>
  );
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

export function SpellBrowser({ caster, c, onClose }: { caster: SpellcastingInfo; c: Character; onClose: () => void }) {
  const update = useStore((s) => s.update);
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState<number | "all">("all");
  const classId = caster.classId;
  // highest spell level this class can take; wizards learn up to the slot level they have
  const maxLevel = Math.max(caster.maxLevel, 0);
  const mine = new Set(c.spells.filter((s) => s.classId === classId).map((s) => s.id));
  // the class list (Eldritch Knight / Arcane Trickster learn from the wizard list) + a patron's expanded list
  const listClass = caster.list ?? classId;
  const entry = c.classes.find((e) => e.classId === classId);
  const sub = entry?.subclassId ? catalog.subclasses[entry.subclassId] : null;
  const expanded = new Set(sub?.spellMode === "expanded" ? sub.spells.filter((s) => s.level <= (entry?.level ?? 0)).map((s) => s.spell) : []);
  const list = catalog.spellList
    .filter((s) => (s.classes.includes(listClass) || expanded.has(s.id)) && s.level <= maxLevel && (s.level > 0 || caster.cantrips > 0))
    .filter((s) => lvl === "all" || s.level === lvl)
    .filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.en.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru"));
  const toggle = (s: Spell) =>
    update(c.id, (x) => {
      const i = x.spells.findIndex((y) => y.id === s.id && y.classId === classId);
      if (i >= 0) x.spells.splice(i, 1);
      // prepared casters add straight to prepared; wizard adds to the spellbook first
      else x.spells.push({ id: s.id, classId, prepared: s.level === 0 || classId !== "wizard" });
    });
  const levels = Array.from({ length: maxLevel + 1 }, (_, i) => i).filter((i) => i > 0 || caster.cantrips > 0);
  return (
    <Modal open onClose={onClose} title={`Заклинания: ${caster.className}`}>
      <div className="search">
        <input placeholder="Поиск по названию" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" style={{ marginTop: 8 }}>
          <span className={`chip${lvl === "all" ? " on" : ""}`} onClick={() => setLvl("all")}>Все</span>
          {levels.map((i) => (
            <span key={i} className={`chip${lvl === i ? " on" : ""}`} onClick={() => setLvl(i)}>{i === 0 ? "Заговоры" : i}</span>
          ))}
        </div>
        <div className="faint" style={{ marginTop: 6 }}>
          {PREPARE_ALL.has(classId)
            ? "Вы готовите заклинания из всего списка класса после продолжительного отдыха. Отмеченные здесь — подготовленные."
            : classId === "wizard"
              ? "Отмеченные — в вашей книге заклинаний. Подготовленные выбираются галочкой в списке."
              : "Отмеченные — известные вам заклинания."}
          {" "}Доступны уровни до {maxLevel}.
        </div>
      </div>
      <div className="list">
        {list.map((s) => (
          <div className="li tap" key={s.id} onClick={() => toggle(s)}>
            <input type="checkbox" readOnly checked={mine.has(s.id)} />
            <span className="grow">
              {s.name} <span className="faint">{s.level === 0 ? "заговор" : `${s.level} ур.`} · {schoolById[s.school]?.name}{s.source && s.source !== "srd" ? ` · ${bookLabel(s.source)}` : ""}{expanded.has(s.id) ? " · покровитель" : ""}</span>
              {s.conc && <span className="pill" style={{ marginLeft: 4 }}>К</span>}
            </span>
          </div>
        ))}
        {list.length === 0 && <div className="faint">Ничего не найдено</div>}
      </div>
    </Modal>
  );
}

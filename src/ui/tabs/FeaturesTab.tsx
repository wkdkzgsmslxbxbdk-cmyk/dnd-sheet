import { useState } from "react";
import type { Character } from "../../rules/character";
import { optionalKey, type Sheet } from "../../rules/derive";
import { ABILITIES, type Feature } from "../../rules/types";
import { catalog, skillById } from "../../data/catalog";
import { CHOICE_KINDS, choiceKey, countAt, type Effect, type EffectOwner } from "../../rules/effects";
import { useStore } from "../../state/store";
import { Sheet as Modal, RulesText, srcLabel, UntranslatedBadge } from "../common";
import { Avatar } from "../Avatar";
import { LookStep } from "../Wizard";

/** Features whose title is only a pointer ("Path feature", "Ability Score Improvement") are folded */
const isStub = (f: Feature) => /improvement-\d$|ability-score-improvement/.test(f.id) || /feature$/i.test(f.en);
const ABILITY_RU: Record<string, string> = { str: "СИЛ", dex: "ЛОВ", con: "ТЕЛ", int: "ИНТ", wis: "МДР", cha: "ХАР" };
const BOOK_RU: Record<string, string> = { srd: "SRD", phb: "КИ", xge: "Занатар", tce: "Таша", scag: "ППМ", eepc: "СЗ", vgm: "Воло", mtf: "Морденкайнен", dmg: "РМ" };
export const bookLabel = (s?: string) => (s ? BOOK_RU[s] ?? s : "");

const clevelOf = (c: Character, classId: string) => c.classes.find((e) => e.classId === classId)?.level ?? 0;

/** How many option picks are still missing on an owner (feature / trait / feat / background) */
export function pendingChoices(owner: { id: string; effects?: Effect[] }, c: Character): number {
  return (owner.effects ?? []).reduce((s, e, i) => (CHOICE_KINDS.has(e.k) ? s + Math.max(0, (e as { n: number }).n - (c.choices[choiceKey(owner.id, i)] ?? []).length) : s), 0);
}

export function FeaturesTab({ c, sheet }: { c: Character; sheet: Sheet }) {
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState<{ f: Feature; classId: string } | null>(null);
  const [traitOpen, setTraitOpen] = useState<string | null>(null);
  const [featOpen, setFeatOpen] = useState<string | null>(null);
  const setChoice = (id: string, values: string[]) => update(c.id, (x) => (x.choices[id] = values));

  const optionIds = new Set(sheet.features.flatMap((f) => c.choices[f.feature.id] ?? []));  const visible = sheet.features.filter((f) => !optionIds.has(f.feature.id) && !isStub(f.feature));
  const byClass = new Map<string, typeof visible>();
  for (const f of visible) byClass.set(f.classId, [...(byClass.get(f.classId) ?? []), f]);

  const race = catalog.races[c.raceId];
  const bg = c.backgroundId ? catalog.backgrounds[c.backgroundId] : null;

  return (
    <>
      <AboutCard c={c} />
      {sheet.toggles.length > 0 && (
        <div className="card">
          <h2>Состояния умений</h2>
          {sheet.toggles.map((t) => (
            <label key={t.id} className="li row" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!c.toggles[t.id]} onChange={(e) => update(c.id, (x) => (x.toggles[t.id] = e.target.checked))} />
              <span className="grow">{t.name} <span className="faint">{t.source}</span></span>
            </label>
          ))}
          <div className="faint">Включите, когда умение активно, и его бонусы учтутся в листе.</div>
        </div>
      )}

      {[...byClass.entries()].map(([classId, list]) => (
        <div className="card" key={classId}>
          <h2>{catalog.classes[classId]?.name}</h2>
          <div className="list">
            {list.sort((a, b) => a.feature.level - b.feature.level).map(({ feature: f }) => {
              const picked = c.choices[f.id] ?? [];
              const need = needCount(f, c) - picked.length + pendingChoices(f, c);
              return (
                <div className="li tap" key={f.id} onClick={() => setOpen({ f, classId })}>
                  <span className="pill" style={{ minWidth: 34, justifyContent: "center" }}>{f.level}</span>
                  <span className="grow">
                    {f.name} {!f.tr && <UntranslatedBadge tr={false} />}
                    {picked.length > 0 && <div className="faint">{picked.map((p) => optionName(p)).join(", ")}</div>}
                  </span>
                  {f.effects?.length ? <span className="pill good" title="Учтено в расчётах">⚙</span> : null}
                  {need > 0 && <span className="pill warn">выбрать</span>}
                </div>
              );
            })}
          </div>
          <OptionalFeatures classId={classId} c={c} />
        </div>
      ))}

      <div className="card">
        <h2>Раса: {race?.name}{c.subraceId ? `, ${catalog.subraces[c.subraceId]?.name}` : ""}</h2>
        <div className="list">
          {sheet.traits.filter((t) => !t.parent).map((t) => {
            const needs = Boolean(t.options || t.spellOptions || t.profChoice);
            const picked = c.choices[t.id] ?? [];
            const pending = (needs && !picked.length ? 1 : 0) + pendingChoices(t, c);
            return (
              <div className="li tap" key={t.id} onClick={() => setTraitOpen(t.id)}>
                <span className="grow">
                  {t.name}
                  {picked.length > 0 && <div className="faint">{picked.map((p) => catalog.traits[p]?.name ?? catalog.spells[p]?.name ?? p).join(", ")}</div>}
                </span>
                {t.effects?.length ? <span className="pill good" title="Учтено в расчётах">⚙</span> : null}
                {pending > 0 && <span className="pill warn">выбрать</span>}
              </div>
            );
          })}
        </div>
        {(sheet.senses.length > 0 || sheet.resists.length > 0 || Object.keys(sheet.otherSpeeds).length > 0) && (
          <div className="faint" style={{ marginTop: 6 }}>
            {sheet.senses.map((s) => `${s.name} ${s.range} фт`).join(", ")}
            {sheet.resists.length > 0 && ` · сопротивление: ${sheet.resists.map((r) => catalog.ref.damageTypes.find((d) => d.id === r)?.name ?? r).join(", ")}`}
            {Object.entries(sheet.otherSpeeds).map(([m, v]) => ` · ${({ fly: "полёт", swim: "плавание", climb: "лазание", burrow: "копание" } as Record<string, string>)[m] ?? m} ${v} фт`).join("")}
          </div>
        )}
        {sheet.breath && (
          <div className="info-box" style={{ marginTop: 8 }}>
            Оружие дыхания: {sheet.breath.dice.replace("d", "к")} · спасбросок {ABILITY_RU[sheet.breath.save]} Сл {sheet.breath.dc.value} · бросок на вкладке «Бой».
          </div>
        )}
      </div>

      {sheet.feats.length > 0 && (
        <div className="card">
          <h2>Черты</h2>
          <div className="list">
            {sheet.feats.map((f) => (
              <div className="li tap" key={f.id} onClick={() => setFeatOpen(f.id)}>
                <span className="grow">{f.name} <span className="faint">{bookLabel(f.source)}</span></span>
                {f.effects?.length ? <span className="pill good">⚙</span> : null}
                {pendingChoices({ id: `feat:${f.id}`, effects: f.effects }, c) > 0 && <span className="pill warn">выбрать</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {bg && (
        <div className="card">
          <h2>Предыстория: {bg.name}</h2>
          {bg.effects?.length ? <EffectChoices owner={{ id: bg.id, name: bg.name, effects: bg.effects }} c={c} sheet={sheet} /> : null}
          <b>{bg.feature.name}</b>
          <RulesText paras={bg.feature.desc} />
        </div>
      )}

      {open && <FeatureSheet f={open.f} classId={open.classId} c={c} sheet={sheet} onClose={() => setOpen(null)} setChoice={setChoice} />}
      {traitOpen && <TraitSheet id={traitOpen} c={c} sheet={sheet} onClose={() => setTraitOpen(null)} setChoice={setChoice} />}
      {featOpen && (
        <Modal open onClose={() => setFeatOpen(null)} title={catalog.feats[featOpen]?.name}>
          {catalog.feats[featOpen]?.prereqText && <div className="faint">Требование: {catalog.feats[featOpen].prereqText}</div>}
          <RulesText paras={catalog.feats[featOpen]?.desc} />
          <EffectChoices owner={{ id: `feat:${featOpen}`, name: catalog.feats[featOpen]?.name ?? "", effects: catalog.feats[featOpen]?.effects ?? [] }} c={c} sheet={sheet} />
          <div className="faint">{srcLabel(catalog.feats[featOpen]?.src as string | undefined)}</div>
        </Modal>
      )}
    </>
  );
}

const AP_LABEL: Record<string, string> = { age: "Возраст", height: "Рост", weight: "Вес", eyes: "Глаза", hair: "Волосы", skin: "Кожа" };
const ST_LABEL: Record<string, string> = { personality: "Черты характера", ideals: "Идеалы", bonds: "Привязанности", flaws: "Слабости", history: "История" };

/** Portrait, appearance and story — editable with the wizard's appearance step */
function AboutCard({ c }: { c: Character }) {
  const update = useStore((s) => s.update);
  const [edit, setEdit] = useState(false);
  const ap = Object.entries(c.appearance ?? {}).filter(([, v]) => v);
  const st = Object.entries(c.story ?? {}).filter(([, v]) => v);
  const align = catalog.ref.alignments.find((a) => a.id === c.alignment)?.name;
  return (
    <div className="card">
      <div className="row" style={{ gap: 12 }}>
        <Avatar c={c} size={56} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2>{c.name || "Без имени"}</h2>
          <div className="faint">{[align, ...ap.map(([k, v]) => `${AP_LABEL[k]}: ${v}`)].filter(Boolean).join(" · ") || "Внешность не заполнена"}</div>
        </div>
        <button className="small" onClick={() => setEdit(true)}>Изменить</button>
      </div>
      {st.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="faint">Характер и история</summary>
          {st.map(([k, v]) => <p key={k} style={{ margin: "6px 0" }}><b>{ST_LABEL[k]}.</b> {v}</p>)}
        </details>
      )}
      {edit && (
        <Modal open onClose={() => setEdit(false)} title="О персонаже">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <LookStep c={c} upd={(f) => update(c.id, f)} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Tasha's optional class features: off by default, the player (and the DM) decides */
function OptionalFeatures({ classId, c }: { classId: string; c: Character }) {
  const update = useStore((s) => s.update);
  const [info, setInfo] = useState<Feature | null>(null);
  const list = Object.values(catalog.features).filter((f) => f.optional && f.class === classId).sort((a, b) => a.level - b.level);
  if (!list.length) return null;
  const key = optionalKey(classId);
  const on = new Set(c.choices[key] ?? []);
  const cl = clevelOf(c, classId);
  return (
    <details style={{ marginTop: 8 }}>
      <summary className="faint">Необязательные умения класса ({list.filter((f) => on.has(f.id)).length} включено)</summary>
      <div className="faint" style={{ margin: "4px 0" }}>Из «Котла Таши». Включайте с согласия Мастера; некоторые заменяют обычные умения.</div>
      <div className="list">
        {list.map((f) => (
          <div className="li" key={f.id}>
            <input
              type="checkbox"
              checked={on.has(f.id)}
              onChange={() => update(c.id, (x) => {
                const cur = new Set(x.choices[key] ?? []);
                if (cur.has(f.id)) cur.delete(f.id);
                else cur.add(f.id);
                x.choices[key] = [...cur];
              })}
            />
            <span className="grow tap" onClick={() => setInfo(f)} style={{ opacity: f.level > cl ? 0.5 : 1 }}>
              {f.name} <span className="faint">{f.level} ур.{f.level > cl ? " — ещё не доступно" : ""}</span>
            </span>
          </div>
        ))}
      </div>
      {info && (
        <Modal open onClose={() => setInfo(null)} title={info.name}>
          <RulesText paras={info.desc} />
          <div className="faint">{srcLabel(info.src)}</div>
        </Modal>
      )}
    </details>
  );
}

function optionName(id: string) {
  const f = catalog.features[id];
  if (f) return f.name.replace(/^[^:]+:\s*/, "");
  return skillById[id]?.name ?? (id === "thieves-tools" ? "Воровские инструменты" : id);
}

function needCount(f: Feature, c: Character): number {
  if (f.invocations) return catalog.classes.warlock.levels[clevelOf(c, "warlock") - 1]?.cs?.invocations_known ?? 0;
  if (f.choice?.kind === "feature" && f.choice.options?.length) return countAt(f.choice.n, clevelOf(c, f.class));
  if (f.choice?.kind === "expertise") return 2;
  return 0;
}

/** Pickers for every choice an effect owner asks for (skills, tools, languages, abilities, feats) */
export function EffectChoices({ owner, c, sheet }: { owner: EffectOwner; c: Character; sheet: Sheet }) {
  const update = useStore((s) => s.update);
  const blocks = owner.effects
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => CHOICE_KINDS.has(e.k));
  if (!blocks.length) return null;
  return (
    <div style={{ margin: "8px 0" }}>
      {blocks.map(({ e, i }) => {
        const key = choiceKey(owner.id, i);
        const picked = c.choices[key] ?? [];
        const n = (e as { n: number }).n;
        let options: { id: string; name: string; disabled?: boolean }[] = [];
        let title = "";
        if (e.k === "skillChoice") {
          title = "Навыки";
          options = catalog.ref.skills.filter((s) => !e.from || e.from.includes(s.id)).map((s) => ({ id: s.id, name: s.name }));
        } else if (e.k === "expertiseChoice") {
          title = "Компетентность";
          options = catalog.ref.skills
            .filter((s) => (!e.from || e.from.includes(s.id)) && (sheet.skills[s.id].prof !== "none" && sheet.skills[s.id].prof !== "half"))
            .map((s) => ({ id: s.id, name: s.name }));
        } else if (e.k === "toolChoice") {
          title = "Инструменты";
          const P = catalog.ref.proficiencies;
          const ids = e.from ?? Object.keys(P).filter((p) => /Tools|Instruments|Gaming|Kits?/i.test(P[p].type));
          options = ids.map((id) => ({ id, name: P[id]?.name ?? id }));
        } else if (e.k === "languageChoice") {
          title = "Языки";
          // languages the character already speaks are not offered again
          const known = new Set([...(catalog.races[c.raceId]?.languages ?? []), ...c.languages]);
          options = catalog.ref.languages.filter((l) => !known.has(l.id) || picked.includes(l.id)).map((l) => ({ id: l.id, name: l.name }));
        } else if (e.k === "abilityChoice") {
          title = `Характеристики (+${e.value})`;
          options = (e.from ?? ABILITIES).map((a) => ({ id: a, name: ABILITY_RU[a] }));
        } else if (e.k === "featChoice") {
          title = "Черта";
          options = Object.values(catalog.feats)
            .sort((a, b) => a.name.localeCompare(b.name, "ru"))
            .map((f) => ({ id: f.id, name: `${f.name}${f.prereq.length ? ` (${f.prereq.map((p) => `${ABILITY_RU[p.ability]} ${p.min}`).join(", ")})` : ""}`, disabled: f.prereq.some((p) => sheet.scores[p.ability].value < p.min) }));
        }
        const toggle = (id: string) =>
          update(c.id, (x) => {
            const cur = x.choices[key] ?? [];
            x.choices[key] = cur.includes(id) ? cur.filter((v) => v !== id) : n === 1 ? [id] : [...cur, id].slice(-n);
          });
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div className="row"><b className="grow">{title}</b><span className={`pill ${picked.length === n ? "good" : "warn"}`}>{picked.length}/{n}</span></div>
            <div className="chips" style={{ marginTop: 4 }}>
              {options.map((o) => (
                <span key={o.id} className={`chip${picked.includes(o.id) ? " on" : ""}`} style={{ opacity: o.disabled && !picked.includes(o.id) ? 0.45 : 1 }} onClick={() => (!o.disabled || picked.includes(o.id)) && toggle(o.id)}>
                  {o.name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeatureSheet({ f, classId, c, sheet, onClose, setChoice }: { f: Feature; classId: string; c: Character; sheet: Sheet; onClose: () => void; setChoice: (id: string, v: string[]) => void }) {
  const update = useStore((s) => s.update);
  const picked = c.choices[f.id] ?? [];
  const need = needCount(f, c);
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : need === 1 ? [id] : [...picked, id].slice(-need);
    setChoice(f.id, next);
  };
  let options: { id: string; name: string; desc?: string[]; locked?: string }[] = [];
  const cl = clevelOf(c, f.class);
  if (f.invocations) {
    options = f.invocations.map((id) => {
      const inv = catalog.features[id];
      const lockedLevel = inv && inv.level > cl ? `с ${inv.level} уровня колдуна` : undefined;
      return { id, name: inv?.name.replace(/^[^:]+:\s*/, "") ?? id, desc: inv?.desc, locked: lockedLevel };
    });
  } else if (f.choice?.kind === "feature" && f.choice.options) {
    options = f.choice.options.filter(Boolean).map((id) => {
      const opt = catalog.features[id!];
      return { id: id!, name: optionName(id!), desc: opt?.desc, locked: opt && opt.level > cl ? `с ${opt.level} уровня` : undefined };
    });
  } else if (f.choice?.kind === "expertise") {
    // expertise: two of your proficient skills (or thieves' tools for rogues)
    const prof = catalog.ref.skills.filter((s) => sheet.skills[s.id].prof === "prof" || sheet.skills[s.id].prof === "expert");
    options = prof.map((s) => ({ id: s.id, name: s.name }));
    if (f.class === "rogue" && sheet.profs.has("thieves-tools")) options.push({ id: "thieves-tools", name: "Воровские инструменты" });
  }
  const isExpertise = f.choice?.kind === "expertise";
  const toggleExpertise = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
    setChoice(f.id, next);
    update(c.id, (x) => {
      // keep the flat expertise list in sync with every expertise feature
      const all = new Set<string>();
      for (const [fid, vals] of Object.entries({ ...x.choices, [f.id]: next })) if (catalog.features[fid]?.choice?.kind === "expertise") vals.forEach((v) => all.add(v));
      x.expertise = [...all];
    });
  };

  return (
    <Modal open onClose={onClose} title={<>{f.name} <UntranslatedBadge tr={f.tr} /></>}>
      <div className="faint" style={{ marginBottom: 6 }}>
        {catalog.classes[f.class]?.name}, {f.level} уровень{f.subclass ? ` · ${catalog.subclasses[f.subclass]?.name}` : ""}
        {srcLabel(f.src) ? ` · ${srcLabel(f.src)}` : ""}
      </div>
      <RulesText paras={f.desc} />
      <EffectChoices owner={{ id: f.id, name: f.name, classId, effects: f.effects ?? [] }} c={c} sheet={sheet} />
      {options.length > 0 && (
        <>
          <h3 style={{ margin: "10px 0 6px" }}>Выбор: {picked.length}/{need}</h3>
          <div className="list">
            {options.map((o) => (
              <details key={o.id} className="li" style={{ display: "block" }}>
                <summary className="row" style={{ listStyle: "none" }}>
                  <input
                    type="checkbox"
                    checked={picked.includes(o.id)}
                    disabled={Boolean(o.locked) && !picked.includes(o.id)}
                    onChange={() => (isExpertise ? toggleExpertise(o.id) : toggle(o.id))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="grow">{o.name} {o.locked && <span className="faint">({o.locked})</span>}</span>
                  {o.desc && <span className="faint">▾</span>}
                </summary>
                {o.desc && <div style={{ paddingLeft: 28, marginTop: 4 }}><RulesText paras={o.desc} /></div>}
              </details>
            ))}
          </div>
        </>
      )}
      {f.choice && (f.choice.kind === "enemy" || f.choice.kind === "terrain") && (
        <div style={{ marginTop: 8 }}>
          <label>{f.choice.kind === "enemy" ? "Избранный враг" : "Предпочитаемая местность"}</label>
          <input value={picked.join(", ")} onChange={(e) => setChoice(f.id, e.target.value ? [e.target.value] : [])} placeholder={f.choice.kind === "enemy" ? "Нежить" : "Лес"} />
        </div>
      )}
    </Modal>
  );
}

function TraitSheet({ id, c, sheet, onClose, setChoice }: { id: string; c: Character; sheet: Sheet; onClose: () => void; setChoice: (id: string, v: string[]) => void }) {
  const t = catalog.traits[id];
  const picked = c.choices[id] ?? [];
  const options = t.options?.map((o) => ({ id: o, name: catalog.traits[o]?.name ?? o })) ?? t.spellOptions?.map((o) => ({ id: o, name: catalog.spells[o]?.name ?? o })) ?? [];
  return (
    <Modal open onClose={onClose} title={t.name}>
      <RulesText paras={t.desc} />
      <EffectChoices owner={{ id: t.id, name: t.name, effects: t.effects ?? [] }} c={c} sheet={sheet} />
      {t.profChoice && (
        <div style={{ margin: "8px 0" }}>
          <div className="row"><b className="grow">Владение на выбор</b><span className={`pill ${picked.length === t.profChoice.n ? "good" : "warn"}`}>{picked.length}/{t.profChoice.n}</span></div>
          <div className="chips" style={{ marginTop: 4 }}>
            {t.profChoice.from.map((p) => (
              <span key={p} className={`chip${picked.includes(p) ? " on" : ""}`} onClick={() => setChoice(id, picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p].slice(-t.profChoice!.n))}>
                {catalog.ref.proficiencies[p]?.name ?? p}
              </span>
            ))}
          </div>
        </div>
      )}
      {options.length > 0 && (
        <>
          <h3 style={{ margin: "10px 0 6px" }}>Выберите один вариант</h3>
          <div className="list">
            {options.map((o) => (
              <div className="li tap" key={o.id} onClick={() => setChoice(id, [o.id])}>
                <input type="radio" readOnly checked={picked.includes(o.id)} />
                <span className="grow">{o.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="faint">{srcLabel(t.src as string | undefined)}</div>
    </Modal>
  );
}

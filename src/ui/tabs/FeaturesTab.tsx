import { useState } from "react";
import type { Character } from "../../rules/character";
import type { Sheet } from "../../rules/derive";
import type { Feature } from "../../rules/types";
import { catalog, skillById } from "../../data/catalog";
import { useStore } from "../../state/store";
import { Sheet as Modal, RulesText, srcLabel, UntranslatedBadge } from "../common";

/** Features whose title is only a pointer ("Path feature", "Ability Score Improvement") are folded */
const isStub = (f: Feature) => /improvement-\d$|ability-score-improvement/.test(f.id) || /feature$/i.test(f.en);

export function FeaturesTab({ c, sheet }: { c: Character; sheet: Sheet }) {
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState<Feature | null>(null);
  const [traitOpen, setTraitOpen] = useState<string | null>(null);
  const setChoice = (id: string, values: string[]) => update(c.id, (x) => (x.choices[id] = values));

  const optionIds = new Set(sheet.features.flatMap((f) => c.choices[f.feature.id] ?? []));
  const visible = sheet.features.filter((f) => !optionIds.has(f.feature.id) && !isStub(f.feature));
  const byClass = new Map<string, typeof visible>();
  for (const f of visible) byClass.set(f.classId, [...(byClass.get(f.classId) ?? []), f]);

  const race = catalog.races[c.raceId];
  const bg = c.backgroundId ? catalog.backgrounds[c.backgroundId] : null;

  return (
    <>
      {[...byClass.entries()].map(([classId, list]) => (
        <div className="card" key={classId}>
          <h2>{catalog.classes[classId]?.name}</h2>
          <div className="list">
            {list.sort((a, b) => a.feature.level - b.feature.level).map(({ feature: f }) => {
              const picked = c.choices[f.id] ?? [];
              const need = needCount(f, c, sheet);
              return (
                <div className="li tap" key={f.id} onClick={() => setOpen(f)}>
                  <span className="pill" style={{ minWidth: 34, justifyContent: "center" }}>{f.level}</span>
                  <span className="grow">
                    {f.name} {!f.tr && <UntranslatedBadge tr={false} />}
                    {picked.length > 0 && <div className="faint">{picked.map((p) => optionName(p)).join(", ")}</div>}
                  </span>
                  {need > picked.length && <span className="pill warn">выбрать</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card">
        <h2>Раса: {race?.name}{c.subraceId ? `, ${catalog.subraces[c.subraceId]?.name}` : ""}</h2>
        <div className="list">
          {sheet.traits.filter((t) => !t.parent).map((t) => {
            const needs = Boolean(t.options || t.spellOptions);
            const picked = c.choices[t.id] ?? [];
            return (
              <div className="li tap" key={t.id} onClick={() => setTraitOpen(t.id)}>
                <span className="grow">
                  {t.name}
                  {picked.length > 0 && <div className="faint">{picked.map((p) => catalog.traits[p]?.name ?? catalog.spells[p]?.name ?? p).join(", ")}</div>}
                </span>
                {needs && !picked.length && <span className="pill warn">выбрать</span>}
              </div>
            );
          })}
        </div>
        {sheet.breath && (
          <div className="info-box" style={{ marginTop: 8 }}>
            Оружие дыхания: {sheet.breath.dice.replace("d", "к")} · спасбросок {sheet.breath.save.toUpperCase()} Сл {sheet.breath.dc.value} · кнопка броска на вкладке «Бой».
          </div>
        )}
      </div>

      {bg && (
        <div className="card">
          <h2>Предыстория: {bg.name}</h2>
          <b>{bg.feature.name}</b>
          <RulesText paras={bg.feature.desc} />
        </div>
      )}

      {open && <FeatureSheet f={open} c={c} sheet={sheet} onClose={() => setOpen(null)} setChoice={setChoice} />}
      {traitOpen && <TraitSheet id={traitOpen} c={c} onClose={() => setTraitOpen(null)} setChoice={setChoice} />}
    </>
  );
}

function optionName(id: string) {
  const f = catalog.features[id];
  if (f) return f.name.replace(/^[^:]+:\s*/, "");
  return skillById[id]?.name ?? (id === "thieves-tools" ? "Воровские инструменты" : id);
}

function needCount(f: Feature, c: Character, sheet: Sheet): number {
  if (f.invocations) {
    const wl = c.classes.find((e) => e.classId === "warlock")?.level ?? 0;
    return catalog.classes.warlock.levels[wl - 1]?.cs?.invocations_known ?? 0;
  }
  if (f.choice?.kind === "feature" && f.choice.options?.length) return f.choice.n;
  if (f.choice?.kind === "expertise") return 2;
  void sheet;
  return 0;
}

function FeatureSheet({ f, c, sheet, onClose, setChoice }: { f: Feature; c: Character; sheet: Sheet; onClose: () => void; setChoice: (id: string, v: string[]) => void }) {
  const update = useStore((s) => s.update);
  const picked = c.choices[f.id] ?? [];
  const need = needCount(f, c, sheet);
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : need === 1 ? [id] : [...picked, id].slice(-need);
    setChoice(f.id, next);
  };
  let options: { id: string; name: string; desc?: string[]; locked?: string }[] = [];
  if (f.invocations) {
    const wl = c.classes.find((e) => e.classId === "warlock")?.level ?? 0;
    options = f.invocations.map((id) => {
      const inv = catalog.features[id];
      const lockedLevel = inv && inv.level > wl ? `с ${inv.level} уровня колдуна` : undefined;
      return { id, name: inv?.name.replace(/^[^:]+:\s*/, "") ?? id, desc: inv?.desc, locked: lockedLevel };
    });
  } else if (f.choice?.kind === "feature" && f.choice.options) {
    options = f.choice.options.filter(Boolean).map((id) => ({ id: id!, name: optionName(id!), desc: catalog.features[id!]?.desc }));
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
      <div className="faint" style={{ marginBottom: 6 }}>{catalog.classes[f.class]?.name}, {f.level} уровень{f.subclass ? ` · ${catalog.subclasses[f.subclass]?.name}` : ""}{srcLabel(f.src) ? ` · ${srcLabel(f.src)}` : ""}</div>
      <RulesText paras={f.desc} />
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

function TraitSheet({ id, c, onClose, setChoice }: { id: string; c: Character; onClose: () => void; setChoice: (id: string, v: string[]) => void }) {
  const t = catalog.traits[id];
  const picked = c.choices[id] ?? [];
  const options = t.options?.map((o) => ({ id: o, name: catalog.traits[o]?.name ?? o, desc: catalog.traits[o]?.desc })) ?? t.spellOptions?.map((o) => ({ id: o, name: catalog.spells[o]?.name ?? o, desc: catalog.spells[o]?.desc.slice(0, 1) })) ?? [];
  return (
    <Modal open onClose={onClose} title={t.name}>
      <RulesText paras={t.desc} />
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
    </Modal>
  );
}

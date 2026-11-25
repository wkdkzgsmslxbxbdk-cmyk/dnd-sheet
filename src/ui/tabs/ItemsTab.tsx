import { useState } from "react";
import { newId, type Character, type InvItem } from "../../rules/character";
import { inventoryName, type Sheet } from "../../rules/derive";
import type { Equipment, MagicItem } from "../../rules/types";
import { catalog, damageTypeById } from "../../data/catalog";
import { ITEM_EFFECTS } from "../../rules/itemEffects";
import { useStore } from "../../state/store";
import { Counter, Hint, Sheet as Modal, RulesText, srcLabel, UntranslatedBadge } from "../common";

const COIN: { id: keyof Character["money"]; name: string }[] = [
  { id: "pp", name: "пм" }, { id: "gp", name: "зм" }, { id: "ep", name: "эм" }, { id: "sp", name: "см" }, { id: "cp", name: "мм" },
];
const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies"];
const RARITY_RU: Record<string, string> = { Common: "Обычные", Uncommon: "Необычные", Rare: "Редкие", "Very Rare": "Очень редкие", Legendary: "Легендарные", Artifact: "Артефакты", Varies: "Разные" };

function isEquippable(base: Equipment | null, magic: MagicItem | null) {
  return Boolean(base?.weapon || base?.armor || magic);
}

export function ItemsTab({ c, sheet }: { c: Character; sheet: Sheet }) {
  const update = useStore((s) => s.update);
  const upd = (f: (x: Character) => void) => update(c.id, f);
  const [adding, setAdding] = useState(false);
  const [info, setInfo] = useState<InvItem | null>(null);
  const setItem = (uid: string, f: (i: InvItem) => void) => upd((x) => { const it = x.inventory.find((i) => i.uid === uid); if (it) f(it); });

  const equipped = sheet.items.filter((x) => x.item.equipped);
  const rest = sheet.items.filter((x) => !x.item.equipped);

  const addStarting = () => {
    const cls = catalog.classes[c.classes[0]?.classId];
    const bg = c.backgroundId ? catalog.backgrounds[c.backgroundId] : null;
    upd((x) => {
      for (const e of [...(cls?.startEquip ?? []), ...(bg?.equipment ?? [])]) {
        if (catalog.equipment[e.id]) x.inventory.push({ uid: newId(), baseId: e.id, magicId: null, custom: null, qty: e.qty, equipped: false, attuned: false });
      }
      if (bg) x.money.gp += bg.gold;
    });
  };

  const row = ({ item, base, magic }: Sheet["items"][number]) => {
    const name = inventoryName(item);
    const eff = magic ? ITEM_EFFECTS[magic.id] : undefined;
    return (
      <div className="li" key={item.uid}>
        {isEquippable(base, magic) && (
          <input type="checkbox" title="Надето / в руках" checked={item.equipped} onChange={(e) => setItem(item.uid, (i) => (i.equipped = e.target.checked))} />
        )}
        <span className="grow" onClick={() => setInfo(item)} style={{ cursor: "pointer" }}>
          {name} {item.qty > 1 && <span className="faint">×{item.qty}</span>}
          <div className="faint">
            {base?.weapon && `${base.weapon.dice?.replace("d", "к") ?? ""} ${damageTypeById[base.weapon.type ?? ""]?.name ?? ""}`}
            {base?.armor && (base.armor.cat === "shield" ? "Щит +2 КД" : `КД ${base.armor.base}${base.armor.dex ? (base.armor.max != null ? ` + ЛОВ (макс ${base.armor.max})` : " + ЛОВ") : ""}`)}
            {magic && ` ${magic.rarityName}`}
            {magic?.attune && (item.attuned ? " · настроен" : " · требует настройки")}
            {eff && " · бонусы учтены в листе"}
          </div>
        </span>
        {magic?.attune && (
          <button className={`small${item.attuned ? " primary" : ""}`} onClick={() => setItem(item.uid, (i) => (i.attuned = !i.attuned))} title="Настройка">
            {item.attuned ? "✓" : "◯"}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <Hint id="items">Галочка слева — надето или в руках: так оружие попадает в атаки, а доспех в КД. Магические бонусы считаются сами, если предмет надет (и настроен, где нужно).</Hint>
      <div className="grid3">
        <div className="stat"><div className="lb">Вес</div><div className="vl">{Math.round(sheet.weight.total * 10) / 10}</div><div className="sub">из {sheet.weight.capacity} фнт</div></div>
        <div className="stat"><div className="lb">Настройка</div><div className="vl">{sheet.attuned}/3</div><div className="sub">предмета</div></div>
        <div className="stat"><div className="lb">Золото</div><div className="vl">{c.money.gp}</div><div className="sub">зм</div></div>
      </div>

      <div className="card">
        <div className="head"><h2>Надето и в руках</h2></div>
        <div className="list">{equipped.length ? equipped.map(row) : <div className="faint">Ничего</div>}</div>
      </div>
      <div className="card">
        <div className="head">
          <h2>Снаряжение</h2>
          <button className="small primary" onClick={() => setAdding(true)}>+ Добавить</button>
        </div>
        <div className="list">{rest.length ? rest.map(row) : <div className="faint">Пусто</div>}</div>
        {c.inventory.length === 0 && (
          <button style={{ marginTop: 8, width: "100%" }} onClick={addStarting}>Добавить стартовое снаряжение класса и предыстории</button>
        )}
      </div>

      <div className="card">
        <h2>Деньги</h2>
        <div className="grid5" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          {COIN.map((m) => (
            <div key={m.id}>
              <label>{m.name}</label>
              <input inputMode="numeric" value={c.money[m.id]} onChange={(e) => upd((x) => (x.money[m.id] = Number(e.target.value.replace(/\D/g, "")) || 0))} />
            </div>
          ))}
        </div>
        <div className="faint" style={{ marginTop: 6 }}>1 пм = 10 зм, 1 зм = 2 эм = 10 см = 100 мм.</div>
      </div>

      {adding && <AddItem c={c} onClose={() => setAdding(false)} />}
      {info && <ItemInfo c={c} uid={info.uid} onClose={() => setInfo(null)} />}
    </>
  );
}

function ItemInfo({ c, uid, onClose }: { c: Character; uid: string; onClose: () => void }) {
  const update = useStore((s) => s.update);
  const item = c.inventory.find((i) => i.uid === uid);
  if (!item) return null;
  const base = item.baseId ? catalog.equipment[item.baseId] : null;
  const magic = item.magicId ? catalog.magicItems[item.magicId] : null;
  const setItem = (f: (i: InvItem) => void) => update(c.id, (x) => { const it = x.inventory.find((i) => i.uid === uid); if (it) f(it); });
  const eff = magic ? ITEM_EFFECTS[magic.id] : undefined;
  return (
    <Modal open onClose={onClose} title={inventoryName(item)}>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <span className="faint">Количество</span>
        <Counter value={item.qty} min={1} onChange={(v) => setItem((i) => (i.qty = v))} />
        <span className="grow" />
        <button className="small danger" onClick={() => { update(c.id, (x) => (x.inventory = x.inventory.filter((i) => i.uid !== uid))); onClose(); }}>Удалить</button>
      </div>
      {base?.weapon && (
        <div className="list" style={{ marginBottom: 10 }}>
          {base.weapon.twoHanded && (
            <label className="row li" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!item.twoHanded} onChange={(e) => setItem((i) => (i.twoHanded = e.target.checked))} />
              Держать двумя руками ({base.weapon.twoHanded.replace("d", "к")}, универсальное)
            </label>
          )}
          {base.weapon.props.includes("light") && (
            <label className="row li" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!item.offHand} onChange={(e) => setItem((i) => (i.offHand = e.target.checked))} />
              Во второй руке (бой двумя оружиями)
            </label>
          )}
          <div className="faint">Свойства: {base.weapon.props.map((p) => catalog.ref.weaponProps[p]?.name ?? p).join(", ") || "—"}</div>
        </div>
      )}
      {base?.armor && (
        <div className="faint" style={{ marginBottom: 10 }}>
          {base.armor.str ? `Требуется СИЛ ${base.armor.str}. ` : ""}
          {base.armor.stealth ? "Помеха на Скрытность. " : ""}
          Вес {base.weight} фнт.
        </div>
      )}
      {eff && <div className="info-box" style={{ marginBottom: 10 }}>Учтено в листе: «{eff.cite}»</div>}
      {magic && (
        <>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="pill accent">{magic.rarityName}</span>
            {magic.attune && <span className="pill">требует настройки</span>}
            <UntranslatedBadge tr={magic.tr} />
          </div>
          <RulesText paras={magic.desc} />
          <div className="faint">{srcLabel(magic.src)}</div>
        </>
      )}
      {base?.desc && <RulesText paras={base.desc} />}
      {item.custom && (
        <>
          <label>Описание</label>
          <textarea value={item.custom.desc ?? ""} onChange={(e) => setItem((i) => (i.custom!.desc = e.target.value))} />
        </>
      )}
      {base?.contents && (
        <div>
          <div className="faint">Содержимое набора:</div>
          {base.contents.map((x) => <div key={x.id}>{catalog.equipment[x.id]?.name ?? x.id} ×{x.qty}</div>)}
          <button
            className="small"
            style={{ marginTop: 6 }}
            onClick={() => {
              update(c.id, (x) => {
                x.inventory = x.inventory.filter((i) => i.uid !== uid);
                for (const e of base.contents!) x.inventory.push({ uid: newId(), baseId: e.id, magicId: null, custom: null, qty: e.qty, equipped: false, attuned: false });
              });
              onClose();
            }}
          >
            Распаковать набор
          </button>
        </div>
      )}
    </Modal>
  );
}

function AddItem({ c, onClose }: { c: Character; onClose: () => void }) {
  const update = useStore((s) => s.update);
  const [tab, setTab] = useState<"gear" | "magic" | "custom">("gear");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [rarity, setRarity] = useState<string>("fit");
  const [pickBase, setPickBase] = useState<MagicItem | null>(null);
  const [custom, setCustom] = useState({ name: "", desc: "", weight: "" });
  const [added, setAdded] = useState<string | null>(null);
  const level = c.classes.reduce((s, e) => s + e.level, 0);

  const add = (baseId: string | null, magicId: string | null, name?: string) => {
    update(c.id, (x) => x.inventory.push({ uid: newId(), baseId, magicId, custom: null, qty: 1, equipped: false, attuned: false }));
    setAdded(name ?? "Добавлено");
    window.setTimeout(() => setAdded(null), 1500);
  };
  const match = (s: { name: string; en: string }) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.en.toLowerCase().includes(q.toLowerCase());
  // exact name first, then names starting with the query, then the rest
  const rank = (s: { name: string }) => {
    const n = s.name.toLowerCase(), t = q.trim().toLowerCase();
    return !t ? 0 : n === t ? 0 : n.startsWith(t) ? 1 : 2;
  };

  const gearCats = ["all", "weapon", "armor", "adventuring-gear", "tools", "mounts-and-vehicles"];
  const gear = catalog.equipmentList.filter((e) => (cat === "all" || e.cat === cat) && match(e)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ru"));
  const magic = catalog.magicItemList
    .filter((m) => !m.variants.length) // pick concrete variants, not the umbrella entry
    // while searching by name the level filter doesn't hide anything (items above the level get a mark)
    .filter((m) => (rarity === "fit" ? (q.trim() ? true : m.minLevel <= level && m.rarity !== "Artifact") : rarity === "all" || m.rarity === rarity))
    .filter(match)
    .sort((a, b) => rank(a) - rank(b) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name, "ru"));

  const baseOptions = (m: MagicItem) => {
    const kind = ITEM_EFFECTS[m.id]?.base ?? (m.cat === "armor" ? "armor" : m.cat === "weapon" ? "weapon" : m.cat === "ammunition" ? "ammunition" : null);
    if (kind === "armor") return catalog.equipmentList.filter((e) => e.armor && e.armor.cat !== "shield");
    if (kind === "weapon") return catalog.equipmentList.filter((e) => e.weapon);
    if (kind === "ammunition") return catalog.equipmentList.filter((e) => e.sub === "ammunition");
    return null;
  };

  return (
    <Modal open onClose={onClose} title="Добавить вещь">
      <div className="search">
        <div className="seg" style={{ marginBottom: 8 }}>
          <button className={tab === "gear" ? "on" : ""} onClick={() => setTab("gear")}>Снаряжение</button>
          <button className={tab === "magic" ? "on" : ""} onClick={() => setTab("magic")}>Магические</button>
          <button className={tab === "custom" ? "on" : ""} onClick={() => setTab("custom")}>Своё</button>
        </div>
        {tab !== "custom" && <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />}
        {tab === "gear" && (
          <div className="chips" style={{ marginTop: 8 }}>
            {gearCats.map((k) => (
              <span key={k} className={`chip${cat === k ? " on" : ""}`} onClick={() => setCat(k)}>{k === "all" ? "Все" : catalog.ref.categories[k] ?? k}</span>
            ))}
          </div>
        )}
        {tab === "magic" && (
          <>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className={`chip${rarity === "fit" ? " on" : ""}`} onClick={() => setRarity("fit")}>Для {level} уровня</span>
              {RARITY_ORDER.slice(0, 6).map((r) => (
                <span key={r} className={`chip${rarity === r ? " on" : ""}`} onClick={() => setRarity(r)}>{RARITY_RU[r]}</span>
              ))}
              <span className={`chip${rarity === "all" ? " on" : ""}`} onClick={() => setRarity("all")}>Все</span>
            </div>
            <div className="faint" style={{ marginTop: 6 }}>«Для уровня» — по таблице редкости из Руководства мастера: необычные с 1, редкие с 5, очень редкие с 11, легендарные с 17 уровня. Окончательно решает Мастер.</div>
          </>
        )}
        {added && <div className="info-box" style={{ marginTop: 8 }}>Добавлено: {added}</div>}
      </div>

      {tab === "gear" && (
        <div className="list">
          {gear.map((e) => (
            <div className="li tap" key={e.id} onClick={() => add(e.id, null, e.name)}>
              <span className="grow">
                {e.name}
                <div className="faint">
                  {e.weapon && `${e.weapon.dice?.replace("d", "к") ?? "—"} ${damageTypeById[e.weapon.type ?? ""]?.name ?? ""} · `}
                  {e.armor && (e.armor.cat === "shield" ? "+2 КД · " : `КД ${e.armor.base}${e.armor.dex ? " + ЛОВ" : ""}${e.armor.max != null ? ` (макс ${e.armor.max})` : ""} · `)}
                  {e.cost ? `${e.cost.q} ${({ gp: "зм", sp: "см", cp: "мм", pp: "пм", ep: "эм" } as Record<string, string>)[e.cost.u] ?? e.cost.u}` : ""}
                  {e.weight ? ` · ${e.weight} фнт` : ""}
                </div>
              </span>
              <span className="faint">+</span>
            </div>
          ))}
        </div>
      )}
      {tab === "magic" && (
        <div className="list">
          {magic.map((m) => (
            <div className="li tap" key={m.id} onClick={() => (baseOptions(m) ? setPickBase(m) : add(null, m.id, m.name))}>
              <span className="grow">
                {m.name} {ITEM_EFFECTS[m.id] && <span className="pill good">авторасчёт</span>}
                {m.minLevel > level && <span className="pill warn">обычно с {m.minLevel} ур.</span>}
                <div className="faint">{m.rarityName}{m.attune ? " · настройка" : ""}</div>
              </span>
              <span className="faint">+</span>
            </div>
          ))}
        </div>
      )}
      {tab === "custom" && (
        <div>
          <label>Название</label>
          <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Медальон бабушки" />
          <label style={{ marginTop: 8 }}>Описание</label>
          <textarea value={custom.desc} onChange={(e) => setCustom({ ...custom, desc: e.target.value })} />
          <label style={{ marginTop: 8 }}>Вес, фнт</label>
          <input inputMode="decimal" value={custom.weight} onChange={(e) => setCustom({ ...custom, weight: e.target.value })} />
          <div className="faint" style={{ margin: "6px 0" }}>Своя вещь не меняет числа листа. Если у неё есть бонус, Мастер подскажет, как его учесть.</div>
          <button
            className="primary"
            style={{ width: "100%" }}
            disabled={!custom.name.trim()}
            onClick={() => {
              update(c.id, (x) => x.inventory.push({ uid: newId(), baseId: null, magicId: null, custom: { name: custom.name.trim(), desc: custom.desc, weight: Number(custom.weight.replace(",", ".")) || 0 }, qty: 1, equipped: false, attuned: false }));
              onClose();
            }}
          >
            Добавить
          </button>
        </div>
      )}

      {pickBase && (
        <Modal open onClose={() => setPickBase(null)} title={`${pickBase.name}: основа`}>
          <div className="faint" style={{ marginBottom: 8 }}>Выберите, на каком предмете эта магия.</div>
          <div className="list">
            {(baseOptions(pickBase) ?? []).map((e) => (
              <div className="li tap" key={e.id} onClick={() => { add(e.id, pickBase.id, `${pickBase.name} (${e.name})`); setPickBase(null); }}>
                {e.name}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Modal>
  );
}

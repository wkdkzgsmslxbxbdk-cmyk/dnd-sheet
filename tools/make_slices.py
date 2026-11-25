"""Cut the English SRD 5.1 (2014) data into small slices for translation.

Usage: python -I tools/make_slices.py <5e-database/src/2014/en> <out dir>
Each slice is a JSON object {index: {fields to translate}}. Translators write
the same shape (same keys, Russian values) into data/ru/<slice name>.json.
"""
import json
import sys
from pathlib import Path


ERRATA = json.loads((Path(__file__).resolve().parent.parent / "data" / "srd-errata.json").read_text(encoding="utf-8"))
PATCHES = json.loads((Path(__file__).resolve().parent.parent / "data" / "srd-patches.json").read_text(encoding="utf-8"))


def fix(value, wrong: str, right: str):
    if isinstance(value, list):
        return [fix(v, wrong, right) for v in value]
    return value.replace(wrong, right) if isinstance(value, str) else value


def load(src: Path, name: str):
    data = json.loads((src / f"5e-SRD-{name}.json").read_text(encoding="utf-8"))
    for item in data:
        for field, (wrong, right) in ERRATA.get(name, {}).get(item.get("index"), {}).items():
            item[field] = fix(item[field], wrong, right)
        # text fields patched after checking against the PHB (e.g. a missing higher_level)
        for path, value in PATCHES.get(name, {}).get(item.get("index"), {}).items():
            if path in ("higher_level", "desc", "material"):
                item[path] = value
    return data


def pick(obj: dict, fields: list[str]) -> dict:
    return {f: obj[f] for f in fields if obj.get(f) not in (None, "", [])}


def chunks(items: list, n: int) -> list[list]:
    size = -(-len(items) // n)
    return [items[i:i + size] for i in range(0, len(items), size)]


def main() -> None:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    slices: dict[str, dict] = {}

    spells = sorted(load(src, "Spells"), key=lambda s: s["index"])
    for i, part in enumerate(chunks(spells, 6), start=1):
        slices[f"spells-{i}"] = {
            s["index"]: pick(s, ["name", "desc", "higher_level", "material"]) | {"_level": s["level"]}
            for s in part
        }

    features = load(src, "Features")
    for i, part in enumerate(chunks(features, 2), start=1):
        slices[f"features-{i}"] = {
            f["index"]: pick(f, ["name", "desc"])
            | {"_class": f["class"]["index"], "_level": f["level"]}
            | ({"_subclass": f["subclass"]["index"]} if f.get("subclass") else {})
            for f in part
        }

    items = load(src, "Magic-Items")
    for i, part in enumerate(chunks(items, 2), start=1):
        slices[f"magic-items-{i}"] = {m["index"]: pick(m, ["name", "desc"]) for m in part}

    slices["equipment"] = {e["index"]: pick(e, ["name", "desc", "special"]) for e in load(src, "Equipment")}
    slices["equipment"].update(
        {f"category:{c['index']}": {"name": c["name"]} for c in load(src, "Equipment-Categories")}
    )
    slices["equipment"].update(
        {f"property:{p['index']}": pick(p, ["name", "desc"]) for p in load(src, "Weapon-Properties")}
    )

    misc: dict[str, dict] = {}
    for r in load(src, "Races"):
        misc[f"race:{r['index']}"] = pick(
            r, ["name", "alignment", "age", "size_description", "language_desc"]
        )
    for r in load(src, "Subraces"):
        misc[f"subrace:{r['index']}"] = pick(r, ["name", "desc"])
    for t in load(src, "Traits"):
        misc[f"trait:{t['index']}"] = pick(t, ["name", "desc"])
    for c in load(src, "Classes"):
        misc[f"class:{c['index']}"] = {"name": c["name"]}
    for s in load(src, "Subclasses"):
        misc[f"subclass:{s['index']}"] = pick(s, ["name", "subclass_flavor", "desc"])
    for b in load(src, "Backgrounds"):
        misc[f"background:{b['index']}"] = {"name": b["name"], "feature": b["feature"]}
    for f in load(src, "Feats"):
        misc[f"feat:{f['index']}"] = pick(f, ["name", "desc"])
    for p in load(src, "Proficiencies"):
        misc[f"proficiency:{p['index']}"] = {"name": p["name"]}
    slices["misc"] = misc

    for name, data in slices.items():
        (out / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        size = (out / f"{name}.json").stat().st_size
        print(f"{name:16} entries={len(data):4} bytes={size}")


if __name__ == "__main__":
    main()

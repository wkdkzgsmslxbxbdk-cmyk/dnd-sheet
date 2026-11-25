"""Validate beginner guide texts (data/guide/*.json). See docs/guide-content.md.

Usage: python -I tools/check_guide.py data/guide/classes.json [...]   |   --all
Errors: unknown ids, wrong shapes, too long, text copied from any book (10+ words).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "src" / "data" / "gen"
TEXTS = ROOT / "sources" / "books-text"
GUIDE = ROOT / "data" / "guide"
COPY_WORDS = 10
ROLES = {"урон", "защита", "поддержка", "лечение", "контроль", "разведка", "универсал"}
ABILITIES = {"str", "dex", "con", "int", "wis", "cha"}


def gen_ids(name):
    return {x["id"] for x in json.loads((GEN / f"{name}.json").read_text(encoding="utf-8"))}


CLASSES, SUBCLASSES = gen_ids("classes"), gen_ids("subclasses")
RACES = gen_ids("races") | gen_ids("subraces")
BACKGROUNDS, SPELLS = gen_ids("backgrounds"), gen_ids("spells")


def words(s):
    s = re.sub(r"-\s*\n\s*", "", s.lower()).replace("ё", "е")
    return re.findall(r"[а-яa-z0-9]+", s)


_shingles = None


def shingles():
    global _shingles
    if _shingles is None:
        _shingles = set()
        for p in TEXTS.glob("*.txt"):
            w = words(p.read_text(encoding="utf-8"))
            _shingles.update(" ".join(w[i:i + COPY_WORDS]) for i in range(len(w) - COPY_WORDS + 1))
    return _shingles


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    files = sorted(GUIDE.glob("*.json")) if sys.argv[1:] in ([], ["--all"]) else [Path(a) for a in sys.argv[1:]]
    errors = []
    for f in files:
        kind = f.stem.split("-")[0]  # subclasses-a.json, subclasses-b.json ...
        known = {"classes": CLASSES, "subclasses": SUBCLASSES, "races": RACES, "backgrounds": BACKGROUNDS}.get(kind)
        if known is None:
            errors.append(f"{f.name}: unknown file kind")
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        for key, v in data.items():
            w = f"{f.name}:{key}"
            if key not in known:
                errors.append(f"{w}: unknown id")
            tl = v.get("tagline", "")
            if not tl or len(tl) > 80:
                errors.append(f"{w}: tagline required, ≤ 80 chars ({len(tl)})")
            about = v.get("about", [])
            if not isinstance(about, list) or not 1 <= len(about) <= 3 or any(len(a) > 260 for a in about):
                errors.append(f"{w}: about must be 1–3 strings ≤ 260 chars")
            for r in v.get("roles", []):
                if r not in ROLES:
                    errors.append(f"{w}: bad role {r!r}")
            if "difficulty" in v and v["difficulty"] not in (1, 2, 3):
                errors.append(f"{w}: difficulty 1|2|3")
            for a in v.get("primary", []):
                if a not in ABILITIES:
                    errors.append(f"{w}: bad primary {a!r}")
            qb = v.get("quickBuild")
            if qb:
                if sorted(qb.get("abilities", [])) != sorted(ABILITIES):
                    errors.append(f"{w}: quickBuild.abilities must list all 6 abilities once")
                if qb.get("background") and qb["background"] not in BACKGROUNDS:
                    errors.append(f"{w}: unknown background {qb['background']!r}")
                for s in qb.get("spells", []):
                    if s not in SPELLS:
                        errors.append(f"{w}: unknown spell {s!r}")
            age = v.get("age")
            if age and not (isinstance(age.get("adult"), int) and isinstance(age.get("max"), int)):
                errors.append(f"{w}: age needs adult and max (int)")
            body = v.get("body")
            if body:
                if not isinstance(body.get("baseIn"), int) or not isinstance(body.get("baseLb"), int):
                    errors.append(f"{w}: body.baseIn/baseLb must be int")
                for d in ("heightDice", "weightDice"):
                    if body.get(d) is not None and not re.fullmatch(r"\d+d\d+", str(body.get(d))):
                        errors.append(f"{w}: body.{d} must be like 2d10 or null")
            texts = [tl, *about, (qb or {}).get("note", "")]
            sh = shingles()
            for t in texts:
                ww = words(t)
                for i in range(len(ww) - COPY_WORDS + 1):
                    if " ".join(ww[i:i + COPY_WORDS]) in sh:
                        errors.append(f"{w}: copied from a book: «{' '.join(ww[i:i + COPY_WORDS])}»")
                        break
        print(f"{f.name}: {len(data)} entries")
    for e in errors:
        print("[ERR]", e)
    print(f"errors: {len(errors)}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

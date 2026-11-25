"""Validate rulebook content files (data/books/<book>/*.json).

Usage:
  python -I tools/check_book_data.py data/books/phb/subclasses-bard.json [...]
  python -I tools/check_book_data.py --all

ERRORS (exit 1): bad structure, missing fields, duplicate ids, unknown references,
bad effect kinds/expressions, text copied from the book (8+ identical words in a row).
WARNINGS: numbers in an entry that don't appear in the book text near its page —
either the page is wrong or the number is.

See docs/book-content-guide.md.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "src" / "data" / "gen"
BOOKS = ROOT / "data" / "books"
TEXTS = ROOT / "sources" / "books-text"

CLASSES = {"barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"}
ABILITIES = {"str", "dex", "con", "int", "wis", "cha"}
SCHOOLS = {"abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"}
AOE = {"sphere", "cube", "cone", "line", "cylinder"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
COPY_WORDS = 10  # standard rules phrases ("бонусным действием совершить одну атаку") repeat by nature

EFFECT_FIELDS = {
    "prof": {"ids"}, "skillChoice": {"n"}, "expertiseChoice": {"n"}, "toolChoice": {"n"}, "languageChoice": {"n"},
    "ability": {"ability", "value"}, "abilityChoice": {"n", "value"}, "saveProf": {"abilities"},
    "ac": {"value"}, "acBase": {"base", "abilities", "shield", "label"}, "speed": {"value"}, "hp": set(),
    "save": {"value"}, "check": {"value"}, "initiative": {"value"}, "spellDc": {"value"}, "spellAttack": {"value"},
    "cantripDamage": {"value"}, "spellDamage": {"value"}, "healBonus": {"value"},
    "weaponAttack": {"value"}, "weaponDamage": {"value"}, "weaponExtra": {"dice", "type", "note"},
    "attackAbility": {"ability", "note"}, "critFrom": {"value"},
    "resource": {"id", "name", "max", "reset"}, "toggle": {"id", "name"}, "resist": {"types"}, "sense": {"name", "range"},
    "spells": {"spells"}, "dc": {"name", "value"}, "featChoice": {"n"},
}
EXPR_FIELDS = {"value", "base", "perLevel", "flat", "max"}


# ---------- expression check (mirror of src/rules/effects.ts) ----------
TOK = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|([a-z_][a-z_.]*)|(>=|<=|[-+*/(),<>]))")
VARS = {"prof", "level", "clevel", "slot"} | {f"mod.{a}" for a in ABILITIES} | {f"score.{a}" for a in ABILITIES}
FUNCS = {"max", "min", "floor", "ceil"}


def check_expr(e) -> str | None:
    if isinstance(e, (int, float)):
        return None
    if not isinstance(e, str):
        return f"expression must be number or string, got {e!r}"
    toks, pos = [], 0
    while pos < len(e):
        m = TOK.match(e, pos)
        if not m or m.end() == pos:
            if e[pos:].strip() == "":
                break
            return f"bad token in {e!r} at {pos}"
        toks.append(m.group(1) or m.group(2) or m.group(3))
        pos = m.end()
    depth = 0
    for i, t in enumerate(toks):
        if t == "(":
            depth += 1
        elif t == ")":
            depth -= 1
        elif re.match(r"[a-z_]", t):
            if t in FUNCS:
                if i + 1 >= len(toks) or toks[i + 1] != "(":
                    return f"{t} must be called in {e!r}"
            elif t not in VARS:
                return f"unknown variable {t!r} in {e!r}"
        if depth < 0:
            return f"unbalanced parentheses in {e!r}"
    return None if depth == 0 else f"unbalanced parentheses in {e!r}"


# ---------- reference data ----------
def load_gen(name):
    return json.loads((GEN / f"{name}.json").read_text(encoding="utf-8"))


REF = load_gen("ref")
PROFS = set(REF["proficiencies"])
SKILLS = {s["id"] for s in REF["skills"]}
LANGS = {l["id"] for l in REF["languages"]}
DAMAGE = {d["id"] for d in REF["damageTypes"]}
SRD = {}
for kind in ["spells", "features", "subclasses", "races", "subraces", "traits", "backgrounds", "feats", "equipment"]:
    SRD[kind] = {x["id"] for x in load_gen(kind) if x.get("source", "srd") == "srd"}


# ---------- book text ----------
_pages: dict[str, dict[int, str]] = {}


def book_pages(code: str) -> dict[int, str]:
    if code not in _pages:
        p = TEXTS / f"{code}.txt"
        pages: dict[int, str] = {}
        if p.exists():
            cur, buf = 0, []
            for line in p.read_text(encoding="utf-8").splitlines():
                m = re.match(r"=== PAGE (\d+) ===", line)
                if m:
                    pages[cur] = "\n".join(buf)
                    cur, buf = int(m.group(1)), []
                else:
                    buf.append(line)
            pages[cur] = "\n".join(buf)
        _pages[code] = pages
    return _pages[code]


def page_text(code: str, page: int, spread=2) -> str:
    pages = book_pages(code)
    return "\n".join(pages.get(p, "") for p in range(page - 1, page + spread + 1))


def words(s: str) -> list[str]:
    # join hyphenated line breaks of the PDF text, normalise ё
    s = re.sub(r"-\s*\n\s*", "", s.lower()).replace("ё", "е")
    return re.findall(r"[а-яa-z0-9]+", s)


def numbers(obj) -> set[str]:
    text = json.dumps(obj, ensure_ascii=False)
    text = re.sub(r'"(id|en|page|_[a-z]+|spell|addTo|class|subclass|race|parent|target)"\s*:\s*("[^"]*"|\d+|\[[^\]]*\])', "", text)
    text = re.sub(r'"[a-z]+-[a-z0-9-]+"', "", text)  # id references
    return {n for n in re.findall(r"\d+", text) if int(n) >= 2}


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, where, msg):
        self.errors.append(f"[ERR] {where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"[warn] {where}: {msg}")


def check_effects(rep, where, effects, known_spells):
    if not isinstance(effects, list):
        rep.err(where, "effects must be a list")
        return
    for i, e in enumerate(effects):
        w = f"{where}.effects[{i}]"
        k = e.get("k")
        if k not in EFFECT_FIELDS:
            rep.err(w, f"unknown effect kind {k!r}")
            continue
        missing = EFFECT_FIELDS[k] - set(e)
        if missing:
            rep.err(w, f"missing {sorted(missing)}")
        for f in EXPR_FIELDS & set(e):
            msg = check_expr(e[f])
            if msg:
                rep.err(w, msg)
        if k == "prof":
            for p in e.get("ids", []):
                if p not in PROFS:
                    rep.err(w, f"unknown proficiency id {p!r}")
        if k in ("skillChoice", "expertiseChoice"):
            for s in e.get("from") or []:
                if s not in SKILLS:
                    rep.err(w, f"unknown skill {s!r}")
        if k == "toolChoice":
            for s in e.get("from") or []:
                if s not in PROFS:
                    rep.err(w, f"unknown tool proficiency {s!r}")
        for f in ("ability",):
            if f in e and e[f] not in ABILITIES:
                rep.err(w, f"bad ability {e[f]!r}")
        for f in ("abilities", "from") if k in ("abilityChoice", "saveProf", "acBase") else ():
            for a in e.get(f) or []:
                if a not in ABILITIES:
                    rep.err(w, f"bad ability {a!r}")
        if k == "resist":
            for t in e.get("types", []):
                if t not in DAMAGE:
                    rep.err(w, f"unknown damage type {t!r}")
        if k == "weaponExtra" and e.get("type") not in DAMAGE:
            rep.err(w, f"unknown damage type {e.get('type')!r}")
        if k == "resource" and e.get("reset") not in ("short", "long"):
            rep.err(w, "reset must be short|long")
        if k == "spells":
            if e.get("uses", "longRest") not in ("longRest", "ritual", "slots"):
                rep.err(w, "uses must be longRest|ritual|slots")
            for s in e.get("spells", []):
                if s.get("spell") not in known_spells:
                    rep.err(w, f"unknown spell {s.get('spell')!r}")


def check_text_entry(rep, where, entry, code):
    page = entry.get("page")
    if not isinstance(page, int):
        rep.err(where, "page (PDF page number) is required")
        return
    text = page_text(code, page)
    if not text.strip():
        rep.warn(where, f"no book text for {code} page {page}")
        return
    # numbers grounding
    book_nums = set(re.findall(r"\d+", text))
    missing = sorted(numbers({k: v for k, v in entry.items() if k not in ("features",)}) - book_nums, key=int)
    if missing:
        rep.warn(where, f"numbers not found on {code} pages {page - 1}..{page + 2}: {', '.join(missing)}")
    # copy detection
    bw = words(text)
    shingles = {" ".join(bw[i:i + COPY_WORDS]) for i in range(len(bw) - COPY_WORDS + 1)}
    paras = []
    for f in ("desc", "higher"):
        v = entry.get(f)
        if isinstance(v, list):
            paras += [x for x in v if isinstance(x, str)]
    if isinstance(entry.get("feature"), dict):
        paras += entry["feature"].get("desc", [])
    for p in paras:
        ww = words(p)
        for i in range(len(ww) - COPY_WORDS + 1):
            chunk = " ".join(ww[i:i + COPY_WORDS])
            if chunk in shingles:
                rep.err(where, f"text copied from the book: «{chunk}…» — rewrite in your own words")
                break


def need(rep, where, entry, fields):
    for f in fields:
        if entry.get(f) in (None, "", []) and f not in entry:
            rep.err(where, f"missing field {f!r}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    all_files = sorted(BOOKS.glob("*/*.json"))
    files = all_files if args == ["--all"] or not args else [Path(a).resolve() for a in args]
    rep = Report()

    # ids across all book files (for duplicates and references)
    ids: dict[str, dict[str, str]] = {k: {} for k in SRD}
    data_by_file = {}
    for f in all_files:
        try:
            data_by_file[f.resolve()] = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            rep.err(f.name, f"JSON: {e}")
            continue
    for f, data in data_by_file.items():
        rel = f.relative_to(ROOT).as_posix()
        def reg(kind, x):
            i = x.get("id")
            if not isinstance(i, str) or not ID_RE.match(i):
                rep.err(rel, f"bad {kind} id {i!r} (kebab-case latin)")
                return
            if i in SRD[kind]:
                rep.err(rel, f"{kind} id {i!r} already exists in SRD")
            elif i in ids[kind] and ids[kind][i] != rel:
                rep.err(rel, f"{kind} id {i!r} duplicates {ids[kind][i]}")
            ids[kind][i] = rel
        for s in data.get("subclasses", []):
            reg("subclasses", s)
            for ft in s.get("features", []):
                reg("features", ft)
        for kind in ("features", "spells", "races", "subraces", "traits", "backgrounds", "feats"):
            for x in data.get(kind, []):
                reg(kind, x)
    known = {k: SRD[k] | set(ids[k]) for k in SRD}

    for f in files:
        data = data_by_file.get(f)
        if data is None:
            continue
        rel = f.relative_to(ROOT).as_posix()
        code = f.parent.name
        allowed = {"subclasses", "features", "spells", "races", "subraces", "traits", "backgrounds", "feats", "classSpells", "_about"}
        for key in set(data) - allowed:
            rep.err(rel, f"unknown top-level key {key!r}")

        def feature(ft, where, cls=None):
            need(rep, where, ft, ["id", "name", "en", "level", "desc"])
            if (ft.get("class") or cls) not in CLASSES:
                rep.err(where, f"bad class {ft.get('class') or cls!r}")
            for t in ft.get("addTo", []):
                if t not in known["features"]:
                    rep.err(where, f"addTo unknown feature {t!r}")
            ch = ft.get("choice")
            if ch is not None and (ch.get("kind") not in ("feature", "expertise", "enemy", "terrain") or "n" not in ch):
                rep.err(where, "choice must have kind and n")
            check_effects(rep, where, ft.get("effects", []), known["spells"])
            check_text_entry(rep, where, ft, code)

        for s in data.get("subclasses", []):
            w = f"{rel}:{s.get('id')}"
            need(rep, w, s, ["id", "class", "name", "en", "flavor", "features", "page"])
            if s.get("class") not in CLASSES:
                rep.err(w, f"bad class {s.get('class')!r}")
            if s.get("spellMode", "always") not in ("always", "expanded"):
                rep.err(w, "spellMode must be always|expanded")
            for sp in s.get("spells", []):
                if sp.get("spell") not in known["spells"]:
                    rep.err(w, f"unknown spell {sp.get('spell')!r}")
                if not isinstance(sp.get("level"), int):
                    rep.err(w, f"spell {sp.get('spell')} needs class level")
            cast = s.get("casting")
            if cast is not None:
                if cast.get("ability") not in ABILITIES or cast.get("list") not in CLASSES:
                    rep.err(w, "casting needs ability and list (class id)")
                for f in ("cantrips", "known", "slots"):
                    if not isinstance(cast.get(f), dict):
                        rep.err(w, f"casting.{f} must be a level table")
            for ft in s.get("features", []):
                feature(ft, f"{w}/{ft.get('id')}", s.get("class"))
        for ft in data.get("features", []):
            feature(ft, f"{rel}:{ft.get('id')}")
        for sp in data.get("spells", []):
            w = f"{rel}:{sp.get('id')}"
            need(rep, w, sp, ["id", "name", "en", "level", "school", "cast", "range", "dur", "comp", "classes", "desc", "page"])
            if sp.get("school") not in SCHOOLS:
                rep.err(w, f"bad school {sp.get('school')!r}")
            for c in sp.get("classes", []):
                if c not in CLASSES:
                    rep.err(w, f"bad class {c!r}")
            if sp.get("attack") not in (None, "melee", "ranged"):
                rep.err(w, "attack must be melee|ranged|null")
            sv = sp.get("save")
            if sv is not None and (sv.get("ability") not in ABILITIES or sv.get("success") not in ("half", "none", "other")):
                rep.err(w, "save must be {ability, success: half|none|other}")
            for d in sp.get("dmg") or []:
                if d.get("type") is not None and d.get("type") not in DAMAGE:
                    rep.err(w, f"bad damage type {d.get('type')!r}")
                for tbl in (d.get("slot"), d.get("char")):
                    for v in (tbl or {}).values():
                        if not re.fullmatch(r"\d*d\d+( [+-] (\d+|MOD))*|\d+", v):
                            rep.err(w, f"bad dice {v!r} (use 2d6, 1d8 + MOD)")
            for v in (sp.get("heal") or {}).values():
                if not re.fullmatch(r"(\d*d\d+)?( ?[+-]? ?(\d+|MOD))*", v):
                    rep.err(w, f"bad heal {v!r}")
            if sp.get("aoe") and sp["aoe"].get("type") not in AOE:
                rep.err(w, "bad aoe type")
            check_text_entry(rep, w, sp, code)
        for t in data.get("traits", []):
            w = f"{rel}:{t.get('id')}"
            need(rep, w, t, ["id", "name", "en", "desc", "page"])
            check_effects(rep, w, t.get("effects", []), known["spells"])
            check_text_entry(rep, w, t, code)
        for r in data.get("races", []):
            w = f"{rel}:{r.get('id')}"
            need(rep, w, r, ["id", "name", "en", "speed", "bonuses", "traits", "page"])
            for t in r.get("traits", []):
                if t not in known["traits"]:
                    rep.err(w, f"unknown trait {t!r}")
            for l in r.get("languages", []):
                if l not in LANGS:
                    rep.err(w, f"unknown language {l!r}")
            for a in r.get("bonuses", {}):
                if a not in ABILITIES:
                    rep.err(w, f"bad ability {a!r}")
            check_text_entry(rep, w, r, code)
        for s in data.get("subraces", []):
            w = f"{rel}:{s.get('id')}"
            need(rep, w, s, ["id", "race", "name", "en", "traits", "page"])
            if s.get("race") not in known["races"]:
                rep.err(w, f"unknown race {s.get('race')!r}")
            for t in s.get("traits", []):
                if t not in known["traits"]:
                    rep.err(w, f"unknown trait {t!r}")
            check_text_entry(rep, w, s, code)
        for b in data.get("backgrounds", []):
            w = f"{rel}:{b.get('id')}"
            need(rep, w, b, ["id", "name", "en", "profs", "feature", "page"])
            for p in b.get("profs", []):
                if p not in PROFS:
                    rep.err(w, f"unknown proficiency {p!r}")
            for e in b.get("equipment", []):
                if e.get("id") not in known["equipment"]:
                    rep.err(w, f"unknown equipment {e.get('id')!r}")
            check_effects(rep, w, b.get("effects", []), known["spells"])
            check_text_entry(rep, w, b, code)
        for ft in data.get("feats", []):
            w = f"{rel}:{ft.get('id')}"
            need(rep, w, ft, ["id", "name", "en", "desc", "page"])
            check_effects(rep, w, ft.get("effects", []), known["spells"])
            check_text_entry(rep, w, ft, code)
        for a in data.get("classSpells", []):
            if a.get("class") not in CLASSES:
                rep.err(rel, f"classSpells bad class {a.get('class')!r}")
            for s in a.get("spells", []):
                if s not in known["spells"]:
                    rep.err(rel, f"classSpells unknown spell {s!r}")

    for line in rep.errors + rep.warnings:
        print(line)
    print(f"files: {len(files)}, errors: {len(rep.errors)}, warnings: {len(rep.warnings)}")
    sys.exit(1 if rep.errors else 0)


if __name__ == "__main__":
    main()

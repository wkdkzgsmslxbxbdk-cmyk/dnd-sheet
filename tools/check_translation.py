"""Check Russian translation parts against the English slice.

Usage:
  python -I tools/check_translation.py <slice>      # e.g. spells-1
  python -I tools/check_translation.py --all

Checks: every part parses as JSON, indexes exist in the slice, list fields keep
their length, numbers (and dice) in each field match the English original, and
reports indexes of the slice that have no translation yet.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLICES = ROOT / "sources" / "slices"
PARTS = ROOT / "data" / "ru" / "parts"

NUM = re.compile(r"\d+")
WORD_NUMS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
             "seven": "7", "eight": "8", "nine": "9", "ten": "10"}


def numbers(value) -> Counter:
    text = json.dumps(value, ensure_ascii=False)
    return Counter(NUM.findall(text))


def flatten_strings(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def check_slice(name: str) -> int:
    src = json.loads((SLICES / f"{name}.json").read_text(encoding="utf-8"))
    problems = 0
    done: set[str] = set()
    for part in sorted(PARTS.glob(f"{name}.*.json")):
        try:
            data = json.loads(part.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"[JSON] {part.name}: {e}")
            problems += 1
            continue
        for index, ru in data.items():
            if index not in src:
                print(f"[INDEX] {part.name}: '{index}' нет в срезе {name}")
                problems += 1
                continue
            if index in done:
                print(f"[DUP] {part.name}: '{index}' уже переведён в другом файле")
            done.add(index)
            en = src[index]
            for field, en_val in en.items():
                if field.startswith("_"):
                    continue
                if field not in ru:
                    print(f"[FIELD] {index}: нет поля '{field}'")
                    problems += 1
                    continue
                ru_val = ru[field]
                if isinstance(en_val, list) and (not isinstance(ru_val, list) or len(ru_val) != len(en_val)):
                    print(f"[LEN] {index}.{field}: en={len(en_val)} ru={len(ru_val) if isinstance(ru_val, list) else 'not list'}")
                    problems += 1
                # fields deliberately changed to match the Player's Handbook (errata etc.)
                if field == "name" or field in ru.get("_book_fix", []):
                    continue
                en_n, ru_n = numbers(en_val), numbers(ru_val)
                if en_n != ru_n:
                    missing = en_n - ru_n
                    extra = ru_n - en_n
                    # an English number word may legitimately become a digit and vice versa
                    words = Counter(WORD_NUMS[w] for w in re.findall(r"[a-z]+", flatten_strings(en_val).lower()) if w in WORD_NUMS)
                    if not (extra - words) and not missing:
                        continue
                    print(f"[NUM] {index}.{field}: нет в переводе {dict(missing)} лишние {dict(extra)}")
                    problems += 1
    todo = [i for i in src if i not in done]
    print(f"{name}: переведено {len(done)}/{len(src)}, проблем {problems}")
    if todo:
        print("  не переведены:", ", ".join(todo[:40]) + (" ..." if len(todo) > 40 else ""))
    return problems


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    names = [p.stem for p in sorted(SLICES.glob("*.json"))] if sys.argv[1] == "--all" else sys.argv[1:]
    total = sum(check_slice(n) for n in names)
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()

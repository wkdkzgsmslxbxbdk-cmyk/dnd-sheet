"""Extract text from rulebook PDFs page by page.

Usage: python -I tools/pdf_to_text.py <books-raw dir> <out dir>
Writes <out>/<slug>.txt with "=== PAGE n ===" separators and prints a
per-book summary (pages, chars, pages with almost no text -> likely scans).
"""
import sys
import re
from pathlib import Path

import pymupdf

SLUGS = {
    "Players_Handbook": "phb",
    "Xanathars": "xge",
    "Tasha": "tce",
    "Dungeon Masters": "dmg",
    "Sword Coast": "scag",
    "Elemental_Evil": "eepc",
    "Volo": "vgm",
    "Mornenkainens": "mtf",
    "Kniga_Pravil": "starter",
}


def slug_for(name: str) -> str:
    for key, slug in SLUGS.items():
        if key in name:
            return slug
    return re.sub(r"\W+", "_", name.lower())


def main() -> None:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for pdf in sorted(src.glob("*.pdf")):
        slug = slug_for(pdf.name)
        doc = pymupdf.open(pdf)
        parts, empty, total = [], 0, 0
        for i, page in enumerate(doc, start=1):
            # natural order follows the two-column layout; sort=True mixes columns
            text = page.get_text("text")
            total += len(text)
            if len(text.strip()) < 80:
                empty += 1
            parts.append(f"=== PAGE {i} ===\n{text}")
        (out / f"{slug}.txt").write_text("\n".join(parts), encoding="utf-8")
        print(f"{slug:8} pages={doc.page_count:4} chars={total:9} near-empty={empty:3}  {pdf.name}")


if __name__ == "__main__":
    main()

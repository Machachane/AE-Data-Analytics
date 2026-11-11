"""Read only ENGINE_PROFILE and its referenced strings from the master workbook."""
import gzip
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

SOURCE = Path("attached_assets/MASTER_DATABASE_1794419842444.xlsx")
TARGET = Path("generated-artifacts/engine-profile.json.gz")
SHEET = "ENGINE_PROFILE"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
FIELDS = {
    "A": ("AIRCRAFT_MANUFACTURER", "aircraftManufacturer"),
    "B": ("AIRCRAFT_TYPE", "aircraftType"),
    "C": ("AIRCRAFT_MODEL", "aircraftModel"),
    "D": ("ENGINE_MANUFACTURER", "engineManufacturer"),
    "E": ("ENGINE_FAMILY", "engineFamily"),
    "F": ("Sub variants", "engineVariant"),
    "G": ("Comment", "comment"),
    "H": ("Engine certification date", "certificationDate"),
    "I": ("FAA TCDS Holder", "faaTcdsHolder"),
    "J": ("Thrust (lb f) as per Type Certificate Data Sheet (TCDS)", "thrust"),
    "K": ("Thrust notes", "thrustNotes"),
    "L": ("Sole supplier?", "soleSupplier"),
    "M": ("Competing engine type", "competingEngineType"),
}

with zipfile.ZipFile(SOURCE) as archive:
    sheets = ET.fromstring(archive.read("xl/workbook.xml")).find(NS + "sheets")
    sheet = next(s for s in sheets if s.get("name") == SHEET)
    relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in relations if r.get("Id") == sheet.get(REL + "id"))
    target = target.lstrip("/") if target.startswith("/") else "xl/" + target
    raw_rows, needed = [], set()
    for _, element in ET.iterparse(archive.open(target), events=["end"]):
        if element.tag != NS + "row":
            continue
        row = {}
        for cell in element:
            node = cell.find(NS + "v")
            text = (node.text or "") if node is not None else ""
            kind = cell.get("t")
            if kind == "e":
                raise ValueError(f"Excel error at {cell.get('r')}")
            if kind == "s" and text:
                needed.add(int(text))
            elif kind == "inlineStr":
                text = "".join(t.text or "" for t in cell.iter(NS + "t"))
            if cell.find(NS + "f") is not None and not text:
                raise ValueError(f"Uncached formula at {cell.get('r')}")
            col = "".join(c for c in cell.get("r", "") if c.isalpha())
            row[col] = (kind, text)
        if any(text for _, text in row.values()):
            raw_rows.append((int(element.get("r")), row))
        element.clear()
    strings, i = {}, 0
    for _, element in ET.iterparse(archive.open("xl/sharedStrings.xml"), events=["end"]):
        if element.tag != NS + "si":
            continue
        if i in needed:
            strings[i] = "".join(t.text or "" for t in element.iter(NS + "t"))
        i += 1
        element.clear()
        if len(strings) == len(needed):
            break

def value(row, col):
    kind, text = row.get(col, (None, ""))
    return strings[int(text)] if kind == "s" and text else text

for col, (header, _) in FIELDS.items():
    assert value(raw_rows[0][1], col) == header, f"Unexpected source header in {col}"
canonical = {field: {} for _, field in FIELDS.values()}
rows = []
for index, raw in raw_rows[1:]:
    record = {"id": index}
    for col, (_, field) in FIELDS.items():
        text = value(raw, col)
        if field not in ("comment", "thrustNotes"):
            text = " ".join(text.split())
            text = canonical[field].setdefault(text.casefold(), text)
        record[field] = text
    if not record["engineVariant"]:
        raise ValueError(f"Missing engine variant on source row {index}")
    rows.append(record)

variant_count = len(set(r["engineVariant"] for r in rows))
manufacturer_count = len(set(r["engineManufacturer"] for r in rows))
snapshot = {
    "source": "MASTER_DATABASE.xlsx", "sheet": SHEET, "rows": rows,
    "notes": [
        "Imported ENGINE_PROFILE reference snapshot, not a live engine or fleet feed. All source profile rows are retained, including repeated variants used on different aircraft.",
        f"The uploaded sheet has {len(rows)} profile rows, {variant_count} distinct engine variants and {manufacturer_count} engine manufacturers. Headline cards use distinct nonblank labels from this sheet, not the reference image's static totals.",
        "All three share charts count matching aircraft/engine profile rows, one per source row. Repeated aircraft models across engine sub-variants count again. These shares are profile coverage, not installed-fleet counts or real-world engine market share; no external dataset or inferred join has been added.",
        "Manufacturer and variant headline cards count distinct nonblank source labels case-insensitively. Filters affect all headline cards, charts, certification entries and profile details. No different engine names or spellings are merged.",
        "Sole Supplier is Yes only when every selected profile is marked Yes; otherwise No. The card tooltip shows the actual Yes/No counts, since a mixed selection does not mean every row is No.",
        "Certification entries are distinct variant/date pairs. Different reported certification years for the same variant are retained (for example 772B). TBC is source text, not a date, and sorts first in the default newest-first certification list.",
        "Certification years and thrust values are kept as source text to preserve TBC and original precision. Thrust units are lbf as specified in the source TCDS column; source thrust notes and FAA TCDS holders are included in the full detail table and CSV.",
    ],
}
if variant_count != 611 or manufacturer_count != 7:
    snapshot["notes"].append(
        "The reference image shows 611 variants and 7 engine manufacturers. These totals do not match the supplied ENGINE_PROFILE sheet. No undocumented relationship, extra dataset or hardcoded replacement has been used to force those totals."
    )
TARGET.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(TARGET, "wt", encoding="utf-8") as f:
    json.dump(snapshot, f, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
print("Engine profiles:", len(rows), "variants:", len(set(r["engineVariant"] for r in rows)),
      "manufacturers:", len(set(r["engineManufacturer"] for r in rows)), "bytes:", TARGET.stat().st_size)

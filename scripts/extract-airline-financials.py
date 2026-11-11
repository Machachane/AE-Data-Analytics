"""Extract only the airline financial sheet into a compact private runtime snapshot."""
import datetime
import gzip
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

SOURCE = Path("attached_assets/MASTER_DATABASE_1794419842444.xlsx")
TARGET = Path("generated-artifacts/airline-financials.json.gz")
SHEET = "TIRALIS_AIRLINE_FINANCIAL"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
HEADERS = {
    "A": "ID_METRIC", "B": "METRIC", "C": "ID_CATEGORY", "D": "CATEGORY",
    "E": "AIRLINE", "F": "FINANCIAL YEAR", "G": "REPORTING PERIOD",
    "H": "FISCAL YEAR-END", "I": "CURRENCY", "J": "STATUS", "K": "AMOUNT",
    "L": "DATE", "M": "Reporting Scope", "N": "IFRS16/ASC842 Adoption", "O": "In Administration",
}
DIM_COLS = ["B", "D", "E", "F", "G", "H", "I", "J", "M", "N", "O", "L", "A", "C"]

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
            col = "".join(c for c in cell.get("r", "") if c.isalpha())
            node = cell.find(NS + "v")
            text = (node.text or "") if node is not None else ""
            kind = cell.get("t")
            if kind == "e":
                raise ValueError(f"Excel error at {cell.get('r')}")
            if kind == "s" and text:
                needed.add(int(text))
            elif kind == "inlineStr":
                text = "".join(t.text or "" for t in cell.iter(NS + "t"))
            # Optional ID lookups legitimately cache "" for names without an ID.
            # Both source-ID columns have such values; metric/category names
            # remain present and must not be dropped or inferred from the IDs.
            cached_blank_id = col in {"A", "C"} and kind == "str" and node is not None
            if cell.find(NS + "f") is not None and not text and not cached_blank_id:
                raise ValueError(f"Uncached formula at {cell.get('r')}")
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

for col, header in HEADERS.items():
    assert value(raw_rows[0][1], col) == header, f"Unexpected header at {col}"
dimensions, indexes = [[] for _ in DIM_COLS], [{} for _ in DIM_COLS]

def encode(i, text):
    text = " ".join(text.split())
    if i == 11 and text:
        text = (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(text))).date().isoformat()
    key = text.casefold()
    if key not in indexes[i]:
        indexes[i][key] = len(dimensions[i])
        dimensions[i].append(text)
    return indexes[i][key]

rows = []
for line, raw in raw_rows[1:]:
    row = [encode(i, value(raw, col)) for i, col in enumerate(DIM_COLS)]
    amount = float(value(raw, "K")) if value(raw, "K") else None
    if amount is not None and not math.isfinite(amount):
        raise ValueError(f"Nonfinite amount at K{line}")
    if not value(raw, "B") or not value(raw, "E"):
        raise ValueError(f"Missing metric or airline on source row {line}")
    rows.append(row + [amount, line])

snapshot = {
    "version": 1, "source": "MASTER_DATABASE.xlsx", "sheet": SHEET,
    "dimensions": dimensions, "rows": rows,
    "notes": [
        "Imported TIRALIS_AIRLINE_FINANCIAL snapshot, not a live Tiralis feed. Source DATE is an imported observation date, not the airline fiscal year-end or current freshness.",
        "The default reporting period is Yr. Full-year, half-year, quarterly and custom-month snapshots overlap; do not treat their sum as a single accounting statement.",
        "All current source currencies are USD. The sheet does not specify an amount multiplier, so values retain the source scale and are not labelled millions or rescaled. Missing values stay blank; reported zeroes and negative expenses are retained.",
        "Context cards reproduce first-in-view labels from each filtered dimension independently. With multiple airlines or years, those labels do not identify a valid combined statement; the generator uses actual source combinations instead.",
        "Category selection filters source rows and draws an exploratory waterfall of selected metric sums. Nested totals and their components can double-count, and multiple airlines, financial years, scopes or fiscal year-ends may be represented. The waterfall total is not a balance-sheet reconciliation.",
        "The generator isolates exactly one airline / financial year / reporting period / reporting scope / fiscal year-end / currency / status combination. It uses reported metric lines only: no invented zeroes, inferred subtotals, currency conversions or sums across overlapping snapshots.",
        "Some source statements contain only a subset of metrics. Missing balance sheet or profit/loss lines are not evidence of zero values. Fiscal year-end is significant: the same airline, year, period and scope may have different reported amounts under different fiscal year-ends.",
        "Metric names are used even when the original ID_METRIC is blank. Source metric/category IDs are retained in the records and exports. Text identity is case-insensitive with whitespace normalized; capitalization variants of Reporting Scope are combined without merging different scopes.",
    ],
}
TARGET.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(TARGET, "wt", encoding="utf-8") as f:
    json.dump(snapshot, f, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
print("Financial rows", len(rows), "dimension sizes", [len(d) for d in dimensions], "gzip bytes", TARGET.stat().st_size)
print("Annual rows", sum(dimensions[4][r[4]] == "Yr" for r in rows))

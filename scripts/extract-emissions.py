"""Stream only EMISSIONS_ANALYSIS; retain source blanks, zeroes and precision."""
import gzip
import json
import math
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

SOURCE = Path("attached_assets/MASTER_DATABASE_1794419842444.xlsx")
TARGET = Path("generated-artifacts/emissions.json.gz")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
COLS = ["A", "B", "C", "D", "E", "F", "L", "K", "M", "O", "Q", "R"]
with zipfile.ZipFile(SOURCE) as z:
    styles = ET.fromstring(z.read("xl/styles.xml"))
    custom_formats = {int(f.get("numFmtId")): f.get("formatCode", "") for f in styles.find(NS + "numFmts") or []}
    date_styles = set()
    for index, xf in enumerate(styles.find(NS + "cellXfs")):
        fmt_id = int(xf.get("numFmtId", "0"))
        code = custom_formats.get(fmt_id, "").lower()
        if 14 <= fmt_id <= 22 or (("yy" in code or "dd" in code) and "mm" in code):
            date_styles.add(index)
    sheets = ET.fromstring(z.read("xl/workbook.xml")).find(NS + "sheets")
    sheet = next(s for s in sheets if s.get("name") == "EMISSIONS_ANALYSIS")
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels if r.get("Id") == sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"))
    target = target.lstrip("/") if target.startswith("/") else "xl/" + target
    raw_rows, needed = [], set()
    for _, e in ET.iterparse(z.open(target), events=["end"]):
        if e.tag != NS + "row":
            continue
        values = {}
        for c in e:
            col = "".join(x for x in c.get("r", "") if x.isalpha())
            if col not in COLS:
                continue
            v = c.find(NS + "v")
            raw = v.text if v is not None else ""
            kind = c.get("t")
            if kind == "e" or (c.find(NS + "f") is not None and not raw):
                raise ValueError(f"Invalid source cell {c.get('r')}")
            if kind == "s" and raw:
                needed.add(int(raw))
                raw = ("s", int(raw))
            elif kind == "inlineStr":
                raw = "".join(t.text or "" for t in c.iter(NS + "t"))
            elif col == "B" and raw and int(c.get("s", "0")) in date_styles:
                # Excel has date-formatted serial numbers in the MSN column.
                # Preserve the displayed source text rather than exposing Excel's serial integer.
                raw = (datetime(1899, 12, 30) + timedelta(days=float(raw))).strftime("%d/%m/%Y")
            values[col] = raw
        if int(e.get("r")) != 1 and values.get("A"):
            raw_rows.append([values.get(c, "") for c in COLS])
        e.clear()
    strings, i = {}, 0
    for _, e in ET.iterparse(z.open("xl/sharedStrings.xml"), events=["end"]):
        if e.tag != NS + "si":
            continue
        if i in needed:
            strings[i] = "".join(t.text or "" for t in e.iter(NS + "t"))
        i += 1
        e.clear()
        if len(strings) == len(needed):
            break

dimensions, identities = [[] for _ in range(6)], [{} for _ in range(6)]
rows = []
for raw in raw_rows:
    row = []
    for d, v in enumerate(raw[:6]):
        text = strings[v[1]] if isinstance(v, tuple) else str(v)
        text = " ".join(text.split())
        if d == 0:
            if len(text) != 7 or text[4] != "-" or not 1 <= int(text[5:]) <= 12:
                raise ValueError(f"Invalid source month {text}")
            text += "-01"
        key = text.casefold()
        if key not in identities[d]:
            identities[d][key] = len(dimensions[d])
            dimensions[d].append(text)
        row.append(identities[d][key])
    for v in raw[6:]:
        if isinstance(v, tuple):
            v = strings[v[1]].strip()
        if v == "":
            row.append(None)
        else:
            number = float(v)
            if not math.isfinite(number):
                raise ValueError(f"Nonfinite measure {v}")
            row.append(number)
    rows.append(row)
snapshot = {"version": 1, "source": "MASTER_DATABASE.xlsx", "sheet": "EMISSIONS_ANALYSIS", "dimensions": dimensions, "rows": rows}
TARGET.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(TARGET, "wt", encoding="utf-8") as f:
    json.dump(snapshot, f, separators=(",", ":"), allow_nan=False)
print("Rows", len(rows), "dimensions", [len(d) for d in dimensions], "dates", sorted(dimensions[0]))
for i in [6, 7]:
    values = [r[i] for r in rows if r[i] is not None]
    print("Mean", i, sum(values) / len(values), "count", len(values))
for d in [3, 5, 1]:
    groups = defaultdict(list)
    for row in rows:
        if row[11] is not None:
            groups[row[d]].append(row[11])
    print("Ranking", d, sorted([(dimensions[d][k], sum(v)/len(v), len(v)) for k, v in groups.items() if dimensions[d][k]], key=lambda a: -a[1])[:12])
print("Snapshot bytes", TARGET.stat().st_size)

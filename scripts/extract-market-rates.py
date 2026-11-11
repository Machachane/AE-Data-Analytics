"""Extract only MARKET_VALUE_LEASE_RATES from the large master workbook."""
from collections import defaultdict
import gzip
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

SOURCE = Path("attached_assets/MASTER_DATABASE_1794419842444.xlsx")
TARGET = Path("generated-artifacts/market-value-lease-rates.json.gz")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
SHEET = "MARKET_VALUE_LEASE_RATES"

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
            value = cell.find(NS + "v")
            raw = (value.text or "") if value is not None else ""
            kind = cell.get("t")
            if kind == "e":
                raise ValueError(f"Excel error at {cell.get('r')}")
            if kind == "s" and raw:
                needed.add(int(raw))
            elif kind == "inlineStr":
                raw = "".join(t.text or "" for t in cell.iter(NS + "t"))
            if cell.find(NS + "f") is not None and not raw:
                raise ValueError(f"Uncached formula at {cell.get('r')}")
            row["".join(c for c in cell.get("r", "") if c.isalpha())] = (kind, raw)
        if any(v[1] for v in row.values()):
            raw_rows.append((int(element.get("r")), row))
        element.clear()
    strings, index = {}, 0
    for _, element in ET.iterparse(archive.open("xl/sharedStrings.xml"), events=["end"]):
        if element.tag != NS + "si":
            continue
        if index in needed:
            strings[index] = "".join(t.text or "" for t in element.iter(NS + "t"))
        index += 1
        element.clear()
        if len(strings) == len(needed):
            break

def value(row, col):
    kind, raw = row.get(col, (None, ""))
    return strings[int(raw)] if kind == "s" and raw else raw

def numeric(row, col):
    raw = value(row, col)
    if raw == "":
        return None
    result = float(raw)
    if not math.isfinite(result):
        raise ValueError(f"Invalid number in {col}: {raw}")
    return result

headers = {c: value(raw_rows[0][1], c) for c in raw_rows[0][1]}
assert headers["P"] == "Market Value" and headers["Q"] == "Lease_Rate_L" and headers["R"] == "Lease_Rate_H", headers
columns = {
    "manufacturer": "B", "aircraftType": "C", "aircraftRole": "D", "marketGroup": "E",
    "family": "N", "technology": "O", "icao1": "L", "icao2": "M",
}
canonical = {key: {} for key in columns}
records = []
inverted = []
for index, row in raw_rows[1:]:
    vintage = numeric(row, "A")
    if vintage is None or not vintage.is_integer():
        raise ValueError(f"Missing or invalid vintage on row {index}")
    record = {"id": index, "vintage": int(vintage)}
    for key, col in columns.items():
        text = " ".join(value(row, col).split())
        record[key] = canonical[key].setdefault(text.casefold(), text)
    record.update(marketValue=numeric(row, "P"), leaseRateLow=numeric(row, "Q"), leaseRateHigh=numeric(row, "R"))
    if record["leaseRateLow"] is not None and record["leaseRateHigh"] is not None and record["leaseRateLow"] > record["leaseRateHigh"]:
        inverted.append(record)
    records.append(record)

snapshot = {
    "source": "MASTER_DATABASE.xlsx", "sheet": SHEET, "rows": records,
    "notes": [
        "Imported snapshot from MARKET_VALUE_LEASE_RATES; not a live valuation feed. Vintage is the source aircraft vintage, not a reporting date.",
        "All monetary measures are USD millions. Lease rates are monthly; market values are aircraft values. Missing source values are blank and excluded from averages, not replaced with zero.",
        "Filters affect both headline counts, both aircraft-type range charts and the detail table. Text identity is case-insensitive; distinct model spellings are not merged.",
        "Charts group the filtered rows by Aircraft Type, not by average value: lease bounds are MIN(Lease_Rate_L) and MAX(Lease_Rate_H); market bounds are MIN(Market Value) and MAX(Market Value). Each chart is sorted by its lower bound descending, matching the source report.",
        "Original stacked chart layout matches the screenshot: the invisible offset is the lower bound and the colored bar length is the upper bound, so its axis endpoint is lower + upper. The optional true interval view instead draws from lower to upper. Labels and exports always retain the actual source bounds.",
    ],
}
if inverted:
    snapshot["notes"].append(f"Source quality: {len(inverted)} row(s) report Lease Rate High below Lease Rate Low. Original values are preserved, not swapped or corrected.")
TARGET.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(TARGET, "wt", encoding="utf-8") as out:
    json.dump(snapshot, out, separators=(",", ":"), allow_nan=False)
groups = defaultdict(list)
for r in records:
    groups[r["aircraftType"]].append(r)
print(f"Extracted {len(records)} rows; {len(groups)} types; {len(set(r['manufacturer'] for r in records))} manufacturers")
print("Manufacturers:", sorted(set(r["manufacturer"] for r in records)))
print("Vintages:", min(r["vintage"] for r in records), max(r["vintage"] for r in records))
for name, group in sorted(groups.items(), key=lambda g: -sum(r["leaseRateHigh"] or 0 for r in g[1]) / len(g[1]))[:12]:
    stats = {}
    for field in ["leaseRateLow", "leaseRateHigh", "marketValue"]:
        values = [r[field] for r in group if r[field] is not None]
        stats[field] = {"mean": sum(values)/len(values), "min": min(values), "max": max(values)} if values else None
    print(name, len(group), stats)
print("Missing numeric values:", {f: sum(r[f] is None for r in records) for f in ["marketValue", "leaseRateLow", "leaseRateHigh"]})
print("Inverted source intervals:", inverted)

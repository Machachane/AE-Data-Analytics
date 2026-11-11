"""Import the registry's full monthly history without bundling the source CSV."""
import csv
import datetime
import gzip
import json
import math
from pathlib import Path

SOURCE = Path("attached_assets/AIRCRAFT_REGISTRY_FLEET_DATA_FINAL_1794422133761.csv")
TARGET = Path("generated-artifacts/aircraft-registry.json.gz")
DIMENSIONS = ["AIRCRAFT_MANUFACTURER", "AIRCRAFT_MODEL", "AIRCRAFT_VARIANT", "AIRCRAFT_REG_NUMBER",
              "MANUFACTURER_SERIAL_NUMBER", "OPERATOR", "OWNER", "FIRST_FLIGHT_DATE",
              "ENGINE_MANUFACTURER", "ENGINE_FAMILY", "ENGINE_MASTER_SERIES", "NEAREST_MONTH_START", "UNIQUE_ID"]
MEASURES = ["MANUFACTURED_YEAR", "FLIGHT_HOURS (LTM)", "FLIGHT_CYCLES (LTM)", "HRS_PER_CYCLE"]
dimensions, indexes, rows = [[] for _ in DIMENSIONS], [{} for _ in DIMENSIONS], []

def encode(i, text):
    # Owner identity matches the reference's case-insensitive/trailing-ASCII-space
    # semantics. Leading whitespace and non-ASCII whitespace remain significant.
    text = text.rstrip(" ") if i == 6 else " ".join(text.split())
    if i == 11:
        text = datetime.datetime.strptime(text, "%d/%m/%Y").date().isoformat()
    if i == 7 and text:
        datetime.date.fromisoformat(text)
    key = text.casefold()
    if key not in indexes[i]:
        indexes[i][key] = len(dimensions[i])
        dimensions[i].append(text)
    return indexes[i][key]

def number(text):
    if not text.strip():
        return None
    result = float(text.replace(",", ""))
    if not math.isfinite(result):
        raise ValueError("Nonfinite registry source number")
    return result

with SOURCE.open(encoding="cp1252", newline="") as f:
    reader = csv.DictReader(f)
    assert set(DIMENSIONS + MEASURES).issubset(reader.fieldnames)
    entries = {}
    for source in reader:
        row = [encode(i, source[k]) for i, k in enumerate(DIMENSIONS)] + [number(source[k]) for k in MEASURES]
        # Retain changes in displayed aircraft attributes, but collapse repeated
        # monthly observations of an identical registry entry.
        key = tuple(row[:11] + [row[13]])
        if key not in entries:
            entries[key] = len(entries)
        rows.append(row + [entries[key]])
snapshot = {"version": 1, "source": "AIRCRAFT_REGISTRY_FLEET_DATA_FINAL.csv", "dimensions": dimensions, "rows": rows}
TARGET.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(TARGET, "wt", encoding="utf-8") as f:
    json.dump(snapshot, f, separators=(",", ":"), allow_nan=False)
print("Rows", len(rows), "registry entries", len(entries), "dimension counts", [len(d) for d in dimensions], "blank UID", "" in dimensions[12])
for index in [14, 15, 16]:
    values = [r[index] for r in rows if r[index] is not None]
    print("Measure", index, "sum", sum(values), "mean", sum(values)/len(values))
latest = {}
for i, r in enumerate(rows):
    key = r[12]
    if key not in latest or dimensions[11][r[11]] > dimensions[11][rows[latest[key]][11]]:
        latest[key] = i
for r in sorted([rows[i] for i in latest.values()], key=lambda r: dimensions[7][r[7]], reverse=True)[:5]:
    print([dimensions[i][r[i]] for i in range(13)], r[13:])
print("Latest registry entries", len(latest), "compressed bytes", TARGET.stat().st_size)

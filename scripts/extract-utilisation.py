"""Stream the fleet CSV to a compact, lossless analytics snapshot for App Storage."""
import csv
import datetime
import gzip
import json
import math
from pathlib import Path

SOURCE = Path("attached_assets/AIRCRAFT_REGISTRY_FLEET_DATA_FINAL_1794422133761.csv")
TARGET = Path("generated-artifacts/fleet-utilisation.json.gz")
DIMENSIONS = ["OPERATOR", "AIRCRAFT_MODEL", "MANUFACTURER_SERIAL_NUMBER", "AIRCRAFT_MANUFACTURER", "ENGINE_MASTER_SERIES"]
MEASURES = ["MONTHLY_HOURS_TTL", "AVG_FC_LTT", "HRS_PER_CYCLE", "AVG_FH_LTM", "AVG_FC_LTM"]
dictionaries = [[] for _ in range(6)]
indexes = [{} for _ in range(6)]
rows = []

def encode(index, text):
    text = " ".join(text.split())
    # Match Power BI's case-insensitive identities without merging distinct spellings.
    key = text.casefold()
    if key not in indexes[index]:
        indexes[index][key] = len(dictionaries[index])
        dictionaries[index].append(text)
    return indexes[index][key]

def number(value, row_number, field):
    if not value.strip():
        return None
    try:
        value = float(value.replace(",", ""))
    except ValueError as error:
        raise ValueError(f"Invalid {field} on CSV record {row_number}") from error
    if not math.isfinite(value):
        raise ValueError(f"Non-finite {field} on CSV record {row_number}")
    return value

with SOURCE.open(encoding="cp1252", newline="") as source:
    reader = csv.DictReader(source)
    required = set(DIMENSIONS + MEASURES + ["NEAREST_MONTH_START"])
    if not required.issubset(reader.fieldnames):
        raise ValueError(f"Missing CSV columns: {required - set(reader.fieldnames)}")
    for row_number, record in enumerate(reader, start=2):
        date = datetime.datetime.strptime(record["NEAREST_MONTH_START"], "%d/%m/%Y").date().isoformat()
        dimensions = [encode(i, record[column]) for i, column in enumerate(DIMENSIONS)]
        rows.append(dimensions + [encode(5, date)] + [number(record[column], row_number, column) for column in MEASURES])

snapshot = {
    "version": 1,
    "source": "AIRCRAFT_REGISTRY_FLEET_DATA_FINAL.csv",
    "dimensions": dictionaries,
    "rows": rows,
}
TARGET.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(TARGET, "wt", encoding="utf-8", compresslevel=6) as target:
    json.dump(snapshot, target, separators=(",", ":"), allow_nan=False)
print(json.dumps({
    "records": len(rows),
    "airlines": len(dictionaries[0]),
    "models": len(dictionaries[1]),
    "aircraft": len(dictionaries[2]),
    "minDate": min(dictionaries[5]),
    "maxDate": max(dictionaries[5]),
    "compressedBytes": TARGET.stat().st_size,
}))

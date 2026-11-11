"""Extract only the requested sheet without loading the 174 MB workbook."""
import datetime
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter

SOURCE = Path("attached_assets/MASTER_DATABASE_1794419842444.xlsx")
DESTINATION = Path("artifacts/api-server/data/deliveries.json")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

with zipfile.ZipFile(SOURCE) as archive:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet = next(s for s in workbook.find(NS + "sheets") if s.get("name") == "OD_DELIVERIES")
    relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in relations if r.get("Id") == sheet.get(REL + "id"))
    path = target.lstrip("/") if target.startswith("/") else "xl/" + target
    raw_rows = []
    needed_strings = set()
    for _, element in ET.iterparse(archive.open(path), events=["end"]):
        if element.tag != NS + "row":
            continue
        row = {}
        for cell in element:
            value = cell.find(NS + "v")
            value = (value.text or "") if value is not None else ""
            column = "".join(c for c in cell.get("r", "") if c.isalpha())
            kind = cell.get("t")
            if kind == "s" and value:
                needed_strings.add(int(value))
            row[column] = (kind, value)
        raw_rows.append(row)
        element.clear()
    strings = {}
    index = 0
    for _, element in ET.iterparse(archive.open("xl/sharedStrings.xml"), events=["end"]):
        if element.tag == NS + "si":
            if index in needed_strings:
                strings[index] = "".join(t.text or "" for t in element.iter(NS + "t"))
            index += 1
            element.clear()
            if len(strings) == len(needed_strings):
                break

def value(row, column):
    kind, raw = row.get(column, (None, ""))
    return (strings[int(raw)] if kind == "s" and raw else raw) or ""

headers = {column: value(raw_rows[0], column) for column in raw_rows[0]}
print("Headers:", headers)
records = []
excluded = Counter()
for row in raw_rows[1:]:
    date, quantity = value(row, "I"), value(row, "J")
    if not date or not quantity:
        excluded["missing date or quantity"] += 1
        continue
    try:
        iso_date = (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(date))).date().isoformat()
        quantity = float(quantity)
    except (ValueError, OverflowError):
        excluded["invalid date or quantity"] += 1
        continue
    records.append({
        "id": len(records) + 1,
        # Power BI compares text without case; avoid double-counting e.g. AerCap/AERCAP.
        "customer": value(row, "A").strip().upper() or "UNIDENTIFIED",
        "country": value(row, "B").strip() or "Unidentified",
        "region": value(row, "E").strip() or "Unidentified",
        "model": value(row, "F").strip() or "Unidentified",
        "engine": value(row, "H").strip() or "Unidentified",
        "date": iso_date,
        "quantity": quantity,
        "manufacturer": value(row, "K").strip() or "Unidentified",
    })
dates = [r["date"] for r in records]
dataset = {"source": "MASTER_DATABASE.xlsx", "sheet": "OD_DELIVERIES", "minDate": min(dates), "maxDate": max(dates), "rows": records}
DESTINATION.parent.mkdir(parents=True, exist_ok=True)
DESTINATION.write_text(json.dumps(dataset, separators=(",", ":")))
print("Records:", len(records), "Quantity:", sum(r["quantity"] for r in records))
print("Dates:", min(dates), max(dates), "Excluded:", dict(excluded))
print("Models:", len(set(r["model"] for r in records)), "Customers:", len(set(r["customer"] for r in records)))
print("Regions:", Counter({k: sum(r["quantity"] for r in records if r["region"] == k) for k in set(r["region"] for r in records)}))

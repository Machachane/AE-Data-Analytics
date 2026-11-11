"""Import JURISDICTION_RISK_ANALYSIS and enrich ISO codes with map-only centroids."""
import gzip
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

SOURCE = Path("attached_assets/MASTER_DATABASE_1794419842444.xlsx")
TARGET = Path("generated-artifacts/jurisdiction-risk.json.gz")
COORDINATES = Path("generated-artifacts/jurisdiction-country-centroids.json")
COORDINATE_SOURCE = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"
WORLD = Path("generated-artifacts/jurisdiction-world-source.geojson")
WORLD_SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
SHEET = "JURISDICTION_RISK_ANALYSIS"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
FIELDS = {
    "A": ("id", "id"),
    "B": ("title", "country"),
    "C": ("jurisdiction_type", "jurisdictionType"),
    "D": ("deregistration_score", "deregistrationScore"),
    "E": ("repossession_score", "repossessionScore"),
    "F": ("repossession_overall", "repossessionOverallScore"),
    "M": ("repossession_score_category", "repossessionCategory"),
    "O": ("rule_of_law_compliance_severity", "lawCompliance"),
    "BF": ("contributors", "contributors"),
    "BK": ("region", "region"),
    "BL": ("alpha3", "alpha3"),
}
NUMBERS = {"deregistrationScore", "repossessionScore", "repossessionOverallScore"}

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
            if col not in FIELDS:
                continue
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
            row[col] = (kind, text)
        if any(text for _, text in row.values()):
            raw_rows.append(row)
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
    assert value(raw_rows[0], col) == header, f"Unexpected source header in {col}"

TARGET.parent.mkdir(parents=True, exist_ok=True)
if not COORDINATES.exists():
    with urllib.request.urlopen(COORDINATE_SOURCE, timeout=45) as response:
        countries = json.load(response)
    coords = {c["cca3"]: c["latlng"] for c in countries if len(c.get("latlng", [])) == 2}
    COORDINATES.write_text(json.dumps(coords, separators=(",", ":")))
else:
    coords = json.loads(COORDINATES.read_text())

rows, canonical = [], {f: {} for _, f in FIELDS.values()}
for raw in raw_rows[1:]:
    r = {}
    for col, (_, field) in FIELDS.items():
        text = " ".join(value(raw, col).split())
        if field in NUMBERS:
            v = float(text) if text else None
            if v is not None and (not math.isfinite(v) or not 0 <= v <= 100):
                raise ValueError(f"Invalid score in {field}: {text}")
            r[field] = v
        else:
            r[field] = canonical[field].setdefault(text.casefold(), text)
    if not r["id"] or not r["country"]:
        raise ValueError("Jurisdiction source has a missing country or id")
    point = coords.get(r["alpha3"])
    if not point or not (-90 <= point[0] <= 90 and -180 <= point[1] <= 180):
        raise ValueError(f"No valid country centroid for {r['alpha3']}")
    r.update(latitude=point[0], longitude=point[1])
    r["contributorIds"] = list(dict.fromkeys(v.strip() for v in r.pop("contributors").split("|") if v.strip()))
    rows.append(r)
if len({r["id"] for r in rows}) != len(rows):
    raise ValueError("Duplicate jurisdiction id")

if not WORLD.exists():
    with urllib.request.urlopen(WORLD_SOURCE, timeout=45) as response:
        WORLD.write_bytes(response.read())
world = json.loads(WORLD.read_text())
if world.get("type") != "FeatureCollection" or not world.get("features"):
    raise ValueError("Invalid Natural Earth geography")
for feature in world["features"]:
    props = feature["properties"]
    feature["properties"] = {k: props.get(k) for k in ["NAME_EN", "ADM0_A3", "LABELRANK", "LABEL_X", "LABEL_Y"]}

snapshot = {
    "source": "MASTER_DATABASE.xlsx", "sheet": SHEET,
    "coordinateSource": "mledoze/countries country centroids (ODbL); ISO alpha-3 match, map placement only",
    "mapGeography": json.dumps(world, separators=(",", ":")),
    "rows": rows,
    "notes": [
        "Imported JURISDICTION_RISK_ANALYSIS workbook snapshot; not a live legal-risk feed. Country titles, jurisdiction types, regions and source scores are preserved.",
        "Repossession averages and green bars use repossession_overall, not the different repossession_score column. Averages exclude blank scores and retain reported zeroes. Deregistration uses deregistration_score. Score bars have a fixed 0–100 scale.",
        "Marker and category colors follow the source repossession_score_category: high = green, moderate = amber, low = red. High means a higher source repossession score, not high risk. Categories are not recomputed from invented thresholds.",
        "The Law Compliance filter uses rule_of_law_compliance_severity, not predictive_value_severity or repossession_rule_of_law.",
        "Total contributors counts distinct contributor reference IDs from the source, splitting pipe-separated lists; these references are not a verified count of individual people.",
        "Total Models is separate global context from the existing Aircraft Registry fleet dataset. This sheet has no aircraft-model column or model/country relationship. The fleet model total is not changed by jurisdiction filters.",
        "Country positions are approximate country centroids from https://github.com/mledoze/countries (ODbL), matched on the source alpha3 code. They are not aircraft locations or precise legal boundaries; coordinate enrichment does not change any score or country label.",
        "The interactive basemap uses bundled Natural Earth 1:110m country boundaries (public domain), with no external tile services or map API key. Boundaries are a geographic reference, not a statement of legal or political status. Source: https://www.naturalearthdata.com/about/terms-of-use/.",
    ],
}
with gzip.open(TARGET, "wt", encoding="utf-8") as f:
    json.dump(snapshot, f, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
print("Jurisdictions", len(rows), "regions", len({r["region"] for r in rows}),
      "contributors", len({c for r in rows for c in r["contributorIds"]}), "bytes", TARGET.stat().st_size)
for field in sorted(NUMBERS):
    vals = [r[field] for r in rows if r[field] is not None]
    print(field, "count", len(vals), "mean", sum(vals)/len(vals))

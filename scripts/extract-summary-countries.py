"""Bind registered country to the existing fleet history without duplicating it."""
import collections
import csv
import datetime
import gzip
import hashlib
import json
import urllib.request
from pathlib import Path

OUT = Path("generated-artifacts/summary-countries.json.gz")
norm = lambda s: " ".join(s.split()).casefold()
registry = json.load(gzip.open("generated-artifacts/aircraft-registry.json.gz", "rt"))
country_source = Path("generated-artifacts/summary-country-aliases-source.json")
if not country_source.exists():
    with urllib.request.urlopen("https://raw.githubusercontent.com/mledoze/countries/master/countries.json", timeout=60) as response:
        country_source.write_bytes(response.read())
world = json.load(country_source.open())
risk = json.load(gzip.open("generated-artifacts/jurisdiction-risk.json.gz", "rt"))
aliases = collections.defaultdict(set)
names = {}
for c in world:
    code = c["cca3"]
    names[code] = c["name"]["common"]
    for label in [code, c["cca2"], c["name"]["common"], c["name"]["official"], *c.get("altSpellings", [])]:
        aliases[norm(label)].add(code)
for c in risk["rows"]:
    if c["alpha3"]:
        aliases[norm(c["country"])].add(c["alpha3"])
# Unambiguous source nomenclature and one known source encoding artifact.
# Preserve the original labels in detail rows; only country identity is mapped.
for label, code in {
    "Congo (Democratic Republic of the)": "COD",
    "Congo (Republic of the)": "COG",
    "Cabo Verde": "CPV",
    "CuraÃ§ao": "CUW",
}.items():
    assert code in names
    aliases[norm(label)].add(code)
resolved = {k: next(iter(v)) for k, v in aliases.items() if len(v) == 1}
used = set()
def country_id(label):
    k = norm(label)
    code = resolved.get(k, "__blank__" if not k else "unmapped:" + k)
    used.add(code)
    if code not in names:
        names[code] = "(Blank country)" if not k else label + " (unmapped)"
    return code

labels, codes, indexes, rows = [], [], {}, []
signature = json.dumps([registry["dimensions"], [r[:13] for r in registry["rows"]]], ensure_ascii=False, separators=(",", ":"))
fingerprint = hashlib.sha256(signature.encode()).hexdigest()
with open("attached_assets/AIRCRAFT_REGISTRY_FLEET_DATA_FINAL_1794422133761.csv", encoding="cp1252", newline="") as f:
    for i, raw in enumerate(csv.DictReader(f)):
        r = registry["rows"][i]
        for col, field in [(0, "AIRCRAFT_MANUFACTURER"), (1, "AIRCRAFT_MODEL"), (3, "AIRCRAFT_REG_NUMBER"), (4, "MANUFACTURER_SERIAL_NUMBER"), (5, "OPERATOR")]:
            assert norm(registry["dimensions"][col][r[col]]) == norm(raw[field]), f"Fleet alignment mismatch at {i}/{field}"
        assert registry["dimensions"][11][r[11]] == datetime.datetime.strptime(raw["NEAREST_MONTH_START"], "%d/%m/%Y").date().isoformat()
        label = " ".join(raw["AIRCRAFT_REGISTER"].split())
        k = norm(label)
        if k not in indexes:
            indexes[k] = len(labels)
            labels.append(label)
            codes.append(country_id(label))
        rows.append(indexes[k])
assert len(rows) == len(registry["rows"])
for source in ["deliveries", "orders"]:
    for r in json.load(open(f"artifacts/api-server/data/{source}.json"))["rows"]:
        country_id(r["country"])
for r in risk["rows"]:
    if r["alpha3"]:
        used.add(r["alpha3"])
for label in labels:
    resolved[norm(label)] = country_id(label)
payload = {
    "version": 1, "registryRows": len(rows), "registrySignature": fingerprint,
    "aliasSource": "https://github.com/mledoze/countries (ODbL); country identity enrichment only",
    "labels": labels, "codes": codes, "rows": rows, "aliases": resolved,
    "countries": sorted([{"id": code, "name": names.get(code, code)} for code in used], key=lambda x: x["name"].casefold()),
}
OUT.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(OUT, "wt", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
print("Summary country rows", len(rows), "country labels", len(labels), "country choices", len(payload["countries"]), "bytes", OUT.stat().st_size)
print("Unmapped labels", [label for label, code in zip(labels, codes) if code.startswith("unmapped:")])

"""Validate the three finance workbooks and create a compact runtime snapshot."""
import argparse
from collections import Counter
import gzip
import json
import math
from pathlib import Path
import posixpath
import xml.etree.ElementTree as ET
import zipfile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def workbook(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(t.text or "" for t in si.iterfind(".//m:t", NS))
                for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ]
        relations = {
            rel.get("Id"): rel.get("Target")
            for rel in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        sheets = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find("m:sheets", NS):
            target = relations[sheet.get(RID)]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            records = []
            for row in ET.fromstring(archive.read(target)).findall("m:sheetData/m:row", NS):
                record = {}
                for cell in row:
                    col = "".join(c for c in cell.get("r", "") if c.isalpha())
                    kind = cell.get("t")
                    if kind == "e":
                        raise ValueError(f"Excel error in {path}: {cell.get('r')}")
                    value = cell.find("m:v", NS)
                    value = value.text if value is not None else ""
                    if kind == "s":
                        value = strings[int(value)]
                    elif kind == "inlineStr":
                        value = "".join(t.text or "" for t in cell.iterfind(".//m:t", NS))
                    if cell.find("m:f", NS) is not None and value == "":
                        raise ValueError(f"Uncached formula in {path}: {cell.get('r')}")
                    record[col] = value
                if any(v != "" for v in record.values()):
                    records.append(record)
            if not records:
                raise ValueError(f"Empty worksheet: {path}, {sheet.get('name')}")
            headers = records[0]
            sheets[sheet.get("name")] = [
                {header: row.get(col, "") for col, header in headers.items() if header}
                for row in records[1:]
            ]
        return sheets


def number(value):
    if value == "" or value is None:
        raise ValueError("Missing numeric finance value")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Nonfinite finance value")
    return result


def integer(value):
    result = number(value)
    if not result.is_integer():
        raise ValueError("Noninteger year/deal count")
    return int(result)


def text(value):
    return " ".join(str(value).split())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mla", default="attached_assets/MLA_CM_CO_MERGED_1794423040817.xlsx")
    parser.add_argument("--borrowers", default="attached_assets/BORROWER_transposed_1794423117428.xlsx")
    parser.add_argument("--analyses", default="attached_assets/Aviation_Analyses_1794423357544.xlsx")
    args = parser.parse_args()
    mla = []
    borrowers = []
    for r in workbook(args.mla)["MLA CM-CO merged"]:
        row = dict(name=text(r["MLA"]), total=number(r["Col T amnt"]), deals=integer(r["NR DEALS"]),
                   capitalMarkets=number(r["Cap Mkts"]), commercial=number(r["Commercial"]),
                   period=text(r["REPORTING PERIOD"]), year=integer(r["YEAR"]))
        if not row["name"] or row["deals"] < 0 or abs(row["total"] - row["capitalMarkets"] - row["commercial"]) > 0.01:
            raise ValueError(f"Invalid MLA totals: {row}")
        mla.append(row)
    for r in workbook(args.borrowers)["BORROWER Transposed"]:
        row = dict(name=text(r["Borrower"]), total=number(r["$ Volume"]), deals=integer(r["NR DEALS"]),
                   period=text(r["REPORTING PERIOD"]), year=integer(r["YEAR"]))
        if not row["name"] or row["deals"] < 0:
            raise ValueError(f"Invalid borrower: {row}")
        borrowers.append(row)
    analyses = []
    sheets = workbook(args.analyses)
    for title in ["Facility Analysis", "Financier Analysis", "Geographic Analysis"]:
        rows = sheets[title]
        cols = [k for k in rows[0] if k not in [title, "Order"]]
        analysis_rows = []
        for r in sorted(rows, key=lambda r: number(r["Order"])):
            unit = "usd-bn" if text(r[title]) == "Total ($Bn)" else "percent"
            values = [number(r[c]) for c in cols]
            if unit == "percent" and any(v < 0 or v > 1 for v in values):
                raise ValueError(f"Invalid share: {r}")
            analysis_rows.append(dict(label=text(r[title]), values=values, unit=unit))
        analyses.append(dict(title=title, columns=cols, rows=analysis_rows))
    result = dict(version=1, sources=["MLA_CM_CO_MERGED.xlsx", "BORROWER_transposed.xlsx", "Aviation_Analyses.xlsx"],
                  mla=mla, borrowers=borrowers, analyses=analyses)
    output = Path("generated-artifacts/aviation-finance.json.gz")
    output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output, "wt", encoding="utf-8") as stream:
        json.dump(result, stream, separators=(",", ":"), allow_nan=False)
    print(f"Validated {len(mla)} MLA rows, {len(borrowers)} borrower rows and {len(analyses)} analysis tables.")
    print("Periods:", sorted(Counter((r["year"], r["period"]) for r in mla).items()))
    print("Anonymous MLA names:", sorted({r["name"] for r in mla if "disclos" in r["name"].lower()}))
    print("Snapshot:", output, output.stat().st_size, "bytes")


if __name__ == "__main__":
    main()

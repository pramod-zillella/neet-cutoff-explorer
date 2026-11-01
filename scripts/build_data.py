"""Convert MCC allocation workbooks to an aggregate-only, static dashboard dataset."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
ROUNDS = [("Round_1", "Round 1"), ("Round_2", "Round 2"),
          ("Round_3", "Round 3"), ("Round_Stray", "Stray")]
MISSING = {"", "-", "--", "none", "nan", "null"}


def clean(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value or ""))).strip()


def key(value):
    return re.sub(r"[^a-z0-9]", "", clean(value).lower())


def present(value):
    return clean(value).lower() not in MISSING


QUOTAS = {
    "All India": ["AI"], "DNB Quota": ["AD"],
    "Management / paid seats": ["PS", "Management/Paid Seats Quota", "Self-Financed Merit Seat", "Self-Financed Merit Seat/(Paid Seat Quota)"],
    "Non-Resident Indian": ["NR"], "Delhi University Quota": ["DU"],
    "IP University Quota": ["IP"], "Aligarh Muslim University": ["AM"],
    "Banaras Hindu University": ["BH"], "Jain Minority Quota": ["JM"],
    "Muslim Minority Quota": ["MM"], "Armed Forces Medical": ["AF"],
}
QUOTA_LOOKUP = {key(alias): label for label, aliases in QUOTAS.items() for alias in [label, *aliases]}
STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"]
STATE_ALIASES = {state: state for state in STATES}
STATE_ALIASES.update({"Orissa": "Odisha", "Pondicherry": "Puducherry", "Uttaranchal": "Uttarakhand", "Jammu & Kashmir": "Jammu and Kashmir", "J&K": "Jammu and Kashmir", "Dadra and Nagar Haveli": "Dadra and Nagar Haveli and Daman and Diu", "Daman and Diu": "Dadra and Nagar Haveli and Daman and Diu", "Andaman & Nicobar": "Andaman and Nicobar Islands"})
STATE_PATTERNS = [(re.compile(r"(?<![a-z])" + r"\s*".join(re.escape(part) for part in alias.split()) + r"(?![a-z])", re.I), state) for alias, state in STATE_ALIASES.items()]
STATE_PATTERNS += [(re.compile(pattern, re.I), state) for pattern, state in [
    (r"\bU\.?P\.?\b", "Uttar Pradesh"), (r"\bM\.P\b", "Madhya Pradesh"),
    (r"\bC\.G\b", "Chhattisgarh"), (r"\bHP\b", "Himachal Pradesh")]]


def extract_state(institute):
    # The address at the end is more reliable than state names in an institution's title.
    matches = [(m.start(), len(m.group()), state) for pattern, state in STATE_PATTERNS for m in pattern.finditer(institute)]
    return max(matches)[2] if matches else "Unknown (not stated)"


def column(headers, prefix, *names):
    for name in names:
        if prefix + name in headers:
            return headers.index(prefix + name)
    raise ValueError(f"Missing column: {prefix}{names}; found {headers}")


def read_sources(source_dir, years, mcc_pdf=None):
    records, history, sources, rejected = [], Counter(), [], []
    for year in years:
        if year == 2026:
            from mcc_2026_source import SOURCE_URL, SHA256, extract
            source_pdf = mcc_pdf or ROOT / "documents/2026/round-1.pdf"
            allotments = extract(source_pdf)
            for row in allotments:
                quota = QUOTA_LOOKUP.get(key(row["quota"]))
                if quota is None:
                    raise ValueError(f"Unmapped 2026 MCC quota {row['quota']!r}")
                records.append((2026, 0, row["college"], row["course"],
                                quota, row["allotted_category"], row["neet_pg_air"]))
            sources.append({"year": 2026, "round": "Round 1", "document": "MCC final allotment PDF",
                            "sourceUrl": SOURCE_URL, "sha256": SHA256, "sourceRows": len(allotments),
                            "included": len(allotments), "missingInSuppliedCsv": 1733})
            print(f"2026 MCC Round 1: {len(allotments):,} allotments from official PDF", flush=True)
            continue
        path = source_dir / f"{year}_Seat_Allocation.xlsx"
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for round_index, (suffix, label) in enumerate(ROUNDS):
            sheet = workbook[f"{year}_{suffix}"]
            iterator = sheet.iter_rows(values_only=True)
            headers = [clean(h) for h in next(iterator)]
            prefix = f"{label}_" if round_index in (1, 2) else ""
            fields = {
                "rank": column(headers, "", "Rank"),
                "college": column(headers, prefix, "Allotted Institute"),
                "branch": column(headers, prefix, "Course", "Couse"),
                "quota": column(headers, prefix, "Allotted Quota"),
                "category": column(headers, prefix, "Alloted Category", "Allotted Category"),
                "remarks": column(headers, prefix, "Remarks"),
            }
            historical_columns = [i for i, h in enumerate(headers) if h.endswith("Allotted Institute") and i != fields["college"]]
            stats = Counter()
            seen = set()
            for row_number, row in enumerate(iterator, 2):
                stats["sourceRows"] += 1
                for i in historical_columns:
                    if present(row[i]):
                        history[clean(row[i])] += 1
                values = {f: clean(row[i]) for f, i in fields.items()}
                if not present(values["college"]):
                    stats["noCurrentAllotment"] += 1
                    continue
                try:
                    rank_number = float(values["rank"].replace(",", ""))
                    if rank_number <= 0 or not rank_number.is_integer():
                        raise ValueError("Invalid rank")
                    rank = int(rank_number)
                except (ValueError, OverflowError):
                    stats["rejected"] += 1
                    rejected.append({"sheet": sheet.title, "row": row_number, "reason": "invalid rank"})
                    continue
                if any(not present(values[f]) for f in ("branch", "quota", "category")):
                    stats["rejected"] += 1
                    rejected.append({"sheet": sheet.title, "row": row_number, "reason": "missing allotment fields"})
                    continue
                remarks = values["remarks"].lower()
                if not (remarks.startswith("allotted") or remarks.startswith("fresh allotted") or remarks.startswith("upgraded")):
                    stats["rejected"] += 1
                    rejected.append({"sheet": sheet.title, "row": row_number, "reason": "unexpected allotment status", "status": values["remarks"]})
                    continue
                quota = QUOTA_LOOKUP.get(key(values["quota"]))
                if quota is None:
                    raise ValueError(f"Unmapped quota {values['quota']!r} in {sheet.title}")
                record = (year, round_index, values["college"], values["branch"], quota, values["category"], rank)
                duplicate_key = (rank, key(values["college"]), key(values["branch"]), quota, key(values["category"]))
                if duplicate_key in seen:
                    stats["duplicates"] += 1
                    continue
                seen.add(duplicate_key)
                records.append(record)
                stats["included"] += 1
            sources.append({"year": year, "round": label, "workbook": path.name, "sheet": sheet.title, **stats})
            print(f"{sheet.title}: {stats['included']:,} allotments; {stats['noCurrentAllotment']:,} rows without a current allotment", flush=True)
        workbook.close()
    return records, history, sources, rejected


def display_name(full, historical_names):
    normalized = key(full)
    # Only exact normalized prefixes; no fuzzy college matching.
    candidates = [name for name in historical_names.get(normalized[:8], []) if normalized.startswith(key(name))]
    if candidates:
        return max(candidates, key=lambda n: (len(key(n)), -len(n))).strip(" ,.")
    # Keep two address segments for new institutions without historical names.
    parts = [part.strip() for part in full.split(",") if part.strip()]
    if len(parts) > 1 and key(parts[1]).startswith(key(parts[0])):
        return parts[0]
    return ", ".join(parts[:2])


def branch_label(source):
    value = clean(source)
    # These aliases keep degree types separate, while shortening unwieldy official names.
    aliases = {
        "M.D. (DERM.,VENE. and LEPROSY)/ (DERMATOLOGY)/(SKIN and VENEREAL DISEASES)/(VENEREOLOGY)": "MD · Dermatology, Venereology & Leprosy",
        "M.D. (Obst. and Gynae)/MS (Obstetrics and Gynaecology)": "MD/MS · Obstetrics & Gynaecology",
        "M.D. (PREVENTIVE and SOCIAL MEDICINE)/ COMMUNITY MEDICINE": "MD · Community Medicine",
        "M.D. (Tuberculosis and Respiratory diseases)/Pulmonary Medicine /M.D. (Respiratory Medicine)": "MD · Respiratory Medicine",
        "M.D. (Emergency and Critical Care)/M.D. (Emergency Medicine)": "MD · Emergency Medicine",
        "M.D. (Radiotherapy/ Radiation Oncology)": "MD · Radiation Oncology",
        "M.D. IN TRANSFUSION MEDICINE/ IMMUNO-HAEMATOLOGY and BLOOD TRANSFUSION": "MD · Transfusion Medicine",
        "MD/MS (Anatomy)": "MD/MS · Anatomy",
        "M.S. (E.N.T.)": "MS · ENT",
    }
    mapped = {key(k): v for k, v in aliases.items()}.get(key(value))
    if mapped:
        return mapped
    for pattern, degree in [(r"^\(NBEMS-DIPLOMA\)\s*", "NBEMS Diploma"), (r"^\(NBEMS\)\s*", "DNB"), (r"^M\.D\.\s*", "MD"), (r"^M\.S\.\s*", "MS"), (r"^M\.Ch\.\s*", "MCh"), (r"^M\.P\.H\.\s*", "MPH")]:
        if re.match(pattern, value, re.I):
            subject = re.sub(pattern, "", value, flags=re.I).strip()
            if subject.startswith("(") and subject.endswith(")"):
                subject = subject[1:-1]
            subject = re.sub(r"radio\s*-\s*diagnosis", "Radiodiagnosis", subject, flags=re.I)
            return f"{degree} · {subject.title()}"
    return value.title()


def branch_identity(source):
    """Merge only reviewed spelling variants of the same degree and course."""
    label = branch_label(source)
    aliases = {
        "MD · Bio-Chemistry": "MD · Biochemistry",
        "MD · Radiodiagnosis /Radiology": "MD · Radiodiagnosis",
        "MD · Radiation Oncology/ Radiotherapy": "MD · Radiation Oncology",
        "MD · Dermatology, Venereology And Leprosy/Dermatology": "MD · Dermatology, Venereology & Leprosy",
        "MD · In Nuclear Medicine": "MD · Nuclear Medicine",
        "MD · Physical Med. And Rehabilitation": "MD · Physical Medicine & Rehabilitation",
        "MD · Physical Medicine And Rehabilitation": "MD · Physical Medicine & Rehabilitation",
        "MD · Community Medicine/Social And Preventive Medicine": "MD · Community Medicine",
        "MD · Respiratory Medicine/Tuberculosis And Respiratory Diseases": "MD · Respiratory Medicine",
        "MS · Otorhinolaryngology/Ent": "MS · ENT",
        "DNB · Dermatology And Venereology And Leprosy": "DNB · Dermatology, Venereology & Leprosy",
        "DNB · Dermatology, Venereology And Leprosy": "DNB · Dermatology, Venereology & Leprosy",
        "DNB · Physical Med. And Rehabilitation": "DNB · Physical Medicine & Rehabilitation",
        "DNB · Physical Medicine And Rehabilitation": "DNB · Physical Medicine & Rehabilitation",
        "DNB · Immuno- Haematology And Blood Transfusion": "DNB · Immunohematology and Blood Transfusion",
        "DNB · Immunohematology And Blood Transfusion": "DNB · Immunohematology and Blood Transfusion",
        "DNB · Otorhinolaryngolo Gy (Ent)": "DNB · ENT",
        "DNB · Otorhinolaryngology (E.N.T.)": "DNB · ENT",
        "DNB · Radio Diagnosis": "DNB · Radiodiagnosis",
        "NBEMS Diploma · Otorhinolaryngology (E.N.T.": "NBEMS Diploma · ENT",
        "NBEMS Diploma · Otorhinolaryngology (E.N.T.)": "NBEMS Diploma · ENT",
        "NBEMS Diploma · Ent": "NBEMS Diploma · ENT",
        "NBEMS Diploma · Tuberculosis And Chest Disease": "NBEMS Diploma · Tuberculosis and Chest Diseases",
        "NBEMS Diploma · Tuberculosis And Chest Diseases": "NBEMS Diploma · Tuberculosis and Chest Diseases",
    }
    canonical = aliases.get(label, label)
    return key(canonical), canonical


def build(source_dir, output_dir, years, mcc_pdf=None):
    records, history, sources, rejected = read_sources(source_dir, years, mcc_pdf)
    full_names, branch_names = defaultdict(Counter), defaultdict(Counter)
    for _, _, college, branch, *_ in records:
        full_names[key(college)][college] += 1
        branch_names[branch_identity(branch)[0]][branch] += 1
    historical_names = defaultdict(list)
    for name in history:
        historical_names[key(name)[:8]].append(name)
    colleges = []
    for identity, variants in sorted(full_names.items()):
        address = variants.most_common(1)[0][0]
        colleges.append({"id": "c" + hashlib.sha256(identity.encode()).hexdigest()[:12], "name": display_name(address, historical_names), "state": extract_state(address), "address": address, "sourceVariants": len(variants), "identity": identity})
    # Recover a missing state only from another exact normalized institution name.
    known_states = defaultdict(list)
    for college in colleges:
        if not college["state"].startswith("Unknown"):
            known_states[key(college["name"])].append(college["state"])
    for college in colleges:
        if college["state"].startswith("Unknown") and len(known_states[key(college["name"])]) == 1:
            college["state"] = known_states[key(college["name"])][0]
            college["stateSource"] = "Matching institution name in another source address"
    # A changed address matches only with an exact institution name, state AND PIN.
    merged, address_merges = {}, []
    for college in colleges:
        pins = re.findall(r"(?<!\d)[1-9]\d{5}(?!\d)", college["address"])
        merge_key = (key(college["name"]), college["state"], pins[-1]) if pins else (college["identity"],)
        if merge_key not in merged:
            merged[merge_key] = {**college, "identities": [college["identity"]], "addresses": [college["address"]]}
        else:
            target = merged[merge_key]
            target["identities"].append(college["identity"])
            target["addresses"].append(college["address"])
            target["sourceVariants"] += college["sourceVariants"]
            if len(college["address"]) > len(target["address"]):
                target["address"] = college["address"]
    colleges = list(merged.values())
    for college in colleges:
        if len(college["addresses"]) > 1:
            address_merges.append({"id": college["id"], "name": college["name"], "addresses": college["addresses"]})
        college.pop("addresses")
        college.pop("identity")
    colleges.sort(key=lambda c: (c["name"].casefold(), c["address"].casefold()))
    college_index = {identity: i for i, c in enumerate(colleges) for identity in c.pop("identities")}
    branches = []
    for identity, variants in branch_names.items():
        # Prefer the least fragmented source spelling (mostly the first-round version).
        original = min(variants, key=lambda n: (len(n), -variants[n]))
        branches.append({"id": "b" + hashlib.sha256(identity.encode()).hexdigest()[:10], "name": branch_identity(original)[1], "sourceName": original, "identity": identity, "sourceVariants": list(variants)})
    branches.sort(key=lambda b: b["name"].casefold())
    branch_index = {b.pop("identity"): i for i, b in enumerate(branches)}
    quotas = list(QUOTAS)
    categories = sorted({r[5] for r in records}, key=lambda c: (c != "Open", c))
    aggregates = {}
    for year, round_index, college, branch, quota, category, rank in records:
        group = (year, round_index, college_index[key(college)], branch_index[branch_identity(branch)[0]], quotas.index(quota), categories.index(category))
        if group not in aggregates:
            aggregates[group] = [rank, rank, 0]
        values = aggregates[group]
        values[0] = min(values[0], rank)
        values[1] = max(values[1], rank)
        values[2] += 1
    rows = [list(group) + values for group, values in sorted(aggregates.items())]
    assert sum(r[-1] for r in rows) == len(records)
    unresolved = [{"id": c["id"], "name": c["name"], "address": c["address"]} for c in colleges if c["state"].startswith("Unknown")]
    names_to_colleges = defaultdict(list)
    for c in colleges:
        names_to_colleges[(key(c["name"]), c["state"])].append(c["id"])
    name_collisions = [ids for ids in names_to_colleges.values() if len(ids) > 1]
    report = {"sources": sources, "includedAllotments": len(records), "aggregateRows": len(rows), "colleges": len(colleges), "branches": len(branches), "rejected": rejected, "unknownStates": unresolved, "addressMerges": address_merges, "sameNameDifferentAddress": name_collisions}
    dataset = {"schemaVersion": 1, "generatedAt": datetime.now(timezone.utc).isoformat(), "years": sorted(years, reverse=True), "rounds": [r[1] for r in ROUNDS], "columns": ["year", "round", "college", "branch", "quota", "category", "opening", "closing", "count"], "colleges": colleges, "branches": branches, "quotas": quotas, "categories": categories, "rows": rows, "quality": report}
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(dataset, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    (output_dir / "cutoffs.js").write_text("window.NEET_DATA = " + payload + ";\n", encoding="utf-8")
    (output_dir / "quality-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(rows):,} aggregate groups, {len(colleges):,} institutions, {len(branches)} courses. Unknown state: {len(unresolved)}; rejected: {len(rejected)}")
    return dataset


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--years", type=int, nargs="+", default=[2024, 2025, 2026])
    parser.add_argument("--mcc-pdf", type=Path, default=ROOT / "documents/2026/round-1.pdf")
    args = parser.parse_args()
    build(args.source_dir, args.output_dir, args.years, args.mcc_pdf)

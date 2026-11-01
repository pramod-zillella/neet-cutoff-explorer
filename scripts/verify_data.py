"""Check the published aggregate bundle and its 2026 source PDF."""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path

from mcc_2026_source import SHA256


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "documents/2026/round-1.pdf"
assert hashlib.sha256(PDF.read_bytes()).hexdigest() == SHA256

text = (ROOT / "data/cutoffs.js").read_text(encoding="utf-8").strip()
assert text.startswith("window.NEET_DATA = ") and text.endswith(";")
data = json.loads(text[len("window.NEET_DATA = "):-1])
report = json.loads((ROOT / "data/quality-report.json").read_text(encoding="utf-8"))
assert data["quality"] == report
assert data["years"] == [2026, 2025, 2024]
assert len(data["colleges"]) == 2875 and len(data["branches"]) == 125
assert len(report["unknownStates"]) == 179 and not report["rejected"]
assert len({college["id"] for college in data["colleges"]}) == len(data["colleges"])
assert len({branch["id"] for branch in data["branches"]}) == len(data["branches"])
counts = Counter()
for year, round_index, college, branch, quota, category, opening, closing, count in data["rows"]:
    assert year in data["years"] and 0 <= round_index < 4
    assert 0 <= college < len(data["colleges"]) and 0 <= branch < len(data["branches"])
    assert 0 <= quota < len(data["quotas"]) and 0 <= category < len(data["categories"])
    assert 0 < opening <= closing and count > 0
    counts[(year, round_index)] += count
assert counts == {
    (2024, 0): 24671, (2024, 1): 16182, (2024, 2): 13991, (2024, 3): 2331,
    (2025, 0): 26889, (2025, 1): 20787, (2025, 2): 18673, (2025, 3): 2798,
    (2026, 0): 28723,
}
assert report["includedAllotments"] == sum(counts.values()) == 155045
for name in ("MD · Radiodiagnosis", "MD · Radiation Oncology", "MD · Dermatology, Venereology & Leprosy", "MS · ENT"):
    assert sum(branch["name"] == name for branch in data["branches"]) == 1, name
assert next(source for source in report["sources"] if source["year"] == 2026)["missingInSuppliedCsv"] == 1733
print("Verified 155,045 aggregate allotments, 2026 Round 1 coverage, course labels and source checksum.")

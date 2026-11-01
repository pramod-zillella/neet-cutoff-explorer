# NEET-PG Cutoff Explorer

Static GitHub Pages dashboard for MCC allotment ranks in 2024, 2025 and 2026. The 2026 data currently covers **Round 1 only**. Browse college overview, compare colleges, or explore a state; filter by course, quota and allotted seat category. Search, sort, scroll through results and export filtered CSV.

Open [the dashboard](index.html) locally, or use the published GitHub Pages site. The dashboard data is bundled in `data/cutoffs.js`; no server or API key is needed to browse.

## Coverage

| Exam year | Round 1 | Round 2 | Round 3 | Stray |
| --- | ---: | ---: | ---: | ---: |
| 2024 | 24,671 | 16,182 | 13,991 | 2,331 |
| 2025 | 26,889 | 20,787 | 18,673 | 2,798 |
| 2026 | 28,723 | Not included | Not included | Not included |

The 2024-2025 data comes from the allocation workbooks. The 2026 source is MCC's [official final Round 1 PDF](documents/2026/round-1.pdf), [published on MCC](https://mcc.nic.in/document/final-allotment-result-for-pg-counselling-round-1-dated-24-10-2026/). The supplied 2026 CSV contained 26,990 rows and omitted the first row of nearly every PDF page (1,733 rows in total). The site uses all 28,723 unique AIRs recovered directly from the official PDF. The source extractor checks its SHA-256, page count, sequence and unique AIRs.

Cutoffs group records by exam year, round, institute, course, allotted quota and **allotted seat category**. Opening rank is the minimum AIR; closing rank is the maximum AIR; count is the number of allotment events in that group. A reserved-category candidate assigned an Open seat contributes to Open, not to their personal category. Quotas stay on separate rows. A dash in a 2026 later-round column means that round is **not yet in this dataset**, not that no seat was allotted. Allotments are not final joined admissions, and counts across rounds are not unique seats or candidates.

The published bundle contains 155,045 allotment events, 2,875 institution address records and 125 course labels. Institution address records are not verified unique college identities. The build merges only exact normalized addresses or reviewed same-name/state/PIN variations. It consolidates reviewed spelling variants for the same degree and course, while preserving MD/MS, DNB and diploma routes separately. **179 address records have an unknown state**, so state browsing may omit them; they remain available in the college search. See [the quality report](data/quality-report.json) for source counts and unresolved records.

## Rebuild and validate

Install Python dependencies with `python -m pip install -r requirements.txt`, then run:

```powershell
python scripts/build_data.py --source-dir 'C:\Users\pzillella\Downloads\Prompt Tuning_Dimitri Notebooks\Dimitri Notebooks\PersonalExperiments'
python scripts/verify_data.py
node scripts/check_browser.cjs
```

The source directory must contain `2024_Seat_Allocation.xlsx` and `2025_Seat_Allocation.xlsx`. The MCC PDF is retained at `documents/2026/round-1.pdf`. Building regenerates `data/cutoffs.js` and `data/quality-report.json`; neither source workbook nor individual candidate rows are published. Push the generated site files to `main` to update GitHub Pages.

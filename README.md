# NEET PG Cutoff Explorer

A static dashboard built from `2024_Seat_Allocation.xlsx` and `2025_Seat_Allocation.xlsx`.

## Open the dashboard

Double-click **`Open Dashboard.cmd`**, or open **`index.html`** in Edge, Chrome or Firefox. The site works directly from disk; Python and a web server are not required to view it.

The initial view uses 2025, Osmania Medical College, the **Open allotted-seat category**, and all quotas shown separately.

- **College overview:** select a college to see every available course, with Round 1, Round 2, Round 3 and Stray in columns.
- **Compare colleges:** select several colleges and one course to compare their cutoffs in the same round columns.
- **Explore a state:** select a state or union territory and one or more courses. Clear the selected courses to include all courses.
- Change the counselling year, allotted category or displayed metric in any view.
- **Allotment quota:** open the dropdown and tick one or more quotas. Use **Clear selection** before choosing a specific combination, or **Select all** to restore all quotas. Clearing every quota shows no results until you select one. Each selected quota keeps its own cutoff rows.
- Scroll inside the results table to browse continuously. More rows appear automatically near the bottom, and the round headings stay visible. The footer shows how many results are loaded; **Back to top** returns to the beginning. Changing filters or sorting restarts the table at the top.
- Click a round heading to sort. Use result search to search **all matching results**, including rows you have not scrolled to. CSV export includes **all matching rows**, with opening rank, closing rank and count for every round.
- Once hosted, **Copy view link** shares the selected filters. A link to a local file or localhost only works on your own computer.

Quota choices stay selected when changing the year or switching views. **Reset** restores all quotas. Existing links containing a single quota still work. For implementation details and instructions to update an existing GitHub Pages site, see [Quota multi-select changes](QUOTA_MULTISELECT_CHANGES.md).

The table uses continuous scrolling instead of page numbers. See [Continuous scrolling changes](CONTINUOUS_SCROLL_CHANGES.md) for the behavior and GitHub update instructions.

## Share with GitHub Pages

**GitHub Pages is a good fit:** the site consists of static files, needs no backend, and makes filtering work in the visitor's browser. A public GitHub repository can host it without a paid server. GitHub stores the project; **GitHub Pages** serves the actual dashboard.

1. Create a GitHub repository, for example `neet-cutoff-explorer`. Choose Public if using free public-repository Pages hosting.
2. Upload these files and directories at the repository root, keeping the `data` directory intact:
   - `index.html`, `styles.css`, `core.js`, `app.js`, `favicon.svg`, `.nojekyll`
   - `data/cutoffs.js`, `data/quality-report.json`
3. Open **Settings → Pages → Build and deployment**.
4. Choose **Deploy from a branch**, select **main** and **/ (root)**, then Save.
5. GitHub will display the published URL, typically `https://YOUR-USERNAME.github.io/neet-cutoff-explorer/`.
6. Open that URL, choose your filters, and use **Copy view link** to share a particular view.

The supplied `neet-cutoff-explorer-site.zip` contains the site files. **Extract it before uploading**; uploading only the ZIP will not publish the dashboard. The full project folder also includes the rebuild script and tests, which you can keep in the repository for maintenance.

The published site and its aggregate data will be publicly accessible. It bundles aggregate rank ranges and allotment counts, not the original Excel workbooks. The site has no login, analytics, external CDN dependencies or API keys. It has **not been published** by the build process.

## Cutoff calculation

For each **year × round × institute × course × allotted quota × allotted category**:

- Closing rank = maximum value of the workbook's `Rank` column.
- Opening rank = minimum value of that column.
- Allotment count = number of valid allotment rows in that group.

The Round 2 and Round 3 sheets contain earlier-round history. The build reads only the **current-round** fields from each sheet, including the source's `Couse` and `Alloted Category` spelling variants. It excludes rows with no current allotment, including “No Upgradation”. It does not carry a retained earlier seat forward into later rounds. A later-round cutoff is neither cumulative nor a final admitted-student cutoff.

The filters use the **allotted seat category**, not `Candidate Category`: a reserved-category candidate allotted an Open seat contributes to the Open-seat cutoff. Open and PwD categories remain distinct. Different quotas remain separate table rows even when “All quotas” is selected.

Whitespace and punctuation artifacts are normalized. MD/MS, DNB and diploma courses remain separate. Quota codes such as AI, AD and PS are expanded. Management/paid/self-financed merit quota labels are standardized under “Management / paid seats”.

Institution address spellings are matched using normalized full text. Address changes are combined only when the normalized institution name, state and six-digit PIN code match. Different campuses remain separate when these keys differ. The quality report lists these address merges and same-name records that remain separate; some differently named records can still refer to the same institution. Search by city/address and inspect the displayed address when choosing a campus.

States come from the institute/address text using state names, aliases and explicit abbreviations. A missing state is recovered only where the same normalized institution name has exactly one other source address with a known state. **15 institution records have no identifiable state** and are available under **Unknown (not stated)**. No city-to-state guesses are made. This dashboard covers these workbooks, not all state counselling systems.

Current data includes **126,322 allotment events**, **1,896 institution records**, and **100 courses**. An institution record is not a verified unique college identity. Counts across rounds are allotment events and must not be added together to estimate unique candidates or seats. A dash means no matching allotment in the source round.

| Year | Round 1 | Round 2 | Round 3 | Stray |
| --- | ---: | ---: | ---: | ---: |
| 2024 | 24,671 | 16,182 | 13,991 | 2,331 |
| 2025 | 26,889 | 20,787 | 18,673 | 2,798 |

See `data/quality-report.json` for source counts, skipped/rejected rows, state coverage and address matches. The supplied build has no rejected allotment rows.

## Refresh from Excel

Python is required only when rebuilding the data:

```powershell
python -m pip install -r requirements.txt
python scripts/build_data.py --source-dir 'C:\Users\pzillella\Downloads\Prompt Tuning_Dimitri Notebooks\Dimitri Notebooks\PersonalExperiments'
```

The script reads the workbooks without modifying them and regenerates `data/cutoffs.js` and `data/quality-report.json`. Upload or commit those updated files to refresh the hosted site. The browser does not upload or parse Excel files.

## Validation

```powershell
python -m unittest discover -s tests -p 'test_*.py' -v
node --test --test-isolation=none tests/core.test.cjs
node scripts/browser_check.cjs
```

The browser check uses installed Microsoft Edge in a hidden session and a temporary local HTTP server. Set `EDGE_PATH` to override the browser executable location. Screenshots and browser test profiles go under the ignored `.preview` directory. Checks cover the three views, filters, restored view URLs, result search, empty states, mobile overflow, and opening the site directly from disk.

The initial build was additionally cross-checked directly against the source Excel ranks for selected courses at Osmania, Madras, Vardhman Mahavir and Armed Forces Medical College across the two years and four rounds.

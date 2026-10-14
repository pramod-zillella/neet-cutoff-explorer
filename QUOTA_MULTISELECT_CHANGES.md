# Allotment quota multi-select update

The **Allotment quota** filter now accepts any combination of quotas in College overview, Compare colleges and Explore a state.

## How to use it

1. Open **Allotment quota**. All quotas are selected initially.
2. Click **Clear selection** to start choosing a specific combination.
3. Tick each quota you want, for example **All India** and **Delhi University Quota**. Results update immediately; the dropdown stays open while you select.
4. Close the dropdown by clicking its heading, clicking outside it, or pressing Escape.
5. Choose **Select all** to include every quota again. **Reset** also restores all quotas.

The collapsed dropdown shows the selected quota's name for one selection, a count for several, or “All quotas”. The badges above the results show each selected quota. With no quotas selected, the table shows an instruction to choose a quota and CSV export is disabled.

Selections apply to all three views, remain selected when the year changes, and are included in shared view links and CSV exports. Quotas with no matching allotments for the chosen college, course, category and year produce no rows. Each quota's opening rank, closing rank and count remain separate.

## Files changed

| File | Change | Needed on the hosted site? |
| --- | --- | --- |
| `index.html` | Replaced the single-choice `<select>` with an expandable checkbox list, Select all / Clear selection buttons, and helper text. Added version parameters to CSS and application script URLs to refresh cached assets. | **Yes** |
| `styles.css` | Added dropdown, checkbox, selection and action-button styles. The list scrolls within the filter and uses the existing responsive layout. | **Yes** |
| `app.js` | Stores multiple quota selections, handles the checkboxes and bulk actions, updates result badges and empty-state messaging, and preserves selection through view/year changes and shared links. | **Yes** |
| `core.js` | Filters records by membership in the selected quota set, keeping each quota's rank calculations in separate rows. | **Yes** |
| `README.md` | Updated usage instructions and linked this change guide. | Documentation only |
| `QUOTA_MULTISELECT_CHANGES.md` | Added this implementation and deployment guide. | Documentation only |
| `tests/core.test.cjs` | Added multi-quota tests for both years and all views, separate rank rows, exports, empty selections, duplicates and invalid quota values. | No; keep it in the source repository if desired |
| `scripts/browser_check.cjs` | Added interaction checks for multi-select, bulk actions, URL compatibility, reset, year/view persistence, keyboard closing and mobile layout. | No; keep it in the source repository if desired |
| `neet-cutoff-explorer-site.zip` | Rebuilt the ready-to-upload site package with the updated files and documentation. | Extract it; upload its files, not the ZIP itself |

The existing `data/cutoffs.js`, `data/quality-report.json`, workbooks and Python data builder require **no changes or rebuild** for this feature. The source data already stores quota separately.

## Implementation details

**Selection state:** the application now uses `filters.quotas`, an array of quota names, instead of `filters.quota`, a single string. Defaults contain every available quota. An empty array deliberately matches no allotments.

```javascript
quotas: ["All India", "Delhi University Quota"]
```

**Filtering:** `core.js` constructs a `Set` from the selected quotas and includes a record only when its quota belongs to that set. The existing grouping key still includes quota and allotted category, so selecting several quotas does not combine their closing ranks or counts.

**Shared URLs:** multiple selections use repeated `quota` parameters, which are read with `URLSearchParams.getAll("quota")`:

```text
#...&quota=All+India&quota=Delhi+University+Quota
```

An all-quota selection is written as `quota=all`; an empty selection is written as `quota=none`. Existing links with `quota=All+India`, `quota=all`, or no quota parameter continue to work. Duplicate values are deduplicated, and unknown quota values are ignored; a link containing only unknown values gives an empty selection. Link values are encoded through `URLSearchParams`.

**Interaction and accessibility:** native checkboxes support keyboard selection. The dropdown uses native `<details>` / `<summary>` controls, keeps focus on the selected checkbox during updates, and closes on Escape with focus returned to the summary. Clearing the selection never silently restores all quotas.

**Assets:** `index.html` references `styles.css`, `core.js` and `app.js` with the suffix `?v=quota-multiselect-1`. Keep the actual filenames unchanged when uploading. The version suffix helps visitors retrieve the updated assets after deployment.

## Update your existing GitHub Pages site

All code changes are already made locally. You only need to replace the files hosted on GitHub.

1. Open the current folder:

   ```text
   C:\Users\pzillella\Projects\neet-cutoff-explorer
   ```

   Alternatively, extract the newly rebuilt `neet-cutoff-explorer-site.zip` to a **new folder**. A folder extracted before this update will still contain the previous files unless you overwrite them.

2. In your existing GitHub repository, open **Code → Add file → Upload files**.
3. Drag **all four** updated files into the upload area together:

   ```text
   index.html
   styles.css
   core.js
   app.js
   ```

4. Keep them at the repository root, replacing the existing files. Do not add an outer `neet-cutoff-explorer-site` folder. Optionally also upload the updated `README.md` and `QUOTA_MULTISELECT_CHANGES.md`.
5. Enter a commit message such as **Add multi-select allotment quota filter** and click **Commit changes** on the branch configured for Pages, normally `main`.
6. Wait for the Pages deployment to finish. Check **Actions** or **Settings → Pages** for deployment status. You do not need to reconfigure Pages or recreate the repository.
7. Open the same website URL. Refresh with **Ctrl+Shift+R** if the previous dropdown still appears.

The existing `data` directory, `.nojekyll` and `favicon.svg` can stay as they are. Upload the four application files in one commit so the updated page and scripts deploy together.

## Verify the hosted update

1. Open the quota dropdown, clear its selection, then choose two quotas. Confirm the summary says **2 quotas selected** and both names appear above the table.
2. Use **Maulana Azad Medical College**, **MD · General Medicine**, and **Open** category with **All India** and **Delhi University Quota** to see quota rows separately.
3. Change the year and switch views; the quota choices should remain selected.
4. Copy the view link and open it in another tab; the same quotas should be checked.
5. Export CSV and confirm it contains only matching rows from those quotas.
6. Clear every quota; confirm the empty-state instruction appears. Then choose **Select all** or **Reset** to restore results.

Automated checks can be run from the full project folder:

```powershell
node --test --test-isolation=none tests/core.test.cjs
node scripts/browser_check.cjs
```

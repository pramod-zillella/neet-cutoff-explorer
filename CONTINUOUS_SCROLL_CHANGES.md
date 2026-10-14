# Continuous scrolling for cutoff results

The result table now supports **continuous scrolling** in all three views. It is a good fit for scanning and comparing colleges or courses because the rows you have already seen remain in the same list as you continue downward.

## Behavior

- Scroll inside the table using the mouse wheel, trackpad, touch, or keyboard. New rows appear automatically near the bottom. There are no previous/next page buttons or page numbers.
- Round headings stay visible while scrolling. The table's column widths stay stable as more rows appear.
- The footer shows the number of rows loaded and the total matching rows. It displays **All results loaded** when the full list is present.
- **Back to top** appears after scrolling down and returns to the beginning of the table without discarding the loaded rows.
- Changing a filter, year, view, search term or sort order resets the table to the top with the updated results.
- Search and sorting operate on the entire matching dataset. CSV export includes every matching result, including rows you have not scrolled to yet.
- Shared links preserve the selected filters and sorting. They open at the beginning of the results, without saving scroll position.

## Approach

The table initially renders up to **100 rows**, then appends another 100 when scrolling within 400 pixels of the bottom. The aggregate data is already loaded locally, so this requires no additional network requests.

Appending rows keeps previously displayed rows in the document and preserves the scroll position. This avoids rendering thousands of rows before the first results can appear. This is incremental rendering, not virtualization: a very long browsing session will eventually retain all the rows you have reached. For broad all-state/all-branch searches, the existing filters and search help narrow the list.

The scroll area retains native keyboard scrolling and visible table headings. The table exposes the total row count and each appended row's position to assistive technology. A pending scroll update is cancelled when the result filters or sorting change.

## Changes made

| File | Change |
| --- | --- |
| `app.js` | Removed page state and page navigation. Added incremental row appending, a passive scroll handler, loaded-row counts, filter/sort scroll resets, and Back to top. CSV export continues to use all matching rows. |
| `index.html` | Replaced page buttons with scrolling status and Back to top. Updated CSS and app script version parameters so the new assets can load after deployment. |
| `styles.css` | Removed pagination styling. Added footer controls and stable table column widths, including widths for opening/closing rank ranges. |
| `scripts/browser_check.cjs` | Added full-list scrolling checks, order/rank comparison, duplicate prevention, existing-row preservation, CSV export before scrolling, sort/search resets, Back to top and mobile scrolling. |
| `README.md` | Updated usage instructions and linked this guide. |
| `neet-cutoff-explorer-site.zip` | Rebuilt the complete site package, including the quota multi-select feature and this update. |

There are no changes to the workbooks, generated data or cutoff calculations. `core.js` is unchanged from the quota multi-select release.

## Update GitHub Pages

1. Extract the latest `neet-cutoff-explorer-site.zip` into a new folder, or use the current files in `C:\Users\pzillella\Projects\neet-cutoff-explorer`.
2. Open your existing GitHub repository and choose **Add file → Upload files**.
3. Upload `index.html`, `app.js`, `styles.css` and `core.js` together, replacing the files at the repository root. Including `core.js` ensures the previous quota multi-select update is present too.
4. Optionally upload the latest `README.md` and both change guides.
5. Commit to your Pages branch, usually `main`, and wait for the deployment to complete.
6. Open the same website address and refresh with **Ctrl+Shift+R** if you still see page buttons.

The `data` directory stays as it is. No Pages settings or repository recreation is needed.

## Verify the update

Use **Explore a state**, **All states / union territories**, and **MD · General Medicine** to produce a longer list. Scroll near the bottom of the table: the result count should increase while earlier rows stay present. Continue until **All results loaded** appears.

Then change a filter or click a round heading to sort: the table should start from the top. Export before scrolling through all results and confirm the CSV includes the complete filtered result set.

# Coursewise UBC — grade distributions and schedule-wide course insights

An independent, unofficial UBC course explorer. Search **all 21,280 normalized campus/course-code entries in the supplied PAIR archive**, inspect published grade distributions and section statistics, and paste a saved/registered Workday schedule or upload its `.xlsx` export to see your courses together. Inspired by the MIT-licensed [UBCGrades](https://ubcgrades.com); source data originally compiled in [ubc-pair-grade-data](https://github.com/DonneyF/ubc-pair-grade-data). **The MIT license here covers only Coursewise code, not the upstream archive.**

## Interface (v0.9.0)

Coursewise now has **separate, directly navigable pages** (one view at a time):

| URL | Primary use |
|---|---|
| `/` | **Search one course** — the homepage and main workflow |
| `/course?campus=UBCV&subject=CPEN&course=221A` | Full individual course report: visible SVG grade histogram, course-average trend, **instructor comparisons**, section selection and expandable statistics |
| `/my-classes` | Local-only Workday Excel (.xlsx) or text import, compact course summaries and **Grade Goal Planner** |
| `/explore` | Catalog browser: **3 × 3 / nine results per page** with course-level and type-ahead subject filters |
| `/gpa` | UBC grading bands and published 4.33 equivalency table |
| `/data` | Source provenance, incomplete-data notes and archive coverage |

Course pages link every 4.33 equivalency label to the [official UBC Arts table](https://www.arts.ubc.ca/degree-planning/academic-performance/promotion-continuation-grading/). Different evaluating institutions may use different mappings; no personal GPA is calculated from historical course means.

## Improvements in v0.8.0

- **Instructor histograms are visible again:** instructor side-by-side comparisons now render 11 grade ranges with explicit SVG rectangle heights (and a common percentage Y-axis), not CSS-relative percentage heights that can collapse. Counts suppressed in the source are not estimated. Results are descriptive teaching-team attributions, not independent instructor-effect estimates.
- **Clearer comparison label:** the instructor table now says **Difference vs course in same terms** and explains what the difference in percentage *points* means. It compares instructor-attributed section averages to averages across all recorded sections in the academic terms that educator taught. Co-taught sections, old records, and unequal student samples still limit interpretation.
- **Historical-average hover details:** custom, focusable SVG tooltip shows the academic session and its published mean instead of a black browser-native tooltip. The chart shows the latest 24 recorded terms where more history exists.
- **Navigation stays available:** the page header remains sticky when scrolling through reports. Mobile navigation is horizontally scrollable so its links remain reachable, including Browse, GPA Guide and Data & Sources.
- **My Classes shortcut:** once you add courses, a **Jump to Grade Goals** link appears near the My Classes title and scrolls to the planner.
- **More informative homepage:** the headline and subtitle now mention course data, instructors, Workday importing, and grade-goal planning.
- **Credit steps are still 0.5:** UBC actually publishes courses worth **1.5 credits**, e.g. [BAIT_V 518](https://vancouver.calendar.ubc.ca/course-descriptions/courses/baitv-518-data-visualization). The planner continues to default to 3 credits per course; always edit to match Workday.

The updated SVG geometry, chart tooltips, view markup, and sticky navigation have regression tests. The browser environment used here blocked local page navigation, so live visual verification on a local Windows browser remains advisable.

## Hotfix in v0.7.1

- **Full reports restored:** fixed an undefined section-selector / coverage-note variable set that crashed course report rendering after historical records loaded.
- **My Classes restored after navigation:** initial rendering is now deferred until the Grade Planner helpers have initialized, so saved courses and their fetched stats load correctly when returning from a report or refreshing the page.
- **Regression coverage:** automated UI-module tests now exercise a populated full course report and restoring historical data for a saved lineup on a subsequent page load. The Excel parser is unchanged.

## Changes introduced in v0.7

- **Fixed grade-distribution rendering:** replaced CSS-relative-height columns with an accessible SVG histogram where each published count maps to an explicit positive-height bar. Missing and privacy-suppressed grade bins remain unavailable, not zero. Academic session / section filters continue to work.
- **Reorganized course report:** primary course-average summary is adjacent to a labeled historical average trend. The grade distribution is next, followed by instructor comparisons. Historical high/low course means, quartiles, high/low student marks and section evidence are collapsed into lower-priority details.
- **More useful My Classes lineup:** each saved course now displays recent five-year mean, latest published term mean, all-time mean, a mini historical trend and data coverage without opening Full report.
- **Workday Excel imports:** choose a local `.xlsx` file in My Classes. Coursewise reads shared strings, inline strings, multiple worksheets and separate section columns, then previews **only extracted course codes and section numbers** in the text box; click **Find my courses** to add them. The workbook is never uploaded. Supports files under 8 MB in recent Chrome, Edge and Firefox using browser-native ZIP decompression. This is an initial format-compatible implementation; a real user-provided Workday Excel export is still needed to validate every Workday layout. Password-protected spreadsheets, legacy `.xls`, PDF and direct Workday account access are not supported.

## Improvements in v0.9

- Instructor charts now use narrow bars and a **482-unit SVG viewport** with clearly labelled grade bands. All 11 bins fit into a comparison card without horizontal scrolling. At smaller widths, cards wrap to new rows rather than shrinking labels or clipping axes. Hover or focus individual bars for exact percentages and counts.
- The instructor table uses **vs same-term sections** with +/- percentage-point differences rendered as `%` for easy scanning. These are **percentage-point differences**, not relative percent changes, and remain descriptive, not causal.
- Section median has a permanent card, even when unavailable (`—`); highest/lowest individual marks, 25th/75th percentiles, standard deviation and pass rate are visible (not tucked in a collapsed details element). Historical course mean highs and lows are visible in a compact secondary strip.
- **Availability:** the newest Tableau v2 rows publish median and quartiles but no standard deviation. Earlier Tableau/PAIR rows publish standard deviation; legacy PAIR rows contain pass/fail status counts. Some selected terms and multi-section views have no comparable statistics.
- **Provenance:** original grade information was published by UBC; the downloaded local index derives from the [community-maintained UBC PAIR archive](https://github.com/DonneyF/ubc-pair-grade-data), rather than directly querying UBC systems. The [official UBC Grade Distribution Report](https://cio.ubc.ca/grade-distribution-report) may require UBC-specific access. If no matching local record exists, an [UBCGrades API](https://ubcgrades.com/api-reference) fallback is attempted. Source and licensing limits still apply.

## Features (v0.9.0)

- **Single-course search first** and a compact course catalog. Filter by campus, course-level (100 through 500; 600+), and subject code by typing its initial letters; search by course code/title and sort by historical mean or recent record. Browse nine courses per page. Select one for a standalone report.
- **Course high/low statistics:** highest/lowest *historical course session mean*, alongside highest/lowest recorded individual marks when provided. These are different metrics and clearly labeled.
- **Prominent grade distribution charts:** 11 UBC letter-grade percentage bands, from `<50` through `90–100`. Charts and exact-count tables show published per-section counts for a chosen academic session and section, or the combined available records for one session. **Blank/suppressed values are never treated as zero**; aggregated partial counts display as lower bounds.
- **Class size and section statistics:** Enrolled (older source) vs Reported (newer source) student counts; course or section mean, high/low, median, 25th/75th percentiles, standard deviation, and older PAIR pass/fail/withdraw/audit counts when available. Missing fields are shown as unavailable; pass rate uses pass ÷ (pass + fail) only where both are published.
- **Published UBC 4.33 equivalency:** complete lookup for whole percentages 50–90 (90–100 → 4.33), plus official letter-grade ranges. A fractional course mean is **rounded to the nearest integer** and marked ≈. **This is an equivalency of the course's mean percentage, not a true class GPA or a forecast of your own GPA.** UBC uses percentage grades; other credential evaluators use their own 4.33/4.0 mappings. The UBC reference table does not specify below-50 GPA points, so Coursewise does not assign them.
- **Instructor comparisons (new in v0.6):** Open any individual course and select **Compare instructors**. Compare up to three named educators using student-weighted section means (unweighted when section counts are missing), numbers of graded/recorded sections, highs/lows of their section means, the difference versus the course sections from the same terms, and full 11-band grade distributions normalized by published grade outcomes. Search names, sort, filter to recent five academic years, all retained records, or one academic session. Inspect section-level evidence and co-teaching caveats. Educator names are historical teaching-team *attributions*, not verified sole instructors: co-taught sections are associated with multiple names and older files may include teaching assistants. Small samples, missing bands, and the 120-section history cap limit valid comparisons. **No inference of instructor quality or grading causation.**
- **Semester importer:** Extract codes/sections from Workday `.xlsx` exports, copied schedules, `.txt`, `.csv`, `.ics`, and `.html` files *in your browser*. No Workday credentials or raw imported text are sent to the server. Save a local course list, browse historical trends, sort, compare courses and inspect individual sections. Related suffix course codes (e.g. `221`, `221A`) remain separate.
- **Grade Goal Planner (new in v0.5):** After importing courses in **My Classes**, enter a target percentage. The tool computes the *credit-weighted average of published historical course means* and finds a common approximate within-course percentile across all unlocked courses whose complete grade bands are available. Edit credit weights (default **3 assumed credits**, not derived from Workday); slide or type a planned grade to fix one course and automatically rebalance the others. You may mark a course completed **only after entering an actual final grade**. The calculator reports the exact average needed in remaining unlocked credits, live achieved/target differences, percentile benchmarks, and clear impossibility/data-coverage states. All planner inputs are saved only in browser localStorage. Use **Reset planned grades** to release non-completed pinned grades.
- **Transparency:** Data provenance, partial coverage warnings, and a campus/session coverage explorer. The raw data archive contains 13,162 CSV files and 489,852 rows; its latest represented session is **2025W**. Archives need not cover every offered section.

## Local setup

**Requirements:** Node.js 20+, Python 3.10+ for building the index. No packages, API key, Workday login, or cloud account required.

```bash
git clone https://github.com/Otamot77/coursewise-ubc.git
cd coursewise-ubc
python3 scripts/import_pair_data.py /path/to/ubc-pair-grade-data-master.zip
npm start
```

Open <http://localhost:4173> and enter `CPEN 221A`, `CPSC 110`, or `MATH 100` on the homepage. The individual course report includes a visible histogram with academic-session and section controls. The index is generated into ignored `data/` files:

- `data/course-index.json.gz` — local history, section grade bins, counts, educators, and provenance
- `data/coverage.json` — raw-vintage coverage by year, session, and campus
- `data/metadata.json` — import metadata

The repo **intentionally does not include any raw/derived grade dataset** pending explicit verification of its redistribution rights. Without a local index, individual course lookups fall back to the public UBCGrades API, but the full catalog, section distributions and local coverage explorer require an imported archive. Importing the dataset is not authorization to republish it. Do not commit student schedules.

### Running the complete data-included ZIP on Windows

If you downloaded **`coursewise-ubc-v0.9-with-data.zip`**, extract it. In PowerShell, **change into the inner `coursewise-ubc` folder** containing `package.json`:

```powershell
cd "$HOME\Downloads\coursewise-ubc-v0.9-with-data\coursewise-ubc"
npm start
```

The ZIP already contains `data/course-index.json.gz`, `data/coverage.json` and `data/metadata.json`; **do not rerun the importer** for this download. If you have an older ZIP, stop its server with Ctrl+C first and start the v0.9 build. GitHub's source-only version still requires an import.

## Tests

```bash
npm test
npm run test:data
```

Includes tests for Workday parsing, course/API validation, catalog filtering, weighted grade goals, incomplete-bin suppression, percentile interpolation, fixed grades, instructor section weighting and source attribution, co-teaching, suppressed bins, same-term comparisons, 4.33 equivalency, percentage grade boundaries, withheld/zero grade-bin handling, record-vintage deduplication, and section summaries. GitHub Actions tests the source-only path as well.

## How the Grade Goal Planner should be interpreted

For each unlocked course with all published grade bands available, the tool estimates a percentile-to-grade curve by spreading students uniformly within each published UBC band (a coarse approximation for the 0–49 and 90–100 bins). It then solves for the common percentile `p` such that:

`sum(credits_i × estimated_grade_at_percentile_i(p)) / sum(credits_i) = target`.

Pinned course grades are treated as fixed contributions in the same weighted equation. The *required average of remaining unlocked credits* is exact arithmetic given the entered marks, but grade/percentile suggestions are illustrative. **No historical joint student records connect different courses**, so a "60th-percentile" result means the modeled standing *within each unlocked course*, not a person's actual percentile among students' total semester grades or a 60% success probability. When all recent section distributions are suppressed or incomplete, the planner searches older complete sessions; if none qualify it withholds the automatic percentile, rather than reconstruct missing grade bands. It also avoids truncated section terms. Historical course means may come from different years. Course credit counts are not known to the underlying grade archive, so **edit them manually** to match your actual registration before relying on the calculations. Actual course conditions and performance vary.

## Data methodology and limitations

1. **Only published observations**: blank/suppressed bins are `null` (not zero). When aggregating sections, a band whose count is missing in any section is marked as a **lower bound**; where none are published, it is unavailable. No reverse-engineering of suppressed values.
2. **No double counting**: per campus/course/session, prefer Tableau v2, then Tableau v1, then legacy PAIR; `OVERALL` records are not added to individual section rows. Repeated section keys within one vintage are deduplicated.
3. **Historical sizes vary in meaning**: legacy PAIR and Tableau v1 use `Enrolled` (may include withdrawals); Tableau v2 uses `Reported`. The UI labels the definition. Combined reported totals can include only retained source sections. The index retains the newest **120** section rows per course; very large/old courses can be truncated, and this is flagged.
4. **Partial course averages**: section averages are weighted by the published student counts when available, otherwise an unweighted section mean. Session averages are averaged equally across sessions for historical all-time and recent summaries; they are not grade forecasts. Missing sessions do not necessarily mean a course wasn't offered.
5. **Median, quartiles, standard deviation, highest/lowest mark**: these are drawn from published section records, never reconstructed from histogram bins; median and quartiles are not calculated for combined sections. The archive sometimes omits them. Only older PAIR records include explicit pass/fail status counts.
6. **4.33 equivalency**: the exact 50–90 integer lookup from [UBC Arts](https://www.arts.ubc.ca/degree-planning/academic-performance/promotion-continuation-grading/) and [UBC Okanagan](https://students.ok.ubc.ca/academic-success/grades-performance/) is used. [UBC grading practices](https://students.ubc.ca/enrolment/courses/grades/) supply letter-grade bands. A percentage-level equivalency is not a credit-weighted student GPA.
7. **Instructor / Workday**: teacher names are historical credits, not real-time assignments. Workday supports text and initial browser-local `.xlsx` course/section extraction. PDF/screenshot import, direct sign-in, live seat availability, automatic credit totals, timetables and workload surveys have not been implemented.

## API

| Endpoint | Purpose |
|---|---|
| `/api/health` | Local dataset mode, indexed course count, latest session |
| `/api/catalog?campus=UBCV&subjectPrefix=CP&level=200&page=1` | Server-side subject-prefix and course-level filters, 9-item pagination, subject list |
| `/api/course?campus=UBCV&subject=CPEN&course=221A` | Course summary, historical sections, grade bins, class sizes, history, team, provenance |
| `/api/coverage` | Campus/session data coverage |

## Next steps

Validate the XLSX importer against an actual Workday export (the current tests use synthetic Excel files); consider instructor-name alias review and controlled same-section comparisons; improve completeness indicators when source sections are truncated; refine fallback API support for historical section bins; then decide on hosting and dataset licensing. More advanced planning features might include credit-based workload planning, schedule comparisons, and prerequisite checking using a separately maintained course catalog.

*Not affiliated with the University of British Columbia.*

# Coursewise UBC — grade distributions and schedule-wide course insights

An independent, unofficial UBC course explorer. Search **all 21,280 normalized campus/course-code entries in the supplied PAIR archive**, inspect published grade distributions and section statistics, and paste a saved/registered Workday text schedule to get the rundown for several courses at once. Inspired by the MIT-licensed [UBCGrades](https://ubcgrades.com); source data originally compiled in [ubc-pair-grade-data](https://github.com/DonneyF/ubc-pair-grade-data). **The MIT license here covers only Coursewise code, not the upstream archive.**

## Interface (v0.6)

Coursewise now has **separate, directly navigable pages** (one view at a time):

| URL | Primary use |
|---|---|
| `/` | **Search one course** — the homepage and main workflow |
| `/course?campus=UBCV&subject=CPEN&course=221A` | Full individual course report: a prominent 11-band histogram, **instructor comparisons**, section selection, counts, class sizes and historical statistics |
| `/my-classes` | Optional Workday paste/file import, saved course lineup, and **Grade Goal Planner** |
| `/explore` | Catalog browser: **3 × 3 / nine results per page** with course-level and type-ahead subject filters |
| `/gpa` | UBC grading bands and published 4.33 equivalency table |
| `/data` | Source provenance, incomplete-data notes and archive coverage |

Course pages link every 4.33 equivalency label to the [official UBC Arts table](https://www.arts.ubc.ca/degree-planning/academic-performance/promotion-continuation-grading/). Different evaluating institutions may use different mappings; no personal GPA is calculated from historical course means.

## Features (v0.6)

- **Single-course search first** and a compact course catalog. Filter by campus, course-level (100 through 500; 600+), and subject code by typing its initial letters; search by course code/title and sort by historical mean or recent record. Browse nine courses per page. Select one for a standalone report.
- **Course high/low statistics:** highest/lowest *historical course session mean*, alongside highest/lowest recorded individual marks when provided. These are different metrics and clearly labeled.
- **Prominent grade distribution charts:** 11 UBC letter-grade percentage bands, from `<50` through `90–100`. Charts and exact-count tables show published per-section counts for a chosen academic session and section, or the combined available records for one session. **Blank/suppressed values are never treated as zero**; aggregated partial counts display as lower bounds.
- **Class size and section statistics:** Enrolled (older source) vs Reported (newer source) student counts; course or section mean, high/low, median, 25th/75th percentiles, standard deviation, and older PAIR pass/fail/withdraw/audit counts when available. Missing fields are shown as unavailable; pass rate uses pass ÷ (pass + fail) only where both are published.
- **Published UBC 4.33 equivalency:** complete lookup for whole percentages 50–90 (90–100 → 4.33), plus official letter-grade ranges. A fractional course mean is **rounded to the nearest integer** and marked ≈. **This is an equivalency of the course's mean percentage, not a true class GPA or a forecast of your own GPA.** UBC uses percentage grades; other credential evaluators use their own 4.33/4.0 mappings. The UBC reference table does not specify below-50 GPA points, so Coursewise does not assign them.
- **Instructor comparisons (new in v0.6):** Open any individual course and select **Compare instructors**. Compare up to three named educators using student-weighted section means (unweighted when section counts are missing), numbers of graded/recorded sections, highs/lows of their section means, the difference versus the course sections from the same terms, and full 11-band grade distributions normalized by published grade outcomes. Search names, sort, filter to recent five academic years, all retained records, or one academic session. Inspect section-level evidence and co-teaching caveats. Educator names are historical teaching-team *attributions*, not verified sole instructors: co-taught sections are associated with multiple names and older files may include teaching assistants. Small samples, missing bands, and the 120-section history cap limit valid comparisons. **No inference of instructor quality or grading causation.**
- **Semester importer:** Extract codes/sections from copied Workday saved/registered schedules, plain text, `.txt`, `.csv`, `.ics`, and `.html` files *in your browser*. No Workday credentials or raw imported text are sent to the server. Save a local course list, browse historical trends, sort, compare courses and inspect individual sections. Related suffix course codes (e.g. `221`, `221A`) remain separate.
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

If you downloaded **`coursewise-ubc-v0.6-with-data.zip`**, extract it. In PowerShell, **change into the inner `coursewise-ubc` folder** containing `package.json`:

```powershell
cd "$HOME\Downloads\coursewise-ubc-v0.6-with-data\coursewise-ubc"
npm start
```

The ZIP already contains `data/course-index.json.gz`, `data/coverage.json` and `data/metadata.json`; **do not rerun the importer** for this download. If you have an older ZIP, stop its server with Ctrl+C first and start the v0.6 build. GitHub's source-only version still requires an import.

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
7. **Instructor / Workday**: teacher names are historical credits, not real-time assignments. Workday support is text based; screenshots, direct sign-in, live seat availability, credit totals, timetables and workload surveys have not been implemented.

## API

| Endpoint | Purpose |
|---|---|
| `/api/health` | Local dataset mode, indexed course count, latest session |
| `/api/catalog?campus=UBCV&subjectPrefix=CP&level=200&page=1` | Server-side subject-prefix and course-level filters, 9-item pagination, subject list |
| `/api/course?campus=UBCV&subject=CPEN&course=221A` | Course summary, historical sections, grade bins, class sizes, history, team, provenance |
| `/api/coverage` | Campus/session data coverage |

## Next steps

Test with actual Workday saved-schedule text; consider instructor-name alias review and controlled same-section comparisons; improve completeness indicators when source sections are truncated; refine fallback API support for historical section bins; then decide on hosting and dataset licensing. More advanced planning features might include credit-based workload planning, schedule comparisons, and prerequisite checking using a separately maintained course catalog.

*Not affiliated with the University of British Columbia.*

# Coursewise UBC — grade distributions and schedule-wide course insights

An independent, unofficial UBC course explorer. Search **all 21,280 normalized campus/course-code entries in the supplied PAIR archive**, inspect published grade distributions and section statistics, and paste a saved/registered Workday text schedule to get the rundown for several courses at once. Inspired by the MIT-licensed [UBCGrades](https://ubcgrades.com); source data originally compiled in [ubc-pair-grade-data](https://github.com/DonneyF/ubc-pair-grade-data). **The MIT license here covers only Coursewise code, not the upstream archive.**

## Interface (v0.4)

Coursewise now has **separate, directly navigable pages** (one view at a time):

| URL | Primary use |
|---|---|
| `/` | **Search one course** — the homepage and main workflow |
| `/course?campus=UBCV&subject=CPEN&course=221A` | Full individual course report: a prominent 11-band histogram, section selection, counts, class sizes and historical statistics |
| `/my-classes` | Optional Workday paste/file import and locally saved course lineup |
| `/explore` | Catalog browser: **3 × 3 / nine results per page** with course-level and type-ahead subject filters |
| `/gpa` | UBC grading bands and published 4.33 equivalency table |
| `/data` | Source provenance, incomplete-data notes and archive coverage |

Course pages link every 4.33 equivalency label to the [official UBC Arts table](https://www.arts.ubc.ca/degree-planning/academic-performance/promotion-continuation-grading/). Different evaluating institutions may use different mappings; no personal GPA is calculated from historical course means.

## Features (v0.4)

- **Single-course search first** and a compact course catalog. Filter by campus, course-level (100 through 500; 600+), and subject code by typing its initial letters; search by course code/title and sort by historical mean or recent record. Browse nine courses per page. Select one for a standalone report.
- **Course high/low statistics:** highest/lowest *historical course session mean*, alongside highest/lowest recorded individual marks when provided. These are different metrics and clearly labeled.
- **Prominent grade distribution charts:** 11 UBC letter-grade percentage bands, from `<50` through `90–100`. Charts and exact-count tables show published per-section counts for a chosen academic session and section, or the combined available records for one session. **Blank/suppressed values are never treated as zero**; aggregated partial counts display as lower bounds.
- **Class size and section statistics:** Enrolled (older source) vs Reported (newer source) student counts; course or section mean, high/low, median, 25th/75th percentiles, standard deviation, and older PAIR pass/fail/withdraw/audit counts when available. Missing fields are shown as unavailable; pass rate uses pass ÷ (pass + fail) only where both are published.
- **Published UBC 4.33 equivalency:** complete lookup for whole percentages 50–90 (90–100 → 4.33), plus official letter-grade ranges. A fractional course mean is **rounded to the nearest integer** and marked ≈. **This is an equivalency of the course's mean percentage, not a true class GPA or a forecast of your own GPA.** UBC uses percentage grades; other credential evaluators use their own 4.33/4.0 mappings. The UBC reference table does not specify below-50 GPA points, so Coursewise does not assign them.
- **Semester importer:** Extract codes/sections from copied Workday saved/registered schedules, plain text, `.txt`, `.csv`, `.ics`, and `.html` files *in your browser*. No Workday credentials or raw imported text are sent to the server. Save a local course list, browse historical trends, sort, compare courses and inspect individual sections. Related suffix course codes (e.g. `221`, `221A`) remain separate.
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

If you downloaded **`coursewise-ubc-v0.4-with-data.zip`**, extract it. In PowerShell, **change into the inner `coursewise-ubc` folder** containing `package.json`:

```powershell
cd "$HOME\Downloads\coursewise-ubc-v0.4-with-data\coursewise-ubc"
npm start
```

The ZIP already contains `data/course-index.json.gz`, `data/coverage.json` and `data/metadata.json`; **do not rerun the importer** for this download. If you have an older ZIP, stop its server with Ctrl+C first and start the v0.4 build. GitHub's source-only version still requires an import.

## Tests

```bash
npm test
npm run test:data
```

Includes tests for Workday parsing, course/API validation, catalog filtering, 4.33 equivalency, percentage grade boundaries, withheld/zero grade-bin handling, record-vintage deduplication, and section summaries. GitHub Actions tests the source-only path as well.

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

Test with actual Workday saved-schedule text; add more instructor-linked comparisons and compact visualizations; improve completeness indicators when source sections are truncated; refine fallback API support for historical section bins; then decide on hosting and dataset licensing. More advanced planning features might include credit-based workload planning, schedule comparisons, and prerequisite checking using a separately maintained course catalog.

*Not affiliated with the University of British Columbia.*

# Coursewise UBC

**Coursewise** is an independent, unofficial UBC course-planning website that uses historical UBC grade data to give students a whole-schedule overview. It is a fresh implementation inspired by [UBCGrades](https://ubcgrades.com) and uses [UBC PAIR grade data compiled by DonneyF](https://github.com/DonneyF/ubc-pair-grade-data). The original UBCGrades source is MIT-licensed. This application's code is MIT-licensed separately; the license **does not cover the upstream grade dataset**.

## What works now

- **Schedule import (in-browser):** Paste copied Workday saved/registered schedule text, comma/newline-separated course codes, or import text-based `.txt`, `.csv`, `.ics` and `.html` files. Supports `CPEN_V 221 - 101`, `MATH 100`, `COSC_O 111`, and course-suffix codes. No Workday login or credential collection. Only parsed course codes and section numbers are saved in browser local storage.
- **Historical grade summaries:** Per-course averages, a five-calendar-year mean ending in the latest *recorded* year, and grade-history chart.
- **Section evidence:** See up to 15 of the last 80 retained published section-average records, with year/session, section, and educator attribution when available. Exact current section/instructor assignments are **not** known. Matching section numbers are only historical matches.
- **Course-code variants:** Identify related codes such as `CPEN 221` versus `CPEN 221A` / `221B`. These are **not silently merged**, because different suffixes may represent distinct registrations.
- **Semester overview:** Sort courses and compare up to four, with explicit reminders that historical averages are not individual grade predictions.
- **Local-first data API:** Read the imported PAIR CSV index without making live UBCGrades requests; fall back to the public UBCGrades API for unindexed course codes only.
- **Coverage explorer:** Browse which campus/year sessions have published average records, using the newest available source vintage in each listed session. Source and privacy limitations are called out.

## Run locally

**Requirements:** Node.js 20+, Python 3.10+ to regenerate the index. No npm dependencies, account, or API key required.

```bash
npm start
# Open http://127.0.0.1:4173
```

The **integrated ZIP** already includes an index generated from the provided raw archive. The source-only ZIP does not include it and therefore falls back to the public API until the next step is run.

### Rebuild the grade index

Keep the directory structure of `ubc-pair-grade-data-master.zip` intact and run from the project folder:

```bash
python3 scripts/import_pair_data.py /path/to/ubc-pair-grade-data-master.zip
npm start
```

Outputs: `data/course-index.json.gz`, `data/coverage.json`, `data/metadata.json`. Data files are excluded by `.gitignore` to avoid accidentally committing unlicensed upstream data.

### Tests

```bash
npm test
npm run test:data
```

13 JavaScript tests and 4 Python tests passed on the integrated version. API tests work both with and without the optional local index.

## What the full raw-data import found

The supplied archive contained 13,162 CSV files and 489,852 raw rows. It normalized 489,848 valid rows (4 unrecognized), of which 447,302 published an average. There were 42,546 records with unavailable averages, all in the older PAIR source. The generated index contains 21,280 distinct campus/subject/course-code keys, with at least one published average for 20,424 of those keys; 856 keys are preserved as recorded but without any published average. The latest represented session is **2025W**. Vancouver is covered from 1996S onward and Okanagan from 2014S onward, but coverage does not guarantee every section/course has data.

See [DATA_AUDIT.md](DATA_AUDIT.md) for the detailed audit and interpretation.

## Data integrity and limitations

1. **Versions overlap.** Prefer `tableau-dashboard-v2` > `tableau-dashboard` > `pair-reports` for a given campus/course/year-session. These sources are not added together.
2. **Published sections only.** Avoid counting `OVERALL` together with individual sections. If a source has only an `OVERALL` record, use it as a fallback; do not double-count.
3. **No invented grades.** Missing averages and grade-distribution bins are not reconstructed. Some records are suppressed for privacy, while others may simply be incomplete.
4. **Section aggregation is approximate.** When sections have means, take a weighted mean using `Reported`/`Enrolled` if all counts are available; otherwise use an explicitly unweighted mean of available section averages. Historical PAIR `Enrolled` can include withdrawals and differs from newer `Reported`; these are not perfect weights. Partial coverage is flagged. Across terms, the site's course statistic is an unweighted average of published term means, not an expected GPA.
5. **Instructors are historical.** Names from the archive are not independently verified as current or as the only educators involved. Older PAIR instructor correction entries are used where supplied.
6. **No guarantee of completeness.** Source reporting may lag, and the fact that a course has no record is not proof it was not offered. Newest indexed session is 2025W—not necessarily all courses from that session.
7. **Workday import is text-based.** No screenshot, PDF, direct Workday authentication, calendar conflict checker, live seats, workload review system or timetable import yet. Real Workday paste samples should be regression-tested before claiming exhaustive support.

## API and project structure

| Path | Purpose |
|---|---|
| `GET /api/health` | Current data source, number of indexed codes, latest session |
| `GET /api/course?campus=UBCV&subject=CPEN&course=221` | Published averages/history, historical sections, related codes, data provenance |
| `GET /api/coverage` | Raw source coverage by campus/year-session plus archive metadata |
| `scripts/import_pair_data.py` | Build index and metadata from original CSV ZIP or directory |
| `lib/schedule.mjs` | Browser-side course-code parser |
| `lib/grades.mjs` | Normalize raw API profiles without inventing values |

## Development on GitHub

The source code is maintained at [Otamot77/coursewise-ubc](https://github.com/Otamot77/coursewise-ubc). Clone the repository and import your own copy of the raw dataset:

```bash
git clone https://github.com/Otamot77/coursewise-ubc.git
cd coursewise-ubc
python3 scripts/import_pair_data.py /path/to/ubc-pair-grade-data-master.zip
npm test
npm run test:data
npm start
```

The source repo intentionally excludes generated data files. The application runs in API-fallback mode until you import the archive. Check the upstream dataset's terms and authorization before publishing, hosting or redistributing its derived index. Do not publish private student schedules.

## Roadmap ideas

**Near-term:** Test actual Workday paste/saved-schedule formats; add year and section filters; make a search-autocomplete backed by local data; show instructor-linked published sections with a sufficiently large sample and clear non-causal disclaimers; report what percentage of each course's sections have averages.

**Later:** Timetable planner and schedule comparison, prerequisite/degree progress planning, workload reviews (separate unofficial crowdsourced data), class-time ICS export, and privacy-respecting, curated official course metadata. Avoid inferring suppressed counts or fabricating missing grades.

*Not affiliated with the University of British Columbia.*

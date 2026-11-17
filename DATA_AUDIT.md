# Raw UBC grade dataset audit

Audit performed against the user-provided `ubc-pair-grade-data-master.zip`, containing CSVs from historical UBC PAIR reports and two Tableau dashboard generations. The source README identifies its Tableau v2 archive as last updated June 2026.

## What is actually available

| Statistic | Count |
|---|---:|
| CSV files | 13,162 |
| All CSV rows | 489,852 |
| Structurally valid rows | 489,848 |
| Rows with published course/section average | 447,302 |
| Rows with missing average | 42,546 |
| Normalized campus-subject-course entries | 21,280 |
| Entries with one or more published averages | 20,424 |
| Entries with no published average in this archive | 856 |

`Campus + subject + course code` counts are **not** numbers of unique currently offered courses. Historical renamed codes, one-letter variants, and discontinued courses contribute to the counts.

## Coverage by source

| Source | Campus | Sessions covered | Raw rows | Rows with published averages |
|---|---|---|---:|---:|
| PAIR Reports | Vancouver | 1996S–2018W | 327,545 normalized | 284,999 |
| Tableau Dashboard | Vancouver | 2014S–2021W | 98,795 | 98,795 |
| Tableau Dashboard | Okanagan | 2014S–2021W | 19,315 | 19,315 |
| Tableau Dashboard v2 | Vancouver | 2021S–2025W | 36,393 | 36,393 |
| Tableau Dashboard v2 | Okanagan | 2021S–2025W | 7,800 | 7,800 |

The raw vintages overlap, so these per-source rows are **not** additive when computing the course/year-level historical averages. There are 60 distinct year-sessions represented for Vancouver and 24 for Okanagan. The latest source year-session is **2025W**.

Notably, all 42,546 rows without a course average come from the older PAIR dataset. This does **not** mean modern Tableau grade-distribution bins are all visible: bins for small classes or grade categories may be withheld even when an overall average is present.

## Overlap, duplicates and corrections

- The importer selected one source vintage per campus/course/year-session, preferring v2 then v1 then original PAIR. It does not fill a newer source's withheld statistic from a previous snapshot because that could undermine newer privacy protections.
- For years containing distinct section rows, `OVERALL` rows are not added to them. For course years with no distinct sections, `OVERALL` may be used as the only published aggregate.
- Repeated section identifiers are collapsed before aggregating, selecting the best observed published record. The older PAIR archive also supplies instructor corrections; these are applied to educator attribution when applicable.
- The source has instances of the same apparent course under letter-suffixed codes. For example, `CPEN 221` has data through 2022W while the archive lists `CPEN 221A` and `CPEN 221B` through 2025W. The app links these rather than assuming their means can be safely merged.
- An archive entry with `Avg` absent is **recorded but unavailable**. Do not treat it as a 0% grade or invent values from surrounding sections.

## Examples spot-checked against source CSVs

| Code | Source entry | Published result in local index |
|---|---|---|
| CPEN 211, Vancouver | 2025W, section 101 | 72.8% |
| CPEN 221A, Vancouver | 2025W, section 101 | 77.6% |
| CPEN 221B, Vancouver | 2025W, section 101 | 73.9% |
| CPSC 110, Vancouver | 2025W | Multiple published sections; aggregated with reported counts |
| MATH 100, Vancouver | 2025W | Multiple published sections; aggregated with reported counts |

Published per-section scores are historical facts in the source, not grade predictions. For multi-section courses the app's aggregated average may differ from university-published overall statistics due to missing/withheld sections, difference between Enrolled/Reported, or source-vintage changes. Coverage and aggregation method are stored per session in `coverage.sessionDetails`.

## Possible next steps to fill real gaps

1. **Audit codes and crosswalks:** Link renamed or letter-suffixed courses using authoritative course calendar mappings; keep independently reported codes separate unless equivalence is proven.
2. **Source freshness:** Investigate why raw source record counts vary by year/session and whether more recent official UBC grade reports are accessible; do not assume fewer rows mean missing data.
3. **Provenance review:** Cross-check individual years/sections against their official records and the original UBCGrades API to catch transcription or mapping errors.
4. **Add non-grade metadata:** Course descriptions, prerequisites, credits, campus offerings, timetable and registration information (subject to terms and permitted access). Clearly distinguish official data from computed or crowdsourced values.
5. **Respect privacy:** Do not infer grade bins that reporting systems intentionally suppress. Avoid attaching private Workday records to a public data store.

The dataset ZIP has no explicit licence file. Its availability on GitHub should not automatically be treated as permission for republication. The generated index stays ignored by Git in the source repository until its use rights are confirmed.

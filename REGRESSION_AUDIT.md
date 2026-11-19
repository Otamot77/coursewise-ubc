# Coursewise v1.1.1 regression audit

This is a repair of v1.1.0. The visual redesign and the local historical grade database are retained. No private Workday spreadsheet or student grades are included in the release.

## Issues repaired

1. **Instructor difference lost its meaning.** The v1.1.0 educator roster changed an explicit same-academic-term comparison to an ambiguous “vs course*” column. It also formatted an arithmetic difference between two percentages using `%`, when the correct unit is **percentage points**. The full name and `pp` units are now visible in the table, featured educator preview, and full report; matching reference mean and section count are shown.
2. **Mixed weighting in reference averages.** When an educator had published section sizes but another course section in the same academic term lacked its size, v1.1.0 used a student-weighted educator mean against an equally weighted course reference. The new `matchedSectionComparison` routine requires identical weighting methods on both sides, and matches reference terms to the educator's graded terms rather than unrelated years. All reference section averages include the educator's own sections. These are descriptive historical comparisons, *not* instructor-effect estimates.
3. **Student evidence column disappeared.** Student counts and partial-count indications are restored in the educator roster; an educator's full report retains the original full section-by-section history and distributions.
4. **First import feedback disappeared.** When first adding courses dismissed the import setup, the success message was written into the now-hidden import form. An accessible status message is now displayed in the visible workspace.

## Verification

- **99/99 JavaScript tests**, covering course parsing, grade calculations, student standing, comparison, instructor-period logic, missing sizes, suppression, chart rendering, saved lineups, swaps, search, and API routes.
- **5/5 Python importer tests**, including archive metadata and source precedence.
- **Chromium browser_smoke.py** passed the original workflows, including the actual provided Workday `.xlsx` export, schedule migration, swaps, undo, saved lineups, completed standing, instructor details, Passport marker, Browse filters and mobile widths.
- **Chromium regression_full.py** passed a second, more detailed suite: matched-term ± labels/reference evidence, filtering, sorting, search, selected histogram, two-instructor comparison and uncheck, full report term selection and close, section/term distribution controls, Passport target, Workday paste and confirmation, course comparison and threshold, Grade Goal synchronization, preserving completed grades after reset, independent saved-lineup state, GPA and data-source pages, and 320–1440px layouts.
- **Real archive data sanity check:** checked 145 UBCV course profiles with 1,459 named educator groups. All 1,452 calculable group/reference comparisons used the same weighting method; seven intentionally yielded unavailable values. Full instructor reports agreed with group-level differences.
- **Clean ZIP check:** Both source-only and data-included archives are independently extracted and retested prior to release. On the data-included archive, the local HTTP server must correctly serve the six page routes, course search, and published grade records while refusing direct public access to the compressed raw grade index.

## Honest limitations and known methodological constraints

The test environment blocks Chromium's navigation to `http://localhost` by policy, so the browser suites load the genuine HTML/CSS/ES modules with API responses from the genuine locally imported dataset, while HTTP route behavior is tested separately. This does not verify connectivity over a user's Wi-Fi network or cover every possible keyboard, browser-extension, or Windows-specific issue.

Instructor history is not a causal measure of grading strictness. Multiple educators can share a section; older section records may be truncated to the most recent 120; some bands/sizes are missing or privacy-suppressed; and same-term reference means are computed only from retained, published section averages. The dataset cannot link students across courses to establish university-wide semester percentile rankings.

When upgrading locally, stop the old Node server before launching the extracted v1.1.1 folder. A hard refresh (`Ctrl+F5`) can help if the browser has old scripts or styles cached. Existing browser-local lineups and grades are preserved by using the same storage keys.

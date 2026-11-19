# Coursewise UBC

**Historical grade data, connected to useful decisions—not another AI chatbot.** Coursewise is an independent, privacy-first UBC academic explorer. It turns a large, locally indexed archive of UBC's publicly reported historical grades into interactive, explainable tools that would be difficult to reproduce with a single AI prompt.

Website source: [Otamot77/coursewise-ubc](https://github.com/Otamot77/coursewise-ubc). **Not affiliated with UBC.** Inspired by the MIT-licensed [UBCGrades](https://ubcgrades.com). The underlying grade records originally came from UBC and were preserved in [DonneyF/ubc-pair-grade-data](https://github.com/DonneyF/ubc-pair-grade-data). The MIT license covers **Coursewise code only**, not the upstream data archive.

## v1.1.1 — regression repair and deeper verification

This patch keeps the v1.1 visual redesign while restoring **the explicit ± instructor section average versus all recorded sections from the *same academic terms***. The table again shows the instructor's student count and now exposes the matching reference mean and number of reference sections. Differences are shown as **percentage points (pp)** rather than the previously misleading percent sign. The same comparison is visible in the selected educator chart and their full section report.

The matched-term calculation has also been corrected for **missing section sizes**: instructor and reference averages use student-count weighting only when *every compared graded section* has a published positive size; otherwise *both* averages use equal section weights. Comparing a student-weighted instructor mean with an unweighted course mean is prohibited. Reference sections **include the instructor's own sections**, so this is a descriptive comparison rather than a causal estimate of how an instructor grades. The comparison may reflect only retained records if historical sections were truncated in the source archive; individual grade-band distributions still exclude sections with withheld bins.

Fixed a separate UX regression where successfully importing the first schedule hid the confirmation message along with the automatically dismissed setup form. Coursewise now shows the outcome in the visible workspace. Expanded the real-browser regression suite to exercise instructor sorting, academic-period filters, search, selected histograms, two-instructor comparison, full-report term filters, course distribution and Passport selection, Workday paste, manual course comparison, Grade Goal synchronization, completed-course standing, saved lineups, GPA/data pages, and narrow mobile widths. JavaScript tests now explicitly cover missing-size weighting and matched-term comparison, and real archived course profiles were checked for consistent comparison methods.

**Upgrade:** Download `coursewise-ubc-v1.1.1-with-data.zip`, extract it to a **new folder**, stop any previous server with `Ctrl+C`, then run `npm start` or `npm run lan` from inside the extracted `coursewise-ubc` directory. Saved courses, completed grades, and lineups use the same browser-local storage keys as v1.1.0. On your local desktop, `Ctrl+F5` helps bypass cached CSS/JS after switching versions. This is a code and UI patch: the existing grade archive is unchanged.

## Changes in v1.1.0 — focused redesign and instructor-first analysis

The site is reorganized around **the decisions UBC students actually make**: look up a course, inspect its historical grade distribution, see what happened in specific instructors' recorded sections, and then evaluate a saved course lineup. The visual redesign uses a compact sticky navigation bar, a narrower introductory homepage, more readable statistics, consistent spacing, and a dense, comparison-friendly Browse list. The course report puts **Instructor grades & distributions** directly after the summary and gives the recorded-section distribution a featured, selectable chart. The course-level histogram and target-grade Passport remain interconnected, with sample sizes, data completeness and academic-session provenance preserved.

**My Classes** now centers on the user's saved lineup instead of leaving a large Workday import sidebar open after import. Course rows have editable **credit values**, **planned/final grades**, and an explicit **Completed** checkbox. The same values power Grade Goals, persisted saved-lineup options, swaps and an always-visible **How Goated Are You?** summary. It includes **only courses marked completed with a final grade**; unfinished courses and hypothetical grade targets are excluded. Missing or privacy-suppressed complete grade distributions are excluded with an explanation. The visible headline is a **credit-weighted average of individual course historical standings**, **not a percentile among all UBC students**, not a student-by-student class rank, and not an estimate of how peers' semester averages are distributed. No personality badges or messages are shown.

My Classes' import/upload controls become available through a compact **Import Workday schedule** action after courses exist, but remain visible for first-time setup. Existing Workday `.xlsx` parsing, local storage, saved lineups, Grade Goal Planner, comparison, swap preview/undo, course reports and Rate My Professors search links are retained. The detailed planner remains available under **Advanced grade planning** for users who want course sliders; the primary course-grade inputs no longer need to be entered twice. Manual course addition now validates against the exact historical catalog, rejecting codes like `FFFF222` *without adding fake courses*, and offering clickable alternatives where a match exists.

**Version migration:** The same browser-local course/grade keys remain in use. No data upload or account is required. As before, each device has separate local storage. Wi-Fi access continues through `npm run lan`, with `npm start` local-only. The underlying historical archive remains outside the source-only repository.

## Changes in v1.0.1 — valid course search and local Wi-Fi access

**Search stays on the homepage when a code is not found.** A valid-looking string such as `FFFF222` must first match an exact campus/course entry in the imported historical catalog. A miss shows an inline **Course not found** message and, when available, clickable **Did you mean…?** suggestions based on near course codes or course titles. The lookup never fabricates a course report. Deep links to missing courses show a not-found message instead of an empty report. A code archived only at the other UBC campus may be suggested with its campus clearly labeled.

**Wi-Fi hosting is opt-in.** Use `npm run lan` instead of `npm start` to listen on all local interfaces and print this computer's LAN URL. Other devices on the **same Wi-Fi/private network** can open it in their browser. `npm start` remains restricted to the local computer. No accounts, external hosting, or port forwarding are needed. Each device's saved courses and lineups are **independent** because they use browser-local storage.

## Core data and tools (introduced in v1.0.0)

| Area | What you can do |
|---|---|
| **Course report + Grade Difficulty Passport** | Search a course, inspect course-term averages and the grade histogram. Move a **50–100% target slider** to see historical standing and how often students scored at or above the target. The marker moves on the same histogram. Includes exact 80+, 85+, and 90+ rates when all bins are available, median when available, and a term-average consistency range. |
| **Data provenance and reliability** | See the actual academic term, published sample size, section selection, grade-band completeness, and warnings for missing/suppressed bins or truncated section histories. No fabricated grades. |
| **My Classes** | Paste course codes, add courses manually, or locally parse a **Workday `.xlsx` export**. See compact historical summaries, credit-weighted baseline, compare courses, and use the existing Grade Goal Planner. |
| **Saved lineups** | Create, duplicate, rename, switch, or delete up to 12 locally saved course-lineup options. Each preserves its own courses, grade goals, credits, fixed grades and completion inputs. Older local course lists are migrated. |
| **Grades-only swap** | Click **Try swapping** on a course card; search a replacement, preview differences in historical mean, median, 85%+ attainment and credit-weighted semester baseline; **Apply** or **Undo**. Timetable and prerequisite equivalence are deliberately not inferred. |
| **Browse** | Search the indexed catalog, choose campus/subject/level, and optionally filter/sort by 85%+ attainment, complete distributions from recent years, or stability of published term averages. Missing data are not treated as zero. |
| **Instructor reports** | Open recorded educator sections, section statistics, grade distributions and a two-line instructor-vs-course term-average trend. The optional comparison remains capped at two educators. A **Rate My Professors search link** is provided for manual identity checking; Coursewise does not scrape or embed ratings. |
| **Navigation and UBC grading** | Direct, linkable pages and a sticky header; UBC percentage-to-4.33 guide clearly labeled as an **equivalency**, not actual calculated GPA. |

## Local setup

**Requirements:** Node.js 20+. No `npm install`, API key, hosting, login or database service is required for the app. Python 3.10+ is needed only to create the grade index from the original archive.

### Ready-to-run ZIP on Windows

If you have **`coursewise-ubc-v1.1.1-with-data.zip`**, extract it to your Downloads folder, then run:

```powershell
cd "$HOME\Downloads\coursewise-ubc-v1.1.1-with-data\coursewise-ubc"
npm start
```

Open <http://localhost:4173>. Stop an older running Coursewise server with `Ctrl+C` first. The with-data ZIP already includes the index; **do not reimport it**.

### Open Coursewise on your phone or another device (same Wi-Fi)

While your laptop or desktop is connected to your trusted home or campus network, from the extracted `coursewise-ubc` folder run:

```powershell
npm run lan
```

You will see a line like `On the same Wi-Fi: http://192.168.1.23:4173` — **use the IP address printed on your computer**, not this example. Open that URL in Safari/Chrome on your phone or another computer connected to the same network. Keep the PowerShell window running while you use the site. `Ctrl+C` stops hosting.

If it does not connect: confirm both devices are on the same private network, allow **Node.js on Private networks only** if Windows Firewall prompts, and check that your Wi-Fi/router isn't isolating devices (common on guest/public/campus Wi-Fi). Your laptop's IP address can change when you reconnect. This is development/LAN hosting, not a public internet deployment: **do not port-forward port 4173**. Workday spreadsheets are parsed in the accessing browser, and personal lineups are stored separately in each browser, not shared across your devices.

### Source-only GitHub checkout

```bash
git clone https://github.com/Otamot77/coursewise-ubc.git
cd coursewise-ubc
python3 scripts/import_pair_data.py /path/to/ubc-pair-grade-data-master.zip
npm start
```

The local importer generates the ignored files:

- `data/course-index.json.gz` — historical profile, grade bands, source and section data
- `data/coverage.json` — published coverage by campus and academic session
- `data/metadata.json` — source and import metadata

**Source-only limitation:** Without the locally imported grade dataset, the homepage cannot verify exact course existence or suggest historical catalog matches. Individual manually opened course URLs can still use the UBCGrades API fallback, but Browse, grade-band statistics, Passport rates, and the local coverage browser require the dataset. The GitHub repository **intentionally does not distribute the raw or derived grade archive** pending separate confirmation of redistribution permission. Do not commit raw schedules, student data or the original workbook.

## Grade Difficulty Passport: statistical interpretation

For an individual course, the academic-session and section selectors determine which records the Passport describes. By default, Coursewise uses the **newest fully published retained academic session** when one exists. Older complete evidence is explicitly dated instead of silently represented as current. The **OVERALL** row is never added to explicit section rows. If a term's retained section list is incomplete, full-term Passport rates are unavailable; a single retained section can still be inspected independently.

The archive provides counts in eleven UBC grade bands, not each student's exact percentage grade. At boundaries like **80%, 85%, and 90%**, adding all the counts below the threshold gives the **exact fraction below it within a fully published sample**. A target inside one band (for example, 83%) uses a *labeled* uniform-within-band interpolation; the visible lower and upper bounds represent the range possible without knowing the individual marks. A 100% target is **not** treated as an exact band boundary, because the 90–100% group includes both 100s and lower A+ grades. All counts in all eleven bands must be present; missing or suppressed values yield a dash rather than an estimate.

**Historical standing is descriptive, not a personal prediction.** Different students, years, instructors and sections are not directly comparable. The "grade consistency" range is simply the minimum-to-maximum **term-average grade** over the most recent five **represented** academic years where at least three terms exist; it is *not* the standard deviation of student marks. The original standard-deviation field remains in the backend data where available but is intentionally absent from the UI.

The Passport target is saved locally and reused on other course reports. The 80+/85+/90+ rates, counts, median and mean are all tied to their displayed source term/section, not casually blended across years. Published section medians are labeled; aggregated medians interpolated from complete grouped grades show `≈`.

## Grade Goal Planner and grades-only swaps

The Grade Goal Planner uses a **credit-weighted semester average** (credits default to **3** and must be corrected for your actual registration; 1.5-credit UBC courses exist). Pinned or completed grades are fixed; unlocked course target grades are rebalanced to reach the target where complete distribution data permit.

It does this by finding a common historical percentile *within each unlocked course*. It does **not** know correlations between your courses, does **not** predict your actual grade, and does **not** estimate your percentile among students' overall semester grades. Its required remaining credit-weighted average is exact arithmetic given your manually entered grades, but percentile-to-mark interpolations remain approximate.

Swapping a course creates a **preview only** until you click Apply; applying resets the outgoing course's credit/grade entry and assigns default 3 credits to the new course until manually corrected. Undo restores the original courses and Grade Goal settings. Swap results use documented historical terms, which may differ across courses. A higher historical average does not establish that one course is easier for an individual or that it satisfies the same degree requirements. Multiple saved lineups use **browser-local storage**, not accounts; clearing browser site data will delete them. The old local single-lineup format is migrated on first run.

## Instructor data and Rate My Professors

Instructor names in the archive reflect **recorded teaching attributions**, sometimes TAs or multiple staff on the same section. Their section grade histories and comparisons **cannot establish instructor effects** or present-day section assignments. An educator's report shows retained sections with grades, medians, quartiles, highs/lows and section sizes (when published), plus their section averages against the whole course's published session mean in matching terms.

Some large courses retain only the **newest 120 section rows** in the generated index, so older educator history can be incomplete. The Rate My Professors link opens a **name search within the relevant UBC campus's school page**; it doesn't imply a verified identity match and **doesn't fetch or reproduce ratings**. Users should confirm the professor and school themselves.

## Data sources and provenance

- Original grades: published UBC PAIR reports and institutional Tableau grade-distribution dashboards. See UBC's [Grade Distribution Report](https://cio.ubc.ca/grade-distribution-report), which can require institutional access.
- Local historical archive: [DonneyF's community-maintained UBC PAIR archive](https://github.com/DonneyF/ubc-pair-grade-data). The current imported source contains **13,162 CSV files**, **489,852 rows**, and **21,280 normalized campus/course-code entries**, with **2025W** the latest represented session. The archive is **not** a live feed from UBC.
- When the local index is absent, directly opened course URLs can fall back to the [UBCGrades API](https://ubcgrades.com/api-reference). With the local index installed, unknown course codes return **not found** instead of an empty report. The historical archive does not represent every currently offered UBC course.

Privacy-suppressed grade bins stay missing, never zero or reconstructed. Student counts can mean *enrolled* in one historical vintage and *reported outcomes* in another. A historical aggregate might include only retained published sections. UBC's published course averages and grade distributions are descriptive statistics, not standardized course difficulty scores. A percentage-level 4.33 lookup is not a student's calculated GPA. Actual course and instructor availability, schedules and credit values must be checked through UBC systems.

## API

| Endpoint | Purpose |
|---|---|
| `/api/health` | Data mode, indexed-course count, last represented session |
| `/api/catalog?campus=UBCV&subjectPrefix=CP&level=200&page=1` | Catalog search and pagination (nine items/page) |
| `/api/catalog?campus=UBCV&min85=20&recentComplete=1&sort=attain85` | Filter by complete-band 85%+ rate, recent complete session and sort by attainment |
| `/api/catalog?campus=UBCV&maxRange=10&sort=consistent` | Filter/sort by course-term mean range in last five represented academic years |
| `/api/course-search?campus=UBCV&q=CPSC%20110` | Validate exact campus/course existence; return up to five conservative typo suggestions |
| `/api/course?campus=UBCV&subject=CPEN&course=211` | Local course profile, section records, grade bands, history and source metadata |
| `/api/coverage` | Campus/session coverage from the local imported archive |

The catalog serves **aggregate metadata** and never exposes raw individual course sections through its search endpoint. The raw `.gz` grade index is not accessible as a static web resource.

## Tests and browser verification

```bash
npm test
npm run test:data
```

The JavaScript and Python test suites cover archive imports, grade distributions, suppressed bins, instructor attribution, section evidence, API route states, Excel importer parsing, credit-weighted planning, lineups, swaps and Passport statistics. The optional developer-only browser harness `scripts/browser_smoke.py` requires Python Playwright, Chromium and the imported archive, and exercises the actual DOM with selected real course profiles. A supplied Workday `.xlsx` can be tested by placing it at `/mnt/data/View_My_Courses.xlsx` in this build environment; **the workbook must never be committed or shipped**.

**Limitations of browser testing in this environment:** Localhost page navigation can be blocked by the browser sandbox. The browser harness therefore assembles the actual HTML/CSS/JavaScript into an offline Chromium page and stubs the API with genuine imported course profiles. HTTP route initialization is separately checked in Node integration tests. This is stronger than markup-only tests, but it does not prove every possible browser/environment combination.

---

*Coursewise is an independent student project. It is not affiliated with or endorsed by the University of British Columbia. Archived data and individual instructor attributions may be incomplete or outdated.*

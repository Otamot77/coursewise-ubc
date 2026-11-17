/** Coursewise grade analytics. Missing / suppressed source bins stay null, never zero. */
export const GRADE_BANDS = [
  { key: '<50', label: 'F', range: '0–49%' },
  { key: '50-54', label: 'D', range: '50–54%' },
  { key: '55-59', label: 'C−', range: '55–59%' },
  { key: '60-63', label: 'C', range: '60–63%' },
  { key: '64-67', label: 'C+', range: '64–67%' },
  { key: '68-71', label: 'B−', range: '68–71%' },
  { key: '72-75', label: 'B', range: '72–75%' },
  { key: '76-79', label: 'B+', range: '76–79%' },
  { key: '80-84', label: 'A−', range: '80–84%' },
  { key: '85-89', label: 'A', range: '85–89%' },
  { key: '90-100', label: 'A+', range: '90–100%' }
];

// UBC Arts / UBC Okanagan published 4.33 percentage equivalency (50–90).
// See https://www.arts.ubc.ca/degree-planning/academic-performance/promotion-continuation-grading/
export const GPA_EQUIVALENCIES = [
  1.00, 1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 1.90,
  2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.55, 2.60, 2.65, 2.70,
  2.80, 2.90, 2.95, 3.00, 3.10, 3.20, 3.30, 3.40, 3.50, 3.60,
  3.70, 3.75, 3.80, 3.85, 3.90, 3.95, 4.00, 4.10, 4.20, 4.30,
  4.33
];

const numberOrNull = value => (typeof value === 'number' && Number.isFinite(value) ? value : (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null));
const boundedNumber = (value, low = 0, high = 100) => { const n = numberOrNull(value); return n !== null && n >= low && n <= high ? n : null; };
const validCount = value => { const n = numberOrNull(value); return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null; };

export function letterFromPercentage(percent) {
  const v = boundedNumber(percent);
  if (v === null) return null;
  const thresholds = [[90, 'A+'], [85, 'A'], [80, 'A−'], [76, 'B+'], [72, 'B'], [68, 'B−'], [64, 'C+'], [60, 'C'], [55, 'C−'], [50, 'D'], [0, 'F']];
  return thresholds.find(([min]) => v >= min)?.[1] ?? null;
}

/** Convert a single percent, not a distribution or a credit-weighted GPA.
 * UBC's published table specifies integer points; a fractional course mean is
 * rounded to the nearest whole percent for a clearly marked approximation.
 * Below 50 returns null because the referenced table stops at 50.
 */
export function gpaEquivalency(percent) {
  const value = boundedNumber(percent);
  if (value === null) return null;
  const mappedPercent = Math.round(value);
  if (value < 50) return { gpa: null, mappedPercent, approximate: false, letter: 'F', notInTable: true };
  return {
    gpa: mappedPercent >= 90 ? 4.33 : GPA_EQUIVALENCIES[mappedPercent - 50],
    mappedPercent,
    approximate: mappedPercent !== value,
    letter: letterFromPercentage(value),
    notInTable: false
  };
}

/** Sum only published bin counts. If any section has a blank bin, the sum is
 * a lower bound, not the exact class total. Count 0 is a real observation. */
export function aggregateDistributions(sections = []) {
  if (!sections.length) return null;
  const bins = GRADE_BANDS.map(band => {
    let value = 0;
    let unavailableSections = 0;
    for (const section of sections) {
      const n = validCount(section.distribution?.[band.key]);
      if (n === null) unavailableSections++;
      else value += n;
    }
    return { ...band, value: unavailableSections === sections.length ? null : value, incomplete: unavailableSections > 0, unavailableSections };
  });
  const counts = sections.map(s => validCount(s.reported));
  const validSizes = counts.filter(n => n !== null);
  const allSizeKnown = counts.length === validSizes.length;
  const size = validSizes.length ? validSizes.reduce((a, b) => a + b, 0) : null;
  const statuses = Object.fromEntries(['Pass', 'Fail', 'Withdrew', 'Audit', 'Other'].map(k => {
    const values = sections.map(s => validCount(s.statusCounts?.[k]));
    return [k, values.every(n => n !== null) ? values.reduce((a, b) => a + b, 0) : null];
  }));
  const highs = sections.map(s => boundedNumber(s.high)).filter(n => n !== null);
  const lows = sections.map(s => boundedNumber(s.low)).filter(n => n !== null);
  return {
    bins, sections: sections.length, reported: size,
    partialSize: !allSizeKnown, sizeLabel: sections.every(s => s.reportedKind === 'Reported') ? 'Reported students' : sections.every(s => s.reportedKind === 'Enrolled') ? 'Enrolled students' : 'Students (mixed definitions)',
    fullyPublished: bins.every(b => !b.incomplete),
    passRate: statuses.Pass !== null && statuses.Fail !== null && (statuses.Pass + statuses.Fail) > 0
      ? 100 * statuses.Pass / (statuses.Pass + statuses.Fail) : null,
    publishedCount: bins.reduce((n,b) => n + (b.value ?? 0), 0),
    statuses,
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null
  };
}

export function normalizeProfile(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const stats = payload.stats && !Array.isArray(payload.stats) ? payload.stats : null;
  if (!stats) return null;
  const years = payload.history?.yearsessions ?? {};
  const history = Object.entries(years)
    .filter(([key, val]) => /^\d{4}[WS]$/.test(key) && boundedNumber(val) !== null)
    .map(([yearsession, average]) => ({ yearsession, average: boundedNumber(average) }))
    .sort((a, b) => a.yearsession.localeCompare(b.yearsession));
  const teachingTeam = (Array.isArray(payload.teachingTeam) ? payload.teachingTeam : [])
    .filter(x => typeof x?.name === 'string' && x.name.trim())
    .map(x => ({ name: x.name, yearsessions: x.yearsessions ?? {} }))
    .sort((a, b) => Object.keys(b.yearsessions).length - Object.keys(a.yearsessions).length).slice(0, 30);
  const recentSections = (Array.isArray(payload.recentSections) ? payload.recentSections : [])
    .filter(x => /^\d{4}[WS]$/.test(x?.yearsession || '') && /^(?:[A-Z0-9]{3,5}|OVERALL)$/.test(x?.section || ''))
    .slice(0, 120).map(x => ({
      yearsession: x.yearsession, section: x.section,
      average: boundedNumber(x.average), reported: validCount(x.reported),
      reportedKind: x.reportedKind === 'Reported' ? 'Reported' : 'Enrolled',
      high: boundedNumber(x.high), low: boundedNumber(x.low),
      median: boundedNumber(x.median), p25: boundedNumber(x.p25), p75: boundedNumber(x.p75),
      stdDev: boundedNumber(x.stdDev, 0, 100),
      distribution: Object.fromEntries(GRADE_BANDS.map(({ key }) => [key, validCount(x.distribution?.[key])])),
      statusCounts: Object.fromEntries(['Pass', 'Fail', 'Withdrew', 'Audit', 'Other'].map(key => [key, validCount(x.statusCounts?.[key])])),
      educators: Array.isArray(x.educators) ? x.educators.filter(n => typeof n === 'string').slice(0, 8) : [], source: x.source || ''
    }));
  return {
    title: stats.course_title || '',
    average: boundedNumber(stats.average), average5: boundedNumber(stats.average_past_5_yrs),
    high: boundedNumber(stats.max_course_avg), low: boundedNumber(stats.min_course_avg),
    highMark: boundedNumber(stats.max_grade), lowMark: boundedNumber(stats.min_grade),
    history, teachingTeam,
    relatedCodes: (Array.isArray(payload.relatedCodes) ? payload.relatedCodes : []).filter(x => /^\d{3}[A-Z]?$/.test(x?.course || '') && /^\d{4}[WS]$/.test(x?.latest || '')),
    recentSections, source: payload.sources ?? {}, coverage: payload.coverage ?? null, fetchedAt: payload.fetchedAt ?? null
  };
}
export const fmtPercent = value => value == null ? '—' : `${Number(value).toFixed(1)}%`;
export const fmtGrade = value => value == null ? '—' : `${Number(value).toFixed(1)}`;
export function historyRange(history) {
  const years = history.map(x => x.yearsession.slice(0, 4));
  return years.length ? `${Math.min(...years.map(Number))}–${Math.max(...years.map(Number))}` : 'Not available';
}
export function recentChange(history) {
  if (history.length < 2) return null;
  return Math.round((history.at(-1).average - history.at(-2).average) * 10) / 10;
}
export function validApiPath(campus, subject, course) {
  return /^(UBCV|UBCO)$/.test(campus) && /^[A-Z]{2,6}$/.test(subject) && /^\d{3}[A-Z]?$/.test(course);
}

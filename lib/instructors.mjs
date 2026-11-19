/** Descriptive historical *attribution* summaries, not instructor-effect estimates.
 * A section with multiple listed educators is credited to each person but not
 * double-counted within a person's own records. Never infer withheld bins.
 */
import { GRADE_BANDS } from './grades.mjs';

const goodMark = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
const goodCount = n => Number.isSafeInteger(n) && n >= 0;
const uniqueNames = values => {
  const names = new Map();
  for (const value of (Array.isArray(values) ? values : [])) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const label = value.trim(), key = label.toLocaleLowerCase('en-CA');
    if (!names.has(key)) names.set(key, label);
  }
  return [...names.values()];
};

export function instructorSessions(profile) {
  const rows = Array.isArray(profile?.recentSections) ? profile.recentSections : [];
  const available = rows.filter(r => /^\d{4}[WS]$/.test(r?.yearsession || '') && typeof r.section === 'string');
  // If explicit section records exist, OVERALL must never be added alongside them.
  const hasExplicit = new Set(available.filter(r => r.section !== 'OVERALL').map(r => r.yearsession));
  return available.filter(r => r.section !== 'OVERALL' || !hasExplicit.has(r.yearsession));
}

export function availableInstructorTerms(profile) {
  return [...new Set(instructorSessions(profile).map(r => r.yearsession))].sort().reverse();
}

export function instructorPeriod(rows, period = 'recent') {
  if (period === 'all') return rows;
  if (/^\d{4}[WS]$/.test(period)) return rows.filter(r => r.yearsession === period);
  const years = rows.map(r => Number(r.yearsession.slice(0, 4))).filter(Number.isFinite);
  if (!years.length) return [];
  const latest = Math.max(...years);
  return rows.filter(r => Number(r.yearsession.slice(0, 4)) >= latest - 4);
}

function summariseAverages(rows, forceUnweighted = false) {
  const graded = rows.filter(r => goodMark(r.average));
  const hasSizes = !forceUnweighted && graded.length > 0 && graded.every(r => goodCount(r.reported) && r.reported > 0);
  const divisor = hasSizes ? graded.reduce((n, r) => n + r.reported, 0) : graded.length;
  const mean = divisor > 0 ? graded.reduce((n, r) => n + r.average * (hasSizes ? r.reported : 1), 0) / divisor : null;
  return { mean, method: hasSizes ? 'student-weighted section means' : 'unweighted section means', graded: graded.length,
    high: graded.length ? Math.max(...graded.map(r => r.average)) : null,
    low: graded.length ? Math.min(...graded.map(r => r.average)) : null };
}

/** Compare sections using the SAME weighting method on both sides. Otherwise
 * an instructor's size-weighted mean could be compared with an equally weighted
 * course mean when the archive withholds a size for an unrelated section.
 * Reference rows include the educator's own sections (matching the original
 * Coursewise definition of "all same-term sections"). It is NOT an estimate
 * of an instructor's causal effect or the average of unique students.
 */
function matchedSectionComparison(educatorRows, allRows) {
  const terms = [...new Set(educatorRows.filter(r => goodMark(r.average)).map(r => r.yearsession))];
  const referenceRows = allRows.filter(r => terms.includes(r.yearsession) && goodMark(r.average));
  const groupRows = educatorRows.filter(r => goodMark(r.average));
  const jointlyWeighted = [...groupRows,...referenceRows].every(r => goodCount(r.reported) && r.reported > 0);
  const educator = summariseAverages(groupRows, !jointlyWeighted);
  const reference = summariseAverages(referenceRows, !jointlyWeighted);
  return {
    educator, reference,
    referenceSections: reference.graded,
    matchedTerms: terms.sort().reverse(),
    difference: educator.mean == null || reference.mean == null ? null : educator.mean - reference.mean
  };
}

function completeDistribution(rows) {
  const complete = rows.filter(r => GRADE_BANDS.every(b => goodCount(r.distribution?.[b.key])));
  const counts = GRADE_BANDS.map(b => complete.reduce((n, r) => n + r.distribution[b.key], 0));
  const total = counts.reduce((a, b) => a + b, 0);
  return { sections: complete.length, total, counts,
    percentages: total > 0 ? counts.map(n => n * 100 / total) : null };
}

export function compareInstructors(profile, period = 'recent') {
  const sourceRows = instructorSessions(profile);
  const rows = instructorPeriod(sourceRows, period);
  const catalog = new Map();
  for (const row of rows) {
    const names = uniqueNames(row.educators);
    for (const name of names) {
      const key = name.toLocaleLowerCase('en-CA');
      if (!catalog.has(key)) catalog.set(key, { name, rows: [], shared: 0 });
      const group = catalog.get(key);
      // Repeated case variants and names listed twice must not duplicate sections.
      if (!group.rows.some(r => r.yearsession === row.yearsession && r.section === row.section)) {
        group.rows.push(row);
        if (names.length > 1) group.shared++;
      }
    }
  }
  const instructorGroups = [...catalog.values()].map(group => {
    const comparison = matchedSectionComparison(group.rows, rows);
    const graded = comparison.educator;
    const reference = comparison.reference;
    const sizes = group.rows.filter(r => goodMark(r.average)).map(r => r.reported);
    const allSizes = sizes.length > 0 && sizes.every(n => goodCount(n) && n > 0);
    const totalReported = sizes.filter(n => goodCount(n) && n > 0).reduce((a, b) => a + b, 0);
    return {
      name: group.name, sections: group.rows.length, graded: graded.graded,
      shared: group.shared, latest: group.rows.map(r => r.yearsession).sort().at(-1) ?? null,
      sessions: [...new Set(group.rows.map(r => r.yearsession))].sort().reverse(),
      average: graded.mean, method: graded.method, high: graded.high, low: graded.low,
      referenceAverage: reference.mean, referenceSections: comparison.referenceSections,
      referenceMethod: reference.method, matchedTerms: comparison.matchedTerms,
      difference: comparison.difference,
      students: sizes.length && totalReported ? totalReported : null,
      partialStudents: !allSizes, sizeKinds: [...new Set(group.rows.map(r => r.reportedKind))],
      distribution: completeDistribution(group.rows),
      rows: group.rows.slice().sort((a, b) => b.yearsession.localeCompare(a.yearsession) || a.section.localeCompare(b.section))
    };
  });
  instructorGroups.sort((a, b) => b.graded - a.graded || b.sections - a.sections || a.name.localeCompare(b.name));
  return { instructors: instructorGroups, sections: rows.length,
    unassigned: rows.filter(r => !uniqueNames(r.educators).length).length,
    totalSections: sourceRows.length, latest: sourceRows.map(r => r.yearsession).sort().at(-1) || null,
    truncated: Boolean(profile?.coverage?.limitedSectionHistory), period };
}


/** A dedicated record view for one named educator. Use all retained sections by
 * default; the comparison period filter must not silently hide older history.
 * Individual section summaries (median, SD, quartiles) are never combined as if
 * they were student-level statistics. Names describe published attribution only.
 */
export function instructorReport(profile, name, term = 'all') {
  if (typeof name !== 'string' || !name.trim()) return null;
  const base = compareInstructors(profile, 'all').instructors
    .find(g => g.name.toLocaleLowerCase('en-CA') === name.trim().toLocaleLowerCase('en-CA'));
  if (!base) return null;
  const rows = term === 'all' ? base.rows : base.rows.filter(r => r.yearsession === term);
  if (term !== 'all' && !base.sessions.includes(term)) return null;
  const comparison = matchedSectionComparison(rows, instructorSessions(profile));
  const graded = comparison.educator;
  const publishedSizes = rows.filter(r => goodCount(r.reported)).map(r => r.reported);
  const allSizes = publishedSizes.length === rows.length;
  const statsBySession = [...new Set(rows.map(r => r.yearsession))].sort().map(session => {
    const sectionRows = rows.filter(r => r.yearsession === session);
    const summary = summariseAverages(sectionRows);
    return { session, average: summary.mean, sections: sectionRows.length, graded:summary.graded };
  });
  return {
    name:base.name, rows, terms:base.sessions, history:statsBySession,
    sections:rows.length, graded:graded.graded, mean:graded.mean,
    method:graded.method, high:graded.high, low:graded.low,
    referenceAverage:comparison.reference.mean, referenceSections:comparison.referenceSections,
    matchedTerms:comparison.matchedTerms, difference:comparison.difference,
    latest:rows.map(r => r.yearsession).sort().at(-1) ?? null,
    sizeTotal:publishedSizes.length ? publishedSizes.reduce((a,b)=>a+b,0) : null,
    partialSizes:!allSizes, shared:rows.filter(r => uniqueNames(r.educators).length>1).length,
    distribution:completeDistribution(rows),
    totalFromArchive:base.sections
  };
}

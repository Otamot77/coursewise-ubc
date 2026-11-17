/** Course comparisons based on published historical section records.
 * Grade counts are bucketed (not individual marks); suppressed counts remain unknown.
 */
import { aggregateDistributions } from './grades.mjs';
import { chooseDistribution, GRADE_EDGES, gradeAtPercentile, validGrade } from './planner.mjs';

const finite = x => typeof x === 'number' && Number.isFinite(x) ? x : null;

/** Among the published grade outcomes, the fraction strictly below the target.
 * At a band's lower boundary the fraction is exact, because all lower bands
 * have fully published counts. Within a band, we interpolate uniformly and
 * expose the full possible interval, without pretending to know exact marks.
 */
export function standingAtGrade(dist, grade) {
  if (!dist || !validGrade(grade) || !Array.isArray(dist.bins) || dist.bins.length !== GRADE_EDGES.length - 1 ||
      !Number.isInteger(dist.n) || dist.n < 1 || dist.bins.some(c => !Number.isSafeInteger(c) || c < 0) ||
      dist.bins.reduce((a,b) => a+b, 0) !== dist.n) return null;
  let prior = 0;
  for (let i = 0; i < dist.bins.length; i++) {
    const floor = GRADE_EDGES[i], ceiling = GRADE_EDGES[i + 1];
    if (grade < ceiling || i === dist.bins.length - 1) {
      const share = 100 * prior / dist.n;
      const upper = 100 * (prior + dist.bins[i]) / dist.n;
      const exact = grade === floor; // A band boundary tells us the count below it exactly.
      // The last 90–100 band contains 11 integer marks (not 10).
      const bucketWidth = i === dist.bins.length - 1 ? ceiling-floor+1 : ceiling-floor;
      const interpolation = Math.min(1, Math.max(0, (grade-floor) / bucketWidth));
      return { percentBelow: exact ? share : share + (upper-share)*interpolation,
        lowerBound: share, upperBound: upper, exact, session: dist.session, sampleSize: dist.n };
    }
    prior += dist.bins[i];
  }
  return null;
}

const latestSections = profile => {
  const rows = Array.isArray(profile?.recentSections) ? profile.recentSections : [];
  const term = [...new Set(rows.map(x => x.yearsession).filter(Boolean))].sort().at(-1);
  const all = rows.filter(x => x.yearsession === term);
  const actual = all.filter(x => x.section !== 'OVERALL');
  return {term, rows: actual.length ? actual : all, explicit: actual.length > 0};
};

/** Readable, provenance-aware summary. The latest published quartiles are used
 * when a term has exactly one section; otherwise the most recent complete
 * full-term grade distribution provides approximate course-level quartiles.
 */
export function courseComparison(profile, grade = 80) {
  if (!profile) return null;
  const latest = latestSections(profile);
  const coverage = profile.coverage?.sessionDetails?.find(x => x.yearsession === latest.term);
  const partial = latest.explicit && coverage?.sectionsTotal != null && latest.rows.length !== coverage.sectionsTotal;
  const aggregated = aggregateDistributions(latest.rows);
  const dist = chooseDistribution(profile);
  const direct = latest.rows.length === 1 ? latest.rows[0] : null;
  const usePublished = direct && [direct.p25,direct.median,direct.p75].some(x => finite(x) != null);
  const quartiles = usePublished
    ? {p25: finite(direct.p25), median:finite(direct.median), p75:finite(direct.p75), term:latest.term, method:'published section', section:direct.section}
    : dist
      ? {p25:gradeAtPercentile(dist,0.25),median:gradeAtPercentile(dist,0.5),p75:gradeAtPercentile(dist,0.75),term:dist.session,method:'estimated from complete grade bands',section:null}
      : {p25:null,median:null,p75:null,term:null,method:'unavailable',section:null};
  const history = Array.isArray(profile.history) ? profile.history : [];
  const latestMean = history.at(-1) || null;
  return {
    average5:finite(profile.average5), average:finite(profile.average),
    latestMean:finite(latestMean?.average), latestMeanTerm:latestMean?.yearsession ?? null,
    highestCourseMean:finite(profile.high),lowestCourseMean:finite(profile.low),
    highestMark:finite(profile.highMark),lowestMark:finite(profile.lowMark),
    latestTerm:latest.term || null,
    latestStudents:aggregated?.reported ?? null,
    latestStudentsKind:aggregated?.sizeLabel ?? null,
    latestStudentsPartial:!!(partial || aggregated?.partialSize),
    quartiles,
    standing:standingAtGrade(dist,grade),
    distributionTerm:dist?.session || null,
    distributionN:dist?.n || null,
    // Distinct from an individual grade percentile: this is a within-course
    // historical grade distribution from one complete academic term.
    availability:!dist ? 'No complete grade distribution available in retained records' : null
  };
}

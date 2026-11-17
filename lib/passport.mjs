/** Grade Difficulty Passport: descriptive, provenance-aware statistics only.
 * Grade bands are aggregated as published; suppressed bins remain unknown.
 */
import { GRADE_BANDS, aggregateDistributions } from './grades.mjs';
import { chooseDistribution, gradeAtPercentile } from './planner.mjs';
import { standingAtGrade } from './comparison.mjs';

const isCount = x => Number.isSafeInteger(x) && x >= 0;
const finite = x => typeof x === 'number' && Number.isFinite(x);

/** Explicit section rows take precedence over an OVERALL summary: never add both. */
export function selectTermSections(profile, term, section = 'ALL') {
  const rows = Array.isArray(profile?.recentSections) ? profile.recentSections : [];
  const all = rows.filter(r => r.yearsession === term);
  const named = all.filter(r => r.section !== 'OVERALL');
  const selected = named.length ? named : all;
  const detail = profile?.coverage?.sessionDetails?.find(s => s.yearsession === term);
  const truncated = !!(named.length && Number.isInteger(detail?.sectionsTotal) && detail.sectionsTotal !== named.length);
  return {rows: section === 'ALL' ? selected : selected.filter(r => r.section === section),
    totalRows:selected.length, truncated, usedOverall:!named.length && all.length>0, detail};
}

function distributionFromRows(rows, term, section) {
  const agg = aggregateDistributions(rows);
  if (!agg?.fullyPublished || !rows.length) return null;
  const bins = GRADE_BANDS.map(b => rows.reduce((sum,r) => sum + r.distribution[b.key],0));
  if (bins.some(n => !isCount(n))) return null;
  const n = bins.reduce((a,b)=>a+b,0);
  if (n < 1) return null;
  return {session:term, section, bins, n, sections:rows.length};
}

/** Select the current distribution, never silently substituting another year. */
export function distributionForSelection(profile, term, section='ALL') {
  const selected = selectTermSections(profile,term,section);
  if (selected.truncated && section==='ALL') return null;
  return distributionFromRows(selected.rows,term,section);
}

/** Returns null when a suppressed band or truncated full-term sample prevents a rate. */
export function attainmentAtGrade(dist, target) {
  const s = standingAtGrade(dist,target);
  if (!s) return null;
  return {
    atOrAbove:100-s.percentBelow, below:s.percentBelow,
    atLeastLower:100-s.upperBound, atLeastUpper:100-s.lowerBound,
    exact:s.exact, sampleSize:s.sampleSize,
    term:s.session
  };
}

export function historicalConsistency(profile) {
  const rows = Array.isArray(profile?.history) ? profile.history.filter(x=>finite(x.average) && /^\d{4}[WS]$/.test(x.yearsession)) : [];
  if (rows.length < 3) return null;
  const latestYear = Math.max(...rows.map(x=>+x.yearsession.slice(0,4)));
  const recent = rows.filter(x=>+x.yearsession.slice(0,4)>=latestYear-4);
  if (recent.length < 3) return null;
  const means = recent.map(r=>r.average);
  return {termCount:recent.length, first:recent[0].yearsession, last:recent.at(-1).yearsession,
    min:Math.min(...means),max:Math.max(...means),range:Math.max(...means)-Math.min(...means)};
}

/** The passport defaults to the most recent complete full-term distribution.
 * Section-specific passport values may instead use the selected section's bins.
 */
export function coursePassport(profile, {term=null,section='ALL',target=85}={}) {
  if (!profile) return null;
  const fallback = chooseDistribution(profile);
  const session = term || fallback?.session || (profile.recentSections||[]).map(r=>r.yearsession).sort().at(-1) || null;
  const selection = selectTermSections(profile,session,section);
  const distribution = distributionForSelection(profile,session,section);
  const published = selection.rows.length===1 ? selection.rows[0] : null;
  const median = published && finite(published.median) ? published.median
    : distribution ? gradeAtPercentile(distribution,0.5) : null;
  const medianSource = published && finite(published.median) ? 'published section' : distribution ? 'estimated from grade bands' : null;
  const latestTerm = [...new Set((profile.recentSections||[]).map(r=>r.yearsession))].sort().at(-1);
  return {
    term:session,section, distribution,
    target:attainmentAtGrade(distribution,target),
    thresholds:Object.fromEntries([80,85,90].map(mark=>[mark,attainmentAtGrade(distribution,mark)])),
    median,medianSource,
    displayedMean:section!=='ALL' ? published?.average ?? null : selection.detail?.average ?? null,
    sampleSize:distribution?.n ?? null,
    recordedCount:selection.rows.length ? aggregateDistributions(selection.rows)?.reported : null,
    complete:!!distribution,
    partialTerm:selection.truncated,
    hasWithheldBins:selection.rows.some(r=>GRADE_BANDS.some(b=>!isCount(r.distribution?.[b.key]))),
    source: [...new Set(selection.rows.map(r=>r.source).filter(Boolean))].join(', '),
    fallbackOlder:!!(latestTerm && session && session!==latestTerm),
    latestTerm:latestTerm||null,
    limitedHistory:!!profile.coverage?.limitedSectionHistory,
    consistency:historicalConsistency(profile)
  };
}

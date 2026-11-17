/** Credit-weighted grade planning from published, *complete* grade-band counts.
 * A common per-course percentile is NOT an observed percentile of whole-term
 * averages, because the archive has no cross-course student-level records.
 */
import { GRADE_BANDS } from './grades.mjs';

export const GRADE_EDGES = [0, 50, 55, 60, 64, 68, 72, 76, 80, 85, 90, 100];
export const DEFAULT_CREDITS = 3;
const n = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isValidCount = value => Number.isSafeInteger(value) && value >= 0;
export const validCredits = value => n(value) != null && value >= 0.5 && value <= 18 && Math.round(value * 2) === value * 2;
export const validGrade = value => n(value) != null && value >= 0 && value <= 100;

/** Most recent *complete* reported academic session; do not cherry-pick sections
 * with unredacted bins or accidentally include OVERALL alongside section rows.
 * Coverage metadata prevents using a truncated section list as a full term.
 */
export function chooseDistribution(profile) {
  const sections = Array.isArray(profile?.recentSections) ? profile.recentSections : [];
  const termList = [...new Set(sections.map(row => row.yearsession).filter(Boolean))].sort().reverse();
  for (const session of termList) {
    const all = sections.filter(row => row.yearsession === session);
    const explicit = all.filter(row => row.section !== 'OVERALL');
    const chosen = explicit.length ? explicit : all;
    const detail = profile?.coverage?.sessionDetails?.find(item => item.yearsession === session);
    if (detail?.sectionsTotal && explicit.length && detail.sectionsTotal !== explicit.length) continue;
    if (!chosen.length || chosen.some(row => GRADE_BANDS.some(b => !isValidCount(row.distribution?.[b.key])))) continue;
    const counts = GRADE_BANDS.map(b => chosen.reduce((total, row) => total + row.distribution[b.key], 0));
    const count = counts.reduce((a, b) => a + b, 0);
    if (count < 10) continue;
    return { session, bins: counts, n: count, sections: chosen.length,
      yearLag: Math.max(0, new Date().getFullYear() - Number(session.slice(0, 4))),
      approximate: true };
  }
  return null;
}

/** Percentile location within broad public grade bands is interpolated uniformly.
 * This produces an illustrative grade, NOT a precise historical mark. */
export function gradeAtPercentile(dist, percentile) {
  if (!dist || !Array.isArray(dist.bins) || dist.bins.length !== GRADE_BANDS.length || !dist.n || !Number.isFinite(percentile)) return null;
  const target = clamp(percentile, 0, 1) * dist.n;
  let before = 0;
  for (let i = 0; i < dist.bins.length; i++) {
    const count = dist.bins[i];
    if (!isValidCount(count)) return null;
    if (count && (before + count >= target || i === dist.bins.length - 1)) {
      return clamp(GRADE_EDGES[i] + (GRADE_EDGES[i + 1] - GRADE_EDGES[i]) * clamp((target - before) / count, 0, 1), 0, 100);
    }
    before += count;
  }
  return null;
}

export function percentileForGrade(dist, grade) {
  if (!dist || !dist.n || !validGrade(grade) || !Array.isArray(dist.bins) || dist.bins.length !== GRADE_BANDS.length) return null;
  let below = 0;
  for (let i = 0; i < dist.bins.length; i++) {
    const count = dist.bins[i];
    if (!isValidCount(count)) return null;
    if (grade < GRADE_EDGES[i]) return 100 * below / dist.n;
    if (grade <= GRADE_EDGES[i + 1]) return 100 * (below + count * clamp((grade - GRADE_EDGES[i]) / (GRADE_EDGES[i+1] - GRADE_EDGES[i]), 0, 1)) / dist.n;
    below += count;
  }
  return 100;
}

/** Each item: {id,credits,average,distribution,fixedGrade?}.
 * `fixedGrade` null means automatically allocated; other values are known or pinned.
 * Returns explicit data gap reasons instead of fabricating missing percentiles.
 */
export function calculateGradePlan(items, target) {
  if (!Array.isArray(items) || !items.length || !validGrade(target)) return { status: 'empty' };
  if (items.some(x => !validCredits(x.credits) || (x.fixedGrade != null && !validGrade(x.fixedGrade)))) return { status: 'invalid' };
  const credits = items.reduce((sum, x) => sum + x.credits, 0);
  const withMean = items.filter(x => validGrade(x.average));
  const baselineComplete = withMean.length === items.length;
  const baseline = baselineComplete ? withMean.reduce((sum, x) => sum + x.credits * x.average, 0) / credits : null;
  const fixed = items.filter(x => x.fixedGrade != null);
  const flexible = items.filter(x => x.fixedGrade == null);
  const fixedPoints = fixed.reduce((sum, x) => sum + x.credits * x.fixedGrade, 0);
  const flexibleCredits = flexible.reduce((sum, x) => sum + x.credits, 0);
  const requiredFlexibleAverage = flexibleCredits ? (target * credits - fixedPoints) / flexibleCredits : null;
  const missing = flexible.filter(x => !x.distribution).map(x => x.id);
  const impossible = flexibleCredits ? requiredFlexibleAverage < -1e-8 || requiredFlexibleAverage > 100 + 1e-8 : false;
  const result = {status:'ready', credits, baseline, baselineComplete, baselineCovered:withMean.length,
    fixedCredits:credits-flexibleCredits, target, missing, impossible, requiredFlexibleAverage,
    percentile:null, feasibleCommon:false, achieved:null, rows:[], range:null};

  if (!flexible.length) {
    result.status = 'all-fixed';
    result.achieved = fixedPoints / credits;
  } else if (impossible) {
    result.status = 'impossible';
  } else if (missing.length) {
    result.status = 'missing';
  } else {
    const projected = p => (fixedPoints + flexible.reduce((sum, x) => sum + x.credits * gradeAtPercentile(x.distribution, p), 0)) / credits;
    const lo = projected(0), hi = projected(1);
    result.range = { min:lo, max:hi, q25:projected(0.25), median:projected(0.5), q75:projected(0.75) };
    if (target < lo - 1e-7 || target > hi + 1e-7) {
      result.status = 'outside-common';
    } else {
      let low = 0, high = 1;
      for (let i = 0; i < 54; i++) {
        const mid = (low + high) / 2;
        if (projected(mid) < target) low = mid;
        else high = mid;
      }
      result.percentile = (low + high) / 2 * 100;
      result.feasibleCommon = true;
      result.achieved = projected(result.percentile / 100);
    }
  }
  result.rows = items.map(x => {
    const recommended = x.fixedGrade != null ? x.fixedGrade
      : result.feasibleCommon ? gradeAtPercentile(x.distribution, result.percentile / 100) : null;
    return { id:x.id, grade:recommended, fixed:x.fixedGrade != null,
      credits:x.credits, average:x.average, percentile:recommended == null ? null : percentileForGrade(x.distribution, recommended),
      distribution:x.distribution };
  });
  return result;
}

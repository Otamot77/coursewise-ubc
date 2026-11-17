/** Grade analytics: do not estimate individual grades or suppressed bins. */
const numberOrNull = value => (typeof value === 'number' && Number.isFinite(value) ? value : (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null));
export function normalizeProfile(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const stats = payload.stats && !Array.isArray(payload.stats) ? payload.stats : null;
  if (!stats) return null;
  const years = payload.history?.yearsessions ?? {};
  const history = Object.entries(years)
    .filter(([key, val]) => /^\d{4}[WS]$/.test(key) && numberOrNull(val) !== null && numberOrNull(val) >= 0 && numberOrNull(val) <= 100)
    .map(([yearsession, average]) => ({ yearsession, average: numberOrNull(average) }))
    .sort((a, b) => a.yearsession.localeCompare(b.yearsession));
  const teachingTeam = (Array.isArray(payload.teachingTeam) ? payload.teachingTeam : [])
    .filter(x => typeof x?.name === 'string' && x.name.trim())
    .map(x => ({ name: x.name, yearsessions: x.yearsessions ?? {} }))
    .sort((a, b) => Object.keys(b.yearsessions).length - Object.keys(a.yearsessions).length).slice(0, 10);
  return {
    title: stats.course_title || '',
    average: numberOrNull(stats.average),
    average5: numberOrNull(stats.average_past_5_yrs),
    high: numberOrNull(stats.max_course_avg),
    low: numberOrNull(stats.min_course_avg),
    history, teachingTeam,
    relatedCodes: (Array.isArray(payload.relatedCodes) ? payload.relatedCodes : []).filter(x => /^\d{3}[A-Z]?$/.test(x?.course || '') && /^\d{4}[WS]$/.test(x?.latest || '')),
    recentSections: (Array.isArray(payload.recentSections) ? payload.recentSections : []).filter(x => /^\d{4}[WS]$/.test(x?.yearsession || '') && /^\w{3,4}$/.test(x?.section || '') && numberOrNull(x?.average) !== null).slice(0, 80).map(x => ({ yearsession:x.yearsession, section:x.section, average:numberOrNull(x.average), reported:numberOrNull(x.reported), educators:Array.isArray(x.educators) ? x.educators.filter(n => typeof n === 'string').slice(0,8): [], source:x.source || '' })),
    source: payload.sources ?? {},
    coverage: payload.coverage ?? null,
    fetchedAt: payload.fetchedAt ?? null
  };
}
export const fmtPercent = value => value == null ? '—' : `${value.toFixed(1)}%`;
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

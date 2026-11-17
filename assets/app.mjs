import { parseSchedule, normalizeSavedCourses, courseKey, courseLabel } from '../lib/schedule.mjs';
import { parseWorkdayXlsx } from '../lib/workday-xlsx.mjs';
import { normalizeProfile, fmtPercent, historyRange, recentChange, GRADE_BANDS, GPA_EQUIVALENCIES, gpaEquivalency, aggregateDistributions, validApiPath } from '../lib/grades.mjs';
import { calculateGradePlan, chooseDistribution, DEFAULT_CREDITS, validCredits, validGrade } from '../lib/planner.mjs';
import { compareInstructors, availableInstructorTerms } from '../lib/instructors.mjs';
import { gradeDistributionSvg, historyTrendSvg, compactTrendSvg, instructorDistributionSvg } from '../lib/charts.mjs';

const $ = id => document.getElementById(id);
const UBC_GPA_SOURCE = 'https://www.arts.ubc.ca/degree-planning/academic-performance/promotion-continuation-grading/';
const ROUTES = { '/': 'home', '/my-classes': 'classes', '/explore': 'explore', '/course': 'course', '/gpa': 'gpa', '/data': 'data' };
const page = ROUTES[window.location.pathname.replace(/\/$/, '') || '/'] || 'home';
for (const view of document.querySelectorAll('[data-page]')) view.classList.toggle('is-active', view.dataset.page === page);
for (const nav of document.querySelectorAll('[data-nav]')) {
  const active = nav.dataset.nav === page || (page === 'course' && nav.dataset.nav === 'home');
  nav.classList.toggle('active', active);
  if (active) nav.setAttribute('aria-current', 'page');
}
const courseUrl = c => `/course?${new URLSearchParams({campus:c.campus,subject:c.subject,course:c.course})}`;
const STORAGE_KEY = 'coursewise:schedule:v1';
const PLANNER_STORAGE = 'coursewise:grade-planner:v1';
let plannerSettings = { target: 80, entries: {} };
try {
  const stored = JSON.parse(localStorage.getItem(PLANNER_STORAGE) || '{}');
  if (validGrade(stored.target)) plannerSettings.target = stored.target;
  if (stored.entries && typeof stored.entries === 'object' && !Array.isArray(stored.entries)) plannerSettings.entries = stored.entries;
} catch { /* Storage unavailable or outdated */ }
function savePlanner() {
  const allowed = new Set(courses.map(courseKey));
  for (const key of Object.keys(plannerSettings.entries)) if (!allowed.has(key)) delete plannerSettings.entries[key];
  try { localStorage.setItem(PLANNER_STORAGE, JSON.stringify(plannerSettings)); } catch { /* Storage unavailable */ }
}

const escapeHTML = input => String(input ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let courses = [];
let profiles = new Map();
let errors = new Map();
let loading = new Set();
let selected = new Set();
let expanded = new Set();
let exampleMode = false;

try { courses = normalizeSavedCourses(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { courses = []; }
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(courses)); } catch { /* Storage disabled by browser */ } savePlanner(); }
function message(text, isError = false) { $('importMessage').textContent = text; $('importMessage').classList.toggle('error', isError); }

function addCourses(incoming) {
  const seen = new Map(courses.map(c => [courseKey(c), c]));
  let added = 0;
  for (const item of incoming) {
    const key = courseKey(item);
    if (seen.has(key)) {
      const current = seen.get(key);
      current.sections = [...new Set([...current.sections, ...item.sections])];
    } else if (courses.length < 35) { courses.push(item); seen.set(key, item); added++; }
  }
  save(); render(); refreshAll();
  return added;
}

async function refreshAll() {
  // Three simultaneous remote profile requests at most.
  const missing = courses.filter(c => !profiles.has(courseKey(c)) && !loading.has(courseKey(c)) && !errors.has(courseKey(c)));
  const workers = Array.from({ length: Math.min(3, missing.length) }, async () => {
    while (missing.length) {
      const c = missing.shift();
      if (!c) break;
      const key = courseKey(c); loading.add(key); render();
      try {
        const params = new URLSearchParams({ campus: c.campus, subject: c.subject, course: c.course });
        const response = await fetch(`/api/course?${params}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        profiles.set(key, normalizeProfile(payload));
      } catch (err) { errors.set(key, err?.message || 'Unable to fetch grades'); }
      finally { loading.delete(key); render(); }
    }
  });
  await Promise.all(workers);
}
function getScore(c) { return profiles.get(courseKey(c))?.average5 ?? null; }
function sortedCourses() {
  const items = courses.slice();
  switch ($('sortSelect').value) {
    case 'name': return items.sort((a, b) => courseLabel(a).localeCompare(courseLabel(b)));
    case 'average5': return items.sort((a, b) => (getScore(b) ?? -1) - (getScore(a) ?? -1));
    default: return items;
  }
}
function render() {
  $('courseCount').textContent = courses.length;
  $('plannerJump').hidden = courses.length === 0;
  $('courseEmpty').hidden = courses.length > 0;
  $('insightPanel').hidden = courses.length === 0;
  const count = courses.filter(c => profiles.get(courseKey(c))?.average != null).length;
  const hasScore = courses.map(c => getScore(c)).filter(x => x != null);
  const pending = loading.size;
  $('totalCourses').textContent = courses.length;
  $('coveredCourses').textContent = `${count} / ${courses.length}`;
  // Explicitly unweighted average of course historical means; not an individual's expected GPA.
  $('semesterAverage').textContent = hasScore.length ? fmtPercent(hasScore.reduce((a, b) => a + b, 0) / hasScore.length) : '—';
  $('dataStatus').textContent = courses.length ? `${count} courses with data${pending ? ` · ${pending} loading` : ''}${errors.size ? ` · ${errors.size} unavailable` : ''}` : 'Add courses to see their historical insights.';
  $('courseCards').innerHTML = sortedCourses().map(c => renderCourse(c)).join('');
  $('compareStrip').hidden = selected.size === 0;
  $('compareText').textContent = `${selected.size} selected for comparison (max 4)`;
  if (!$('comparePanel').hidden) renderComparison();
  if (page === 'classes') renderPlanner();
}

const fmtCount = n => n == null ? '—' : n.toLocaleString();
const fmtGpa = percent => {
  const equivalent = gpaEquivalency(percent);
  if (!equivalent || equivalent.gpa === null) return '—';
  return `${equivalent.approximate ? '≈' : ''}${equivalent.gpa.toFixed(2)}`;
};
const distSelections = new Map();
const instructorSelections = new Map();
let detailedCourse = null;
let catalogPage = 1;
let catalogLast = null;
let catalogDelay = null;
let catalogRequest = 0;

function renderHistory(profile) {
  if (!profile?.history?.length) return '<p class="notice-text">No published course-average history.</p>';
  return historyTrendSvg(profile.history, `Course means from ${profile.history[0].yearsession} to ${profile.history.at(-1).yearsession}`);
}

function latestTermSummary(profile) {
  const latest = profile?.history?.at(-1);
  const sessions = profile?.coverage?.sessionDetails || [];
  const recorded = latest ? sessions.find(x => x.yearsession === latest.yearsession) : null;
  return {latest, recorded};
}

function renderCourseOverview(profile) {
  const {latest} = latestTermSummary(profile);
  const historicalCount = profile?.history?.length ?? 0;
  return `<div class="course-overview">
    <section class="course-overview-averages" aria-label="Course average summary">
      <div class="course-overview-eyebrow">COURSE AVERAGES</div>
      <span class="overview-main-label">Recent five-year mean</span>
      <strong class="overview-main-number">${fmtPercent(profile?.average5)}</strong>
      <div class="overview-secondary-row"><span>All-time mean <b>${fmtPercent(profile?.average)}</b></span><span>Latest ${escapeHTML(latest?.yearsession || 'term')} <b>${fmtPercent(latest?.average)}</b></span></div>
      <p class="overview-gpa"><a href="${UBC_GPA_SOURCE}" target="_blank" rel="noopener noreferrer">UBC 4.33 equivalent ↗</a> <strong>${fmtGpa(profile?.average5)}</strong><small>Conversion of the recent mean, not a class GPA</small></p>
    </section>
    <section class="course-overview-trend" aria-label="Historical course averages">
      <div class="overview-trend-heading"><h3>Historical course averages</h3><span>${historicalCount} recorded term${historicalCount===1?'':'s'}${historicalCount>24?' · latest 24 plotted':''}</span></div>
      ${renderHistory(profile)}
      <p class="overview-trend-note">Published mean by academic session · Y-axis adapts to the observed range · Not a grade distribution</p>
    </section>
  </div>`;
}


function renderDistribution(profile, key) {
  const sections = profile?.recentSections ?? [];
  if (!sections.length) return '<p class="notice-text">No section-level grade distributions available from this source. Import the raw PAIR archive to see grade-range counts.</p>';
  const sessions = [...new Set(sections.map(x => x.yearsession))].sort().reverse();
  const defaultSession = sessions.find(session => sections.some(row => row.yearsession === session && GRADE_BANDS.some(b => row.distribution?.[b.key] != null))) || sessions[0];
  const state = distSelections.get(key) || { session: defaultSession, section: 'ALL' };
  if (!sessions.includes(state.session)) { state.session = sessions[0]; state.section = 'ALL'; }
  const sessionSections = sections.filter(x => x.yearsession === state.session).sort((a,b) => a.section.localeCompare(b.section));
  if (state.section !== 'ALL' && !sessionSections.some(x => x.section === state.section)) state.section = 'ALL';
  const chosen = state.section === 'ALL' ? sessionSections : sessionSections.filter(x => x.section === state.section);
  const aggregate = aggregateDistributions(chosen);
  if (!aggregate) return '<p class="notice-text">No grade data for this selection.</p>';
  // These are view-specific values, not global state. Keeping them in this
  // renderer prevents a ReferenceError after the course API request completes.
  const options = sessionSections.map(row => `<option value="${escapeHTML(row.section)}" ${row.section === state.section ? 'selected' : ''}>Section ${escapeHTML(row.section)}</option>`).join('');
  const sizeNote = aggregate.partialSize ? ' · some sizes unavailable' : '';
  const missing = !aggregate.fullyPublished;
  const single = chosen.length === 1 ? chosen[0] : null;
  const bins = gradeDistributionSvg(aggregate.bins,
    `Published grade-range counts for ${state.session}${state.section==='ALL' ? ', all available sections' : `, section ${state.section}`}`);
  const status = Object.entries(aggregate.statuses).filter(([k,v]) => v !== null)
    .map(([k,v]) => `<span class="status-count">${escapeHTML(k)} <strong>${fmtCount(v)}</strong></span>`).join('');
  const source = [...new Set(chosen.map(x => x.source || 'unknown'))].join(' / ');
  const termInfo = profile?.coverage?.sessionDetails?.find(item => item.yearsession === state.session);
  const selectedAverage = single ? single.average : (termInfo?.average ?? null);
  const rate = aggregate.passRate == null ? '—' : `${aggregate.passRate.toFixed(1)}%`;
  const rowTable = `<div class="distribution-table"><table><thead><tr><th>Range</th><th>Letter</th><th>Reported count</th></tr></thead><tbody>${aggregate.bins.map(b => `<tr><td>${escapeHTML(b.range)}</td><td>${escapeHTML(b.label)}</td><td>${b.value == null ? 'Unavailable' : `${b.incomplete ? 'At least ' : ''}${fmtCount(b.value)}`}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="distribution-panel" id="course-distribution" aria-label="Historical grade distribution">
    <div class="distribution-toolbar"><div><h4>Grade distribution</h4><span class="detail-copy">Actual published grade-band counts, not estimated grades</span></div><div class="distribution-filters"><label>Academic session<select data-filter-session="${escapeHTML(key)}">${sessions.map(s => `<option value="${escapeHTML(s)}" ${s===state.session?'selected':''}>${escapeHTML(s)}</option>`).join('')}</select></label><label>Section<select data-filter-section="${escapeHTML(key)}"><option value="ALL" ${state.section === 'ALL' ? 'selected' : ''}>All available sections</option>${options}</select></label></div></div>
    <div class="distribution-key-metrics">
      <div><span>${single ? 'Section average' : 'Published term average'}</span><strong>${fmtPercent(selectedAverage)}</strong></div>
      <div><span>${escapeHTML(aggregate.sizeLabel)}</span><strong>${fmtCount(aggregate.reported)}</strong><small>${aggregate.sections} record${aggregate.sections===1?'':'s'}${sizeNote}</small></div>
      <div><span>Section median</span><strong>${fmtPercent(single?.median)}</strong><small>${single ? 'Published when available' : 'Choose one section for its median'}</small></div>
    </div>
    <div class="distribution-chart-header"><span>Students by grade range</span><span>Published count${aggregate.fullyPublished ? 's' : 's; some withheld'}</span></div>
    ${bins}
    <p class="chart-caption">Percentage ranges (left to right) · Each bar shows the published student count, not a percentage of the class. N/A means unavailable or withheld.</p>
    ${missing ? '<p class="data-warning">Some grade bins are blank or privacy-suppressed. A ≥ count is a lower bound from published sections only; a blank is not zero. We never reconstruct withheld counts.</p>' : `<p class="dist-complete">All eleven grade-band counts are present for the ${chosen.length === 1 ? 'selected section' : 'selected records'}.</p>`}
    <details class="distribution-breakdown"><summary>View exact grade-band counts</summary>${rowTable}</details>
    <section class="section-stats-visible" aria-label="Section statistics">
      <div class="section-stats-title"><h5>More section statistics</h5><span>${single ? `Section ${escapeHTML(single.section)}` : 'All available sections'}</span></div>
      <div class="secondary-stat-grid">
        <div><span>Highest individual mark</span><strong>${fmtPercent(aggregate.high)}</strong></div>
        <div><span>Lowest individual mark</span><strong>${fmtPercent(aggregate.low)}</strong></div>
        <div><span>25th percentile</span><strong>${fmtPercent(single?.p25)}</strong></div>
        <div><span>75th percentile</span><strong>${fmtPercent(single?.p75)}</strong></div>
        <div><span>Standard deviation</span><strong>${single?.stdDev != null ? single.stdDev.toFixed(1) + ' pt' : '—'}</strong></div>
        <div><span>${aggregate.passRateSource === 'grade-bands' ? 'Grades ≥ 50%' : 'Pass rate (graded)'}</span><strong>${rate}</strong><small>${aggregate.passRateSource === 'grade-bands' ? 'From all 11 published grade bands' : aggregate.passRateSource === 'status' ? 'Explicit legacy pass/fail counts' : 'Not available for incomplete bins'}</small></div>
      </div>
      <p class="detail-copy">Quartiles and standard deviation are published for individual sections only. Newer Tableau v2 records include quartiles but not standard deviation. Pass share uses explicit older PAIR totals where available, or the proportion of published grades ≥50% only when all eleven grade bands are complete. A dash means unavailable, not zero.</p>
    </section>
    ${status ? `<div class="status-breakdown">Historical standing counts: ${status}</div>` : ''}
    <p class="detail-copy">Source: ${escapeHTML(source)}. ${aggregate.reported != null ? `Student count: ${escapeHTML(aggregate.sizeLabel.toLowerCase())}. ` : ''}${profile.coverage?.limitedSectionHistory ? 'The local index retains only the 120 newest section records; older semesters may be incomplete. ' : ''}${chosen.length > 1 ? 'Aggregated counts include only the available sections shown for this session; individual section summaries should be used for median and quartiles. ' : ''}Counts cover source grade categories, not a guaranteed current enrollment or an exact GPA distribution.</p>
  </div>`;
}

function renderInstructorComparison(profile, key) {
  if (!profile) return '';
  const terms = availableInstructorTerms(profile);
  if (!terms.length) return `<section class="instructor-panel" id="instructor-comparison"><div class="instructor-head"><h3>Compare recorded instructors</h3><p>No section-level instructor attribution is available from this course's data source. A teaching-team name by itself cannot be used to calculate an instructor average.</p></div></section>`;
  const state = instructorSelections.get(key) || { period:'recent', sort:'sections', query:'', picks:[], showAll:false };
  if (!(state.period === 'all' || state.period === 'recent' || terms.includes(state.period))) state.period='recent';
  const results = compareInstructors(profile, state.period);
  const all = results.instructors;
  const validNames = new Set(all.map(x => x.name));
  state.picks = state.picks.filter(x => validNames.has(x));
  if (!state.initialized) { state.picks=all.slice(0,2).map(x=>x.name); state.initialized=true; }
  instructorSelections.set(key,state);
  const active = state.picks.map(name => all.find(x => x.name === name)).filter(Boolean);
  let filtered = all.filter(x => x.name.toLocaleLowerCase('en-CA').includes(state.query.toLocaleLowerCase('en-CA')));
  if (state.sort === 'mean') filtered.sort((a,b) => (b.average ?? -1) - (a.average ?? -1) || b.graded - a.graded);
  else if (state.sort === 'latest') filtered.sort((a,b) => (b.latest||'').localeCompare(a.latest||'') || b.graded - a.graded);
  else if (state.sort === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name));
  const shown = state.showAll || state.query ? filtered : filtered.slice(0,10);
  const termOpts = terms.map(term=>`<option value="${escapeHTML(term)}" ${state.period===term?'selected':''}>${escapeHTML(term)}</option>`).join('');
  const periodText = state.period==='recent' ? 'Most recent five academic years represented in retained sections' : state.period==='all' ? 'All retained sections' : state.period;
  const table = shown.length ? `<div class="instructor-scroll"><table class="instructor-table"><thead><tr><th>Compare</th><th>Recorded educator</th><th>Graded sections</th><th>Section mean</th><th title="Difference in percentage points between instructor-attributed section means and all course sections from the academic terms taught">vs same-term<br/>sections</th><th>Latest</th><th>Students*</th></tr></thead><tbody>${shown.map(group=>{
    const selected = state.picks.includes(group.name);
    const delta = group.difference==null ? '—' : `${group.difference>0?'+':''}${group.difference.toFixed(1)}%`;
    return `<tr class="${selected?'instructor-selected':''}"><td><input type="checkbox" data-instructor-pick="${escapeHTML(key)}" value="${escapeHTML(group.name)}" aria-label="Compare ${escapeHTML(group.name)}" ${selected?'checked':''} ${!selected && state.picks.length>=3?'disabled title="Maximum three instructors"':''}/></td><td><strong>${escapeHTML(group.name)}</strong>${group.shared?`<small>${group.shared} shared section${group.shared===1?'':'s'}</small>`:''}</td><td>${group.graded} / ${group.sections}${group.graded<2?'<small>Limited sample</small>':''}</td><td><strong>${fmtPercent(group.average)}</strong><small>${group.method.startsWith('student')?'weighted':'unweighted'}</small></td><td class="${group.difference!=null && group.difference>=0?'delta-positive':'delta-negative'}" title="Percentage-point difference from course sections taught in those same academic terms">${delta}</td><td>${escapeHTML(group.latest||'—')}</td><td>${group.students==null?'—':`${group.partialStudents?'≥ ':''}${fmtCount(group.students)}`}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="notice-text">No educator names match that search in the selected period.</p>';
  // Both charts use the same Y-axis maximum so their heights can be compared.
  const maxBar = Math.max(1,...active.flatMap(g=>g.distribution.percentages||[]));
  const comparisons = active.length ? `<div class="instructor-compare-grid">${active.map(group=>{
    const dist=group.distribution;
    const chart=dist.percentages ? instructorDistributionSvg(dist.percentages,dist.counts,{
      scaleMax:maxBar,title:`${group.name} grade distribution, percentage of published student outcomes`
    }) : '<div class="instructor-no-bars">No complete published section-grade distributions for this educator in this period.</div>';
    return `<article class="instructor-compare-card"><div class="instructor-compare-top"><strong>${escapeHTML(group.name)}</strong><span>${group.graded} graded section${group.graded===1?'':'s'}</span></div><div class="instructor-compare-metrics"><div><small>Section mean</small><b>${fmtPercent(group.average)}</b></div><div><small>Mean range</small><b>${fmtPercent(group.low)}–${fmtPercent(group.high)}</b></div></div>${chart}<p class="detail-copy">${dist.percentages?`${fmtCount(dist.total)} published grade outcomes across ${dist.sections} complete section${dist.sections===1?'':'s'}`:`0 complete sections`}; ${group.sections-dist.sections} section${group.sections-dist.sections===1?'':'s'} omitted from the distribution for missing or withheld grade bins. ${group.shared?'Some sections are shared with other listed educators.':''}</p></article>`;
  }).join('')}</div>` : '<p class="notice-text">Choose up to three educators in the table to compare their published grade distributions.</p>';
  const evidence = active.flatMap(group=>group.rows.map(row=>({name:group.name,row}))).slice(0,45);
  const evidenceTable = evidence.length ? `<details class="detail-collapse"><summary>See section-by-section evidence (${evidence.length}${active.reduce((n,g)=>n+g.rows.length,0)>45?'+':''} rows shown)</summary><div class="instructor-scroll"><table class="instructor-table"><thead><tr><th>Educator</th><th>Term</th><th>Section</th><th>Average</th><th>Students</th><th>Attribution</th></tr></thead><tbody>${evidence.map(({name,row})=>`<tr><td>${escapeHTML(name)}</td><td>${escapeHTML(row.yearsession)}</td><td>${escapeHTML(row.section)}</td><td>${fmtPercent(row.average)}</td><td>${fmtCount(row.reported)}</td><td>${row.educators?.length>1?'Shared teaching-team listing':'Sole named educator'}</td></tr>`).join('')}</tbody></table></div></details>`:'';
  return `<section class="instructor-panel" id="instructor-comparison" aria-labelledby="instructor-title"><div class="instructor-head"><div><span class="section-index">INSTRUCTOR INSIGHTS</span><h3 id="instructor-title">Compare recorded instructors</h3><p>Compare historical sections attributed to each named educator, not instructor ratings or forecasts. <strong>${results.instructors.length}</strong> named educators in ${results.sections} retained section records (${results.unassigned} without names).</p></div><span class="soft-pill">HISTORICAL RECORDS</span></div>
    <div class="instructor-controls"><label>Academic period<select data-instructor-period="${escapeHTML(key)}"><option value="recent" ${state.period==='recent'?'selected':''}>Recent five years</option><option value="all" ${state.period==='all'?'selected':''}>All retained years</option>${termOpts}</select></label><label>Search educators<input type="search" data-instructor-query="${escapeHTML(key)}" placeholder="Type an instructor name…" value="${escapeHTML(state.query)}"/></label><label>Sort educators<select data-instructor-sort="${escapeHTML(key)}"><option value="sections" ${state.sort==='sections'?'selected':''}>Most graded sections</option><option value="mean" ${state.sort==='mean'?'selected':''}>Highest section mean</option><option value="latest" ${state.sort==='latest'?'selected':''}>Most recent section</option><option value="name" ${state.sort==='name'?'selected':''}>Name A–Z</option></select></label></div>
    <p class="instructor-caption">${escapeHTML(periodText)} · Tick up to three educators. A section with multiple named educators contributes to each name; comparisons are not independent for shared classes. Higher averages do not demonstrate that an educator causes higher grades.</p>
    ${table}
    ${!state.query && filtered.length>10?`<button class="instructor-more" data-instructor-more="${escapeHTML(key)}">${state.showAll?'Show fewer':'Show all '+filtered.length+' educators'}</button>`:''}
    <div class="instructor-charts-title"><h4>Side-by-side distributions</h4><span>${active.length} of 3 selected · percentages, not raw counts</span></div>${comparisons}${evidenceTable}
    <p class="instructor-disclaimer">* “Students” is a sum of source Enrolled/Reported counts attached to graded sections, not a count of unique students. Grade distribution comparisons use only fully published bins and share a common vertical scale. Section averages are student-weighted only when all contributing section sizes are published; otherwise they are unweighted. The same-term comparison is a percentage-point difference between recorded section means, not a relative percent change or an instructor effect. ${results.truncated?'This index retains only the 120 newest sections for high-volume courses; older instructor histories are incomplete. ':''}Names can include teaching assistants or other instructional staff in older source files. Missing sections, naming variants, and section structure limit comparability.</p>
  </section>`;
}

function renderCourse(c, standalone = false) {
  const key=courseKey(c), profile=profiles.get(key), pending=loading.has(key), error=errors.get(key);
  const status=error ? `<span class="status-dot amber"></span><span title="${escapeHTML(error)}">Historical source unavailable</span>`
    : pending ? '<span class="status-dot gray"></span>Loading grade history…'
    : profile?.average != null ? '<span class="status-dot"></span>Published historical records'
    : profile ? '<span class="status-dot amber"></span>Average not published for this code' : '<span class="status-dot gray"></span>Awaiting data';
  const latest=profile?.coverage?.latestPublished;
  const newerVariants=(profile?.relatedCodes??[]).filter(v=>latest && v.latest>latest);
  const coverageHint=latest ? `<span class="last-coverage"> · through ${escapeHTML(latest)}${newerVariants.length ? ` · newer ${escapeHTML(newerVariants.map(x=>x.course).join('/'))} codes` : ''}</span>` : '';
  const section=c.sections.length ? ` · Section${c.sections.length>1?'s':''} ${escapeHTML(c.sections.join(', '))}` : '';
  const { latest: last, recorded }=latestTermSummary(profile);

  if (!standalone) {
    const recentSections=profile?.recentSections ?? [];
    const lastSections=last ? recentSections.filter(r=>r.yearsession===last.yearsession && r.section!=='OVERALL') : [];
    const availableSections=lastSections.length ? lastSections : last ? recentSections.filter(r=>r.yearsession===last.yearsession) : [];
    const dist=availableSections.length ? aggregateDistributions(availableSections) : null;
    const mostCommon=(dist?.fullyPublished && dist.publishedCount>0)
      ? dist.bins.reduce((best,bin)=>!best||bin.value>best.value?bin:best,null) : null;
    return `<article class="lineup-course" data-key="${escapeHTML(key)}">
      <div class="lineup-heading"><div class="course-logo">${escapeHTML(c.subject)}</div><div class="course-title-block"><strong>${escapeHTML(courseLabel(c))}</strong><small>${escapeHTML(profile?.title||'Historical course overview')}${section}</small></div><button class="remove-course" data-remove="${escapeHTML(key)}" type="button" aria-label="Remove ${escapeHTML(courseLabel(c))}">✕</button></div>
      <div class="lineup-highlights">
        <div class="lineup-highlight-primary"><span>Recent 5-year mean</span><strong>${pending?'···':fmtPercent(profile?.average5)}</strong></div>
        <div><span>Latest term${last?` · ${escapeHTML(last.yearsession)}`:''}</span><strong>${fmtPercent(last?.average)}</strong></div>
        <div><span>All-time mean</span><strong>${fmtPercent(profile?.average)}</strong></div>
        <div class="lineup-graph"><span>Historical trend</span>${compactTrendSvg(profile?.history)}<small>${escapeHTML(profile?.history?.length||0)} published terms</small></div>
      </div>
      <div class="lineup-detail-strip"><span>${recorded?.reported != null ? `${fmtCount(recorded.reported)} reported/enrolled students in latest term` : 'Latest term class size unavailable'}</span><span>${mostCommon ? `Most common published band: ${escapeHTML(mostCommon.key)} (${fmtCount(mostCommon.value)})` : 'Grade-band summary unavailable or partly withheld'}</span></div>
      <div class="lineup-footer"><div>${status}${coverageHint}</div><div class="lineup-actions"><label class="compare-label"><input type="checkbox" data-select="${escapeHTML(key)}" ${selected.has(key)?'checked':''} aria-label="Compare ${escapeHTML(courseLabel(c))}"/> Compare</label><a class="detail-toggle" href="${escapeHTML(courseUrl(c))}">Full report →</a></div></div>
    </article>`;
  }

  const teaching=profile?.teachingTeam?.length ? profile.teachingTeam.slice(0,8).map(p=>`<span class="educator-chip">${escapeHTML(p.name)}</span>`).join('') : '<span class="notice-text">No teaching team listed.</span>';
  const related=profile?.relatedCodes?.length ? `<div class="detail-heading">Related course codes</div><div class="variant-strip">${profile.relatedCodes.map(x=>`<button type="button" class="variant-code" data-related="${escapeHTML(c.subject+' '+x.course)}">${escapeHTML(c.subject+' '+x.course)} · through ${escapeHTML(x.latest)}</button>`).join('')}</div><p class="detail-copy">Suffix course codes are distinct registrations.</p>` : '';
  const sections=(profile?.recentSections ?? []).slice().sort((a,b)=>b.yearsession.localeCompare(a.yearsession)||a.section.localeCompare(b.section)).slice(0,20);
  const sectionTable=sections.length ? `<div class="section-evidence"><table><thead><tr><th>Session</th><th>Section</th><th>Mean</th><th>Students</th><th>High / low</th><th>Educator(s)</th></tr></thead><tbody>${sections.map(x=>`<tr><td>${escapeHTML(x.yearsession)}</td><td>${escapeHTML(x.section)}</td><td>${fmtPercent(x.average)}</td><td>${fmtCount(x.reported)}</td><td>${fmtPercent(x.high)} / ${fmtPercent(x.low)}</td><td>${escapeHTML(x.educators.join('; ')||'Not listed')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="notice-text">No historical section records available.</p>';
  const partial=profile?.coverage?.partialYearsessions??0;
  const warnings=partial ? `<div class="data-warning">${partial} recorded term${partial===1?'':'s'} contain unpublished section averages; term means use only available entries.</div>` : '';
  const details=`<div class="course-detail">
    ${renderDistribution(profile,key)}
    <section class="historical-stat-summary" id="more-historical-stats" aria-label="Historical highs and lows"><div class="section-stats-title"><h4>Historical highs and lows</h4><span>Across published course records</span></div><div class="secondary-stat-grid"><div><span>Highest course-term mean</span><strong>${fmtPercent(profile?.high)}</strong></div><div><span>Lowest course-term mean</span><strong>${fmtPercent(profile?.low)}</strong></div><div><span>Highest individual mark</span><strong>${fmtPercent(profile?.highMark)}</strong></div><div><span>Lowest individual mark</span><strong>${fmtPercent(profile?.lowMark)}</strong></div></div></section>
    ${renderInstructorComparison(profile,key)}
    ${warnings}${related}
    <details class="detail-collapse"><summary>Historical sections (up to 20 shown)</summary>${sectionTable}<p class="detail-copy">Historical section identifiers and teaching assignments may differ today.</p></details>
    <details class="detail-collapse"><summary>Recorded teaching team</summary><div class="educator-list">${teaching}</div></details>
    <p class="detail-copy">Data source: ${escapeHTML(profile?.source?.stats||'unavailable')}. ${profile?.coverage?.yearsessions??0} terms with published averages. Suppressed grade bins are never estimated. <a href="${UBC_GPA_SOURCE}" target="_blank" rel="noopener noreferrer">UBC 4.33 conversion source ↗</a>.</p>
  </div>`;
  return `<article class="course-item standalone-course" data-key="${escapeHTML(key)}">
    <div class="course-head"><div class="course-logo">${escapeHTML(c.subject)}</div><div class="course-title-block"><strong>${escapeHTML(courseLabel(c))}</strong><small>${escapeHTML(profile?.title||'Historical course overview')}${section}</small></div><button class="outline-btn add-explored" type="button" data-add-explored="${escapeHTML(key)}">Save to My Classes +</button></div>
    <div class="course-data-availability">${status}${coverageHint}</div>
    ${renderCourseOverview(profile)}
    ${profile?.recentSections?.length ? '<nav class="course-quicklinks" aria-label="Course report sections"><a href="#course-distribution">Grade distribution ↓</a><a href="#instructor-comparison">Compare instructors ↓</a></nav>' : ''}
    ${details}
  </article>`;
}

function renderComparison() {
  const subset = courses.filter(c => selected.has(courseKey(c)));
  if (!subset.length) { $('comparePanel').hidden = true; return; }
  const label = (value, prop) => prop ? fmtPercent(value?.[prop]) : value;
  const rows = [
    ['5-year average', c => fmtPercent(profiles.get(courseKey(c))?.average5)],
    ['All-time average', c => fmtPercent(profiles.get(courseKey(c))?.average)],
    ['History range', c => historyRange(profiles.get(courseKey(c))?.history ?? [])],
    ['Teaching team entries', c => profiles.get(courseKey(c))?.teachingTeam?.length ?? '—'],
    ['Coverage', c => errors.has(courseKey(c)) ? 'Source unavailable' : profiles.get(courseKey(c)) ? 'Found' : 'No statistics']
  ];
  $('comparisonTable').innerHTML = `<table class="comparison-table"><thead><tr><th>Metric</th>${subset.map(c => `<th>${escapeHTML(courseLabel(c))}</th>`).join('')}</tr></thead><tbody>${rows.map(([title, get]) => `<tr><td>${title}</td>${subset.map(c => `<td>${escapeHTML(get(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

$('importButton').addEventListener('click', () => {
  const parsed = parseSchedule($('scheduleInput').value, $('campusSelect').value);
  if (!parsed.length) { message('No course codes found. Try a list like “CPEN_V 221” or “MATH 100”.', true); return; }
  const added = addCourses(parsed);
  $('scheduleInput').value = ''; // Discard potentially private raw Workday text after parsing.
  message(`Found ${parsed.length} courses · ${added} new. Only course codes are kept locally.`);
});
$('scheduleFile').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';
  $('fileName').textContent = file.name;
  try {
    if (/\.xlsx$/i.test(file.name)) {
      // Parse locally: never upload a Workday spreadsheet or retain personal columns.
      const parsed = await parseWorkdayXlsx(file, $('campusSelect').value);
      if (!parsed.length) {
        message('No UBC course codes were found in this Excel export. Confirm it includes course identifiers such as CPSC_V 110 or MATH 100, or paste the course list instead.', true);
        return;
      }
      const display = parsed.flatMap(c => c.sections.length
        ? c.sections.map(section => `${c.subject}_${c.campus === 'UBCO' ? 'O' : 'V'} ${c.course} - ${section}`)
        : [`${c.subject}_${c.campus === 'UBCO' ? 'O' : 'V'} ${c.course}`]);
      $('scheduleInput').value = display.join('\n');
      message(`Found ${parsed.length} course${parsed.length === 1 ? '' : 's'} in your Excel workbook. Review the codes above, then click “Find my courses”. Only course codes and sections were extracted.`);
      return;
    }
    if (!/\.(txt|csv|ics|html?)$/i.test(file.name)) throw new Error('Please choose a .xlsx, .txt, .csv, .ics or .html file.');
    if (file.size > 100_000) throw new Error('Text exports must be under 100 KB.');
    $('scheduleInput').value = await file.text();
    message('File read locally. Select “Find my courses” to import.');
  } catch (error) {
    $('scheduleInput').value = '';
    message(error?.message || 'Could not read this Excel export. Please try again or paste the courses.', true);
  }
});
$('manualForm').addEventListener('submit', e => {
  e.preventDefault();
  const parsed = parseSchedule($('manualCode').value, $('campusSelect').value);
  if (!parsed.length) { message('Enter a course code such as CPEN 221.', true); return; }
  addCourses(parsed); $('manualCode').value = ''; message('Course added.');
});
$('clearButton').addEventListener('click', () => {
  courses = []; selected.clear(); expanded.clear(); profiles.clear(); errors.clear(); exampleMode = false; save(); render(); message('Local lineup cleared.');
});
$('exampleButton').addEventListener('click', () => {
  exampleMode = true;
  addCourses(parseSchedule('CPSC_V 110\nMATH_V 100\nCPEN_V 221\nCHEM_V 121', 'UBCV'));
  message('Example course codes added. All grade metrics are fetched live; none are sample numbers.');
});
$('sortSelect').addEventListener('change', render);
$('courseCards').addEventListener('click', e => {
  const remove = e.target.closest('[data-remove]')?.dataset.remove;
  if (remove) { courses = courses.filter(c => courseKey(c) !== remove); selected.delete(remove); expanded.delete(remove); profiles.delete(remove); errors.delete(remove); save(); render(); return; }
  const related = e.target.closest('[data-related]')?.dataset.related;
  if (related) { addCourses(parseSchedule(related, $('campusSelect').value)); message(`${related} added from related historical codes.`); return; }
  const expand = e.target.closest('[data-expand]')?.dataset.expand;
  if (expand) { expanded.has(expand) ? expanded.delete(expand) : expanded.add(expand); render(); }
});
$('courseCards').addEventListener('change', e => {
  const key = e.target.dataset.select;
  if (!key) return;
  if (e.target.checked && selected.size < 4) selected.add(key);
  else if (!e.target.checked) selected.delete(key);
  else { message('Select up to four courses to compare.', true); }
  render();
});
$('resetCompare').addEventListener('click', () => { selected.clear(); $('comparePanel').hidden = true; render(); });
$('showCompare').addEventListener('click', () => { $('comparePanel').hidden = false; renderComparison(); $('comparePanel').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('closeCompare').addEventListener('click', () => { $('comparePanel').hidden = true; });
// The initial render is delayed until all helper functions and const bindings
// have initialized. My Classes may already contain saved courses; rendering
// the planner here previously threw a temporal-dead-zone ReferenceError.

// Local dataset transparency: prefer the newest source per year-session. Never
// treat a missing source year as proof a course did not run that year.
let coverage = null;
function renderCoverage() {
  if (!coverage) return;
  const campus = $('coverageCampus').value;
  const ranked = { 'pair-reports':1, 'tableau-dashboard':2, 'tableau-dashboard-v2':3 };
  const bySession = new Map();
  for (const r of coverage.sessions) {
    if (r.campus !== campus) continue;
    if (!bySession.has(r.yearsession) || ranked[r.source] > ranked[bySession.get(r.yearsession).source]) bySession.set(r.yearsession, r);
  }
  const all = [...bySession.values()].sort((a,b)=>b.yearsession.localeCompare(a.yearsession));
  const visible = all.slice(0, 14);
  const latest = all[0];
  const meta = coverage.metadata || {};
  $('coverageSummary').textContent = `${Number(meta.indexedCourses ?? 0).toLocaleString()} catalogued course codes across both campuses · ${Number(meta.rowsWithPublishedAverage ?? 0).toLocaleString()} raw records with averages · ${campus === 'UBCV' ? 'Vancouver' : 'Okanagan'}: ${all.length} recorded sessions (${all.at(-1)?.yearsession || '—'}–${latest?.yearsession || '—'})`;
  $('coverageTable').innerHTML = `<table class="coverage-table"><thead><tr><th>Academic session</th><th>Source vintage</th><th>Course codes</th><th>Published averages / rows</th><th>Coverage of row averages</th></tr></thead><tbody>${visible.map(r => { const pct = r.rows ? r.publishedAverages/r.rows*100 : 0; return `<tr><td><strong>${escapeHTML(r.yearsession)}</strong></td><td>${escapeHTML(r.source.replace('tableau-dashboard-v2','Tableau v2').replace('tableau-dashboard','Tableau v1').replace('pair-reports','PAIR'))}</td><td>${r.courses.toLocaleString()}</td><td>${r.publishedAverages.toLocaleString()} / ${r.rows.toLocaleString()}</td><td><div class="coverage-bar" aria-label="${pct.toFixed(1)} percent of source rows have published averages"><span style="width:${pct.toFixed(1)}%"></span></div><small>${pct.toFixed(1)}%</small></td></tr>`; }).join('')}</tbody></table>`;
}
$('coverageCampus').addEventListener('change',renderCoverage);
if (page === 'data') fetch('/api/coverage').then(async r => { if(!r.ok) throw new Error('No local dataset has been imported.'); return r.json(); }).then(data=>{coverage=data;renderCoverage();}).catch(err=>{ $('coverageSummary').textContent = `${err.message} Import the raw ZIP to see data coverage.`; });

// The catalog is a real search over the locally indexed archive (not a four-tile shortlist).
async function fetchDedicated(c) {
  const key = courseKey(c);
  if (profiles.has(key) || loading.has(key)) return;
  loading.add(key);
  renderDedicated();
  try {
    const query = new URLSearchParams({ campus: c.campus, subject: c.subject, course: c.course });
    const response = await fetch(`/api/course?${query}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    profiles.set(key, normalizeProfile(body));
    errors.delete(key);
  } catch (err) { errors.set(key, err.message); }
  finally { loading.delete(key); renderDedicated(); }
}
function renderDedicated() {
  if (page !== 'course' || !detailedCourse) return;
  const key = courseKey(detailedCourse), error = errors.get(key);
  $('courseViewStatus').hidden = !loading.has(key) && !error;
  $('courseViewStatus').textContent = error ? `Could not load historical data: ${error}` : 'Loading historical grades…';
  $('courseView').innerHTML = renderCourse(detailedCourse, true);
  document.title = `${courseLabel(detailedCourse)} · Coursewise`;
}
async function browseCatalog() {
  const request = ++catalogRequest;
  const params = new URLSearchParams({ campus:$('browseCampus').value, subjectPrefix:$('browseSubject').value.trim().toUpperCase(), level:$('browseLevel').value, q:$('browseSearch').value.trim(), sort:$('browseSort').value, page:String(catalogPage) });
  $('catalogStatus').textContent = 'Searching courses…';
  try {
    const response = await fetch(`/api/catalog?${params}`);
    const data = await response.json();
    if (request !== catalogRequest) return;
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    catalogLast = data;
    $('browseSubjectOptions').innerHTML = data.subjects.map(s => `<option value="${escapeHTML(s)}"></option>`).join('');
    $('catalogStatus').textContent = `${data.total.toLocaleString()} matching course codes · ${data.page} / ${Math.max(1,Math.ceil(data.total/data.perPage))} pages`;
    $('catalogResults').innerHTML = data.results.length ? data.results.map(x => `<a href="${escapeHTML(courseUrl(x))}" class="catalog-card"><span class="catalog-card-top"><strong>${escapeHTML(x.subject)} ${escapeHTML(x.course)}</strong><span>${x.average==null?'No published mean':fmtPercent(x.average)}</span></span><span class="catalog-course-name">${escapeHTML(x.title||'Course title unavailable')}</span><span class="catalog-meta">Latest record: ${escapeHTML(x.latest||'—')} · ${x.sessions} recorded terms</span></a>`).join('') : '<div class="catalog-empty">No matching course in the local index. Try a different course code or campus.</div>';
    $('catalogPrev').disabled = data.page <= 1;
    $('catalogNext').disabled = data.page * data.perPage >= data.total;
  } catch(err) {
    if (request !== catalogRequest) return;
    $('catalogStatus').textContent = err.message;
    $('catalogResults').innerHTML = '<p class="notice-text">Import the raw dataset to browse the catalog, or search an individual course from the homepage.</p>';
    $('catalogPrev').disabled = $('catalogNext').disabled = true;
  }
}
function queueCatalog() { catalogPage=1; clearTimeout(catalogDelay); catalogDelay=setTimeout(browseCatalog, 180); }
$('browseSearch').addEventListener('input',queueCatalog);
$('browseCampus').addEventListener('change',()=>{ $('browseSubject').value=''; queueCatalog(); });
$('browseSubject').addEventListener('input',queueCatalog);
$('browseLevel').addEventListener('change',queueCatalog);
$('browseSort').addEventListener('change',queueCatalog);
$('catalogPrev').addEventListener('click',()=>{ if(catalogPage>1){catalogPage--;browseCatalog();} });
$('catalogNext').addEventListener('click',()=>{ if(catalogLast && catalogPage*catalogLast.perPage<catalogLast.total){catalogPage++;browseCatalog();} });
function changeDistributionFilter(event) {
  const target = event.target;
  const key = target.dataset.filterSession || target.dataset.filterSection;
  if (!key) return false;
  const current=distSelections.get(key)||{session:'',section:'ALL'};
  if(target.dataset.filterSession) {current.session=target.value;current.section='ALL';}
  else current.section=target.value;
  distSelections.set(key,current);
  if (page === 'course') renderDedicated(); else render();
  return true;
}
$('courseCards').addEventListener('change',changeDistributionFilter);
$('courseView').addEventListener('change',changeDistributionFilter);
function updateInstructorPanel(event) {
  const input = event.target;
  const key = input.dataset.instructorPeriod || input.dataset.instructorSort || input.dataset.instructorQuery || input.dataset.instructorPick;
  if (!key || !detailedCourse || courseKey(detailedCourse) !== key) return false;
  const state = instructorSelections.get(key);
  if (!state) return false;
  if (input.dataset.instructorPeriod) { state.period=input.value; state.initialized=false; state.query=''; }
  if (input.dataset.instructorSort) state.sort=input.value;
  if (input.dataset.instructorQuery) state.query=input.value.slice(0,100);
  if (input.dataset.instructorPick) {
    if (input.checked && state.picks.length < 3 && !state.picks.includes(input.value)) state.picks.push(input.value);
    else if (!input.checked) state.picks=state.picks.filter(p=>p!==input.value);
  }
  const current = $('courseView').querySelector('#instructor-comparison');
  if (!current) return true;
  const profile=profiles.get(key);
  current.outerHTML=renderInstructorComparison(profile,key);
  if (input.dataset.instructorQuery) {
    const field=$('courseView').querySelector('[data-instructor-query]');
    field?.focus();field?.setSelectionRange(state.query.length,state.query.length);
  }
  return true;
}
$('courseView').addEventListener('input',e=>{ if(e.target.dataset.instructorQuery)updateInstructorPanel(e); });
$('courseView').addEventListener('change',e=>{
  if(e.target.dataset.instructorPeriod || e.target.dataset.instructorSort || e.target.dataset.instructorPick)updateInstructorPanel(e);
});
$('courseView').addEventListener('click',e=>{
  const more = e.target.closest('[data-instructor-more]')?.dataset.instructorMore;
  if (more && detailedCourse && more === courseKey(detailedCourse)) {
    const state=instructorSelections.get(more);if(state){state.showAll=!state.showAll;const current=$('courseView').querySelector('#instructor-comparison');if(current)current.outerHTML=renderInstructorComparison(profiles.get(more),more);}return;
  }
  const add=e.target.closest('[data-add-explored]')?.dataset.addExplored;
  if(add && detailedCourse) {
    const added=addCourses([structuredClone(detailedCourse)]);
    $('courseSaveMessage').textContent=added?'Saved to My Classes on this device.':'Already in My Classes on this device.';
    return;
  }
  const related=e.target.closest('[data-related]')?.dataset.related;
  if(related){const parsed=parseSchedule(related,detailedCourse?.campus||'UBCV');if(parsed.length)window.location.assign(courseUrl(parsed[0]));}
});
const gpaBands=$('letterGradeTable');
gpaBands.innerHTML=GRADE_BANDS.slice().reverse().map(b=>`<tr><td>${escapeHTML(b.label)}</td><td>${escapeHTML(b.range)}</td></tr>`).join('');
$('gpaLookup').innerHTML=[...Array(41)].map((_,i)=>{
  const percent=90-i, equiv=gpaEquivalency(percent);
  return `<tr><td>${percent===90?'90–100':percent}%</td><td>${equiv.gpa.toFixed(2)}</td><td>${escapeHTML(equiv.letter)}</td></tr>`;
}).join('')+ '<tr><td>0–49%</td><td>Not specified in UBC table</td><td>F</td></tr>';

if (page === 'explore') {
  const prefilled = new URLSearchParams(location.search).get('q');
  if (prefilled) $('browseSearch').value = prefilled.slice(0, 80);
  browseCatalog();
}
if (page === 'course') {
  const query = new URLSearchParams(location.search);
  const campus = query.get('campus') || 'UBCV';
  const subject = (query.get('subject') || '').toUpperCase();
  const course = (query.get('course') || '').toUpperCase();
  if (validApiPath(campus, subject, course)) {
    detailedCourse = {campus, subject, course, sections:[]};
    renderDedicated(); fetchDedicated(detailedCourse);
  } else {
    $('courseViewStatus').textContent = 'Invalid or missing course code. Search a course to view its report.';
  }
}
$('homeForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('homeCode').value.trim();
  const campus = $('homeCampus').value;
  const parsed = parseSchedule(text, campus);
  if (parsed.length === 1 && validApiPath(parsed[0].campus,parsed[0].subject,parsed[0].course)) {
    window.location.assign(courseUrl(parsed[0]));
  } else if (text) {
    window.location.assign(`/explore?${new URLSearchParams({q:text})}`);
  } else $('homeMessage').textContent='Enter a course code, such as CPSC 110.';
});

// Grade Goal Planner: only public course/section distributions are requested
// from the API. User-defined credits and planned grades stay in localStorage.
function plannerEntry(key) {
  const value = plannerSettings.entries[key] || {};
  return {
    credits: validCredits(value.credits) ? value.credits : DEFAULT_CREDITS,
    fixedGrade: validGrade(value.fixedGrade) ? value.fixedGrade : null,
    completed: value.completed === true && validGrade(value.fixedGrade)
  };
}
function updatePlanner(key, patch) {
  plannerSettings.entries[key] = { ...plannerEntry(key), ...patch };
  savePlanner(); renderPlanner();
}
function planModels() {
  return courses.map(c => {
    const id = courseKey(c), profile = profiles.get(id), options = plannerEntry(id);
    return {
      id, label: courseLabel(c), credits: options.credits, fixedGrade: options.fixedGrade,
      completed: options.completed, average: profile?.average5 ?? profile?.average ?? null,
      distribution: chooseDistribution(profile),
      dataPending: loading.has(id) || (!profile && !errors.has(id)),
      dataError: errors.get(id) || null
    };
  });
}
const fmtPlanner = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
const fmtStanding = value => Number.isFinite(value) ? `~${Math.round(value)}th` : '—';
function renderPlanner() {
  if (page !== 'classes') return;
  const panel = $('gradePlanner');
  panel.hidden = courses.length === 0;
  if (!courses.length) return;
  const target = validGrade(plannerSettings.target) ? plannerSettings.target : 80;
  $('plannerTarget').value = String(target);
  const models = planModels();
  const plan = calculateGradePlan(models, target);
  $('plannerBaseline').textContent = fmtPlanner(plan.baseline);
  $('plannerBaselineNote').textContent = plan.baselineComplete
    ? 'Recent 5-year course means where available; otherwise all-time means'
    : `Only ${plan.baselineCovered} of ${models.length} courses have published means`;
  $('plannerPercentile').textContent = plan.feasibleCommon ? fmtStanding(plan.percentile) : '—';
  $('plannerAchieved').textContent = fmtPlanner(plan.achieved);
  const delta = plan.achieved == null ? null : plan.achieved - target;
  $('plannerGap').textContent = delta == null ? 'Fix missing-data course grades to complete your scenario'
    : Math.abs(delta) < 0.05 ? 'Meets the target (approximate)' : `${Math.abs(delta).toFixed(1)} percentage points ${delta > 0 ? 'above' : 'below'} target`;
  const messages = [];
  if (models.some(x => x.dataPending)) messages.push('Historical records are still loading. Percentile results will appear when available.');
  if (plan.status === 'missing') messages.push(`No defensible common-percentile estimate: ${plan.missing.length} unplanned course(s) lack a complete published grade distribution. Set an assumed grade for those courses to see a partial historical benchmark for the rest.`);
  if (plan.status === 'impossible') messages.push('With your fixed grades, the target is mathematically impossible: unlocked courses would need a weighted average outside 0–100%.');
  if (plan.status === 'outside-common') messages.push('A common percentile across every unlocked course cannot reach this target from the published bins. You can still explore different grades by fixing individual courses.');
  if (plan.status === 'all-fixed') messages.push('All courses have fixed grades. This displays your calculated semester average; no percentile benchmark is inferred for the whole semester.');
  if (plan.feasibleCommon) messages.push(`Estimated common standing: about the ${Math.round(plan.percentile)}th percentile in each unlocked course. This is NOT your percentile among all students’ combined semester averages, nor a probability of success.`);
  if (models.some(x => x.distribution?.yearLag >= 5)) messages.push('Some available grade distributions are five or more academic years old.');
  if (!plan.baselineComplete) messages.push('The historical baseline is unavailable because at least one course lacks a published average.');
  $('plannerAlert').textContent = messages.join(' ');
  $('plannerAlert').classList.toggle('planner-alert-warning', ['missing','impossible','outside-common'].includes(plan.status));
  const range = $('plannerRange');
  range.hidden = !plan.range;
  if (plan.range) {
    range.innerHTML = `<span>Estimated overall at the same standing across unlocked courses:</span><div><span>25th <b>${fmtPlanner(plan.range.q25)}</b></span><span>50th <b>${fmtPlanner(plan.range.median)}</b></span><span>75th <b>${fmtPlanner(plan.range.q75)}</b></span></div>`;
  }
  const requirement = $('plannerRequirement');
  requirement.textContent = plan.requiredFlexibleAverage == null
    ? `All ${plan.credits} credits fixed. Planned weighted average: ${fmtPlanner(plan.achieved)}.`
    : `To reach ${fmtPlanner(target)}, you need ${fmtPlanner(plan.requiredFlexibleAverage)} on average across your remaining ${models.filter(m => m.fixedGrade == null).length} unlocked courses (${models.filter(m => m.fixedGrade == null).reduce((s,x)=>s+x.credits,0)} credits). This is exact grade arithmetic; the percentile suggestions are estimates.`;
  $('plannerRows').innerHTML = models.map(model => {
    const row = plan.rows.find(r => r.id === model.id);
    const manual = row.fixed;
    const options = plannerEntry(model.id);
    const displayGrade = row.grade;
    const sliderValue = displayGrade ?? model.average ?? 75;
    const status = model.distribution
      ? `${escapeHTML(model.distribution.session)} · ${model.distribution.n.toLocaleString()} published grades`
      : model.dataPending ? 'Historical data loading…' : model.dataError ? 'Grade data unavailable' : 'No complete published grade bands';
    const standing = row.percentile == null ? 'Standing unavailable' : `~${Math.round(row.percentile)}th percentile`;
    return `<div class="planner-course-row" data-planner-row="${escapeHTML(model.id)}">
    <div class="planner-course-head"><div><a href="${escapeHTML(courseUrl(courses.find(c=>courseKey(c)===model.id)))}" class="planner-course-name">${escapeHTML(model.label)}</a><span class="planner-course-data">${status}</span></div><span class="planner-course-mean">Historical mean: ${fmtPlanner(model.average)}</span></div>
    <div class="planner-course-controls">
    <label class="planner-credits" title="Use the actual credits in Workday. Some UBC courses are worth 1.5 credits.">Credits<input type="number" data-planner-credits="${escapeHTML(model.id)}" aria-label="Credits for ${escapeHTML(model.label)}" min="0.5" max="18" step="0.5" value="${options.credits}"/></label>
    <div class="planner-grade-control"><div class="planner-grade-top"><label for="planner-grade-${escapeHTML(model.id)}">${options.completed ? 'Final grade' : manual ? 'Fixed grade target' : 'Suggested grade'}</label><strong data-planner-display="${escapeHTML(model.id)}">${displayGrade == null ? 'Set a grade' : fmtPlanner(displayGrade)}</strong></div><input id="planner-grade-${escapeHTML(model.id)}" type="range" min="0" max="100" step="0.5" value="${sliderValue}" data-planner-slider="${escapeHTML(model.id)}" aria-label="Planned percentage for ${escapeHTML(model.label)}"/><span class="planner-grade-foot">${standing}${!manual && displayGrade != null ? ' · Auto suggestion' : manual ? ' · Fixed' : ''}</span></div>
    <label class="planner-manual-grade">Grade %<input type="number" data-planner-number="${escapeHTML(model.id)}" aria-label="Enter grade percentage for ${escapeHTML(model.label)}" min="0" max="100" step="0.1" value="${manual ? options.fixedGrade : displayGrade == null ? '' : displayGrade.toFixed(1)}" placeholder="—"/></label>
    <label class="planner-completed"><input type="checkbox" data-planner-complete="${escapeHTML(model.id)}" ${options.completed?'checked':''}/> Completed</label>
    <button class="text-button planner-release" data-planner-auto="${escapeHTML(model.id)}" type="button" ${!manual?'disabled':''}>Auto ↺</button>
    </div></div>`;
  }).join('');
}
$('plannerTarget').addEventListener('change', e => {
  const value = Number(e.target.value);
  if (!validGrade(value)) { e.target.value = String(plannerSettings.target); return; }
  // A second change/blur event can follow a value commit; don't rebuild inputs
  // and steal focus when the user moves straight to a course grade.
  if (value === plannerSettings.target) return;
  plannerSettings.target = value;
  savePlanner(); renderPlanner();
});
$('plannerRows').addEventListener('input', e => {
  const key = e.target.dataset.plannerSlider;
  if (!key) return;
  const output = $('plannerRows').querySelectorAll('[data-planner-display]');
  for (const label of output) if (label.dataset.plannerDisplay === key) label.textContent = `${Number(e.target.value).toFixed(1)}%`;
});
$('plannerRows').addEventListener('change', e => {
  const el = e.target;
  const key = el.dataset.plannerCredits || el.dataset.plannerSlider || el.dataset.plannerNumber || el.dataset.plannerComplete;
  if (!key) return;
  const current = plannerEntry(key);
  if (el.dataset.plannerCredits) {
    const credits = Number(el.value);
    if (validCredits(credits)) updatePlanner(key, {credits});
    else renderPlanner();
  } else if (el.dataset.plannerSlider || el.dataset.plannerNumber) {
    if (!el.value.trim()) { renderPlanner(); return; }
    const value = Number(el.value);
    if (validGrade(value)) updatePlanner(key, {fixedGrade:value});
    else renderPlanner();
  } else if (el.dataset.plannerComplete) {
    if (el.checked) {
      if (current.fixedGrade == null) {
        $('plannerAlert').textContent = 'Enter your actual final grade in the Grade % box before marking a course completed. Automatic suggestions are not actual grades.';
        $('plannerAlert').classList.add('planner-alert-warning');
        el.checked = false;
        return;
      }
      updatePlanner(key, {completed:true});
    } else updatePlanner(key, {completed:false});
  }
});
$('plannerRows').addEventListener('click', e => {
  const key = e.target.closest('[data-planner-auto]')?.dataset.plannerAuto;
  if (key) updatePlanner(key, {fixedGrade:null,completed:false});
});
$('plannerReset').addEventListener('click', () => {
  for (const c of courses) {
    const key = courseKey(c), options=plannerEntry(key);
    if (!options.completed) plannerSettings.entries[key] = {...options,fixedGrade:null};
  }
  savePlanner();renderPlanner();
});

// Initialize after module setup is complete; especially important when a
// student returns to a saved course lineup after viewing a full report.
render();
if (page === 'classes') refreshAll();

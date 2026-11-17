import { parseSchedule, normalizeSavedCourses, courseKey, courseLabel } from '../lib/schedule.mjs';
import { normalizeProfile, fmtPercent, historyRange, recentChange, GRADE_BANDS, GPA_EQUIVALENCIES, gpaEquivalency, aggregateDistributions, validApiPath } from '../lib/grades.mjs';

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
const escapeHTML = input => String(input ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let courses = [];
let profiles = new Map();
let errors = new Map();
let loading = new Set();
let selected = new Set();
let expanded = new Set();
let exampleMode = false;

try { courses = normalizeSavedCourses(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { courses = []; }
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(courses)); } catch { /* Storage disabled by browser */ } }
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
  $('courseCards').innerHTML = sortedCourses().map(renderCourse).join('');
  $('compareStrip').hidden = selected.size === 0;
  $('compareText').textContent = `${selected.size} selected for comparison (max 4)`;
  if (!$('comparePanel').hidden) renderComparison();
}

const fmtCount = n => n == null ? '—' : n.toLocaleString();
const fmtGpa = percent => {
  const equivalent = gpaEquivalency(percent);
  if (!equivalent || equivalent.gpa === null) return '—';
  return `${equivalent.approximate ? '≈' : ''}${equivalent.gpa.toFixed(2)}`;
};
const distSelections = new Map();
let detailedCourse = null;
let catalogPage = 1;
let catalogLast = null;
let catalogDelay = null;
let catalogRequest = 0;

function renderHistory(profile) {
  if (!profile?.history?.length) return '<p class="notice-text">No published course-average history.</p>';
  const data = profile.history.slice(-24);
  return `<div class="history-chart" role="img" aria-label="Published course averages for ${escapeHTML(data[0].yearsession)} to ${escapeHTML(data.at(-1).yearsession)}">${data.map(p => `<span class="history-column" title="${escapeHTML(p.yearsession)}: ${fmtPercent(p.average)}" style="height:${Math.max(3, p.average)}%"></span>`).join('')}</div><div class="year-tags"><span>${escapeHTML(data[0].yearsession)}</span><span>${escapeHTML(data.at(-1).yearsession)}</span></div><p class="detail-copy">Term-level means are based on available sections; they are not individual grade distributions.</p>`;
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
  const single = chosen.length === 1 ? chosen[0] : null;
  const max = Math.max(1, ...aggregate.bins.map(b => b.value ?? 0));
  const options = sessionSections.map(x => `<option value="${escapeHTML(x.section)}" ${x.section === state.section ? 'selected' : ''}>${escapeHTML(x.section)}${x.educators.length ? ` · ${escapeHTML(x.educators[0])}` : ''}</option>`).join('');
  const missing = aggregate.bins.some(b => b.incomplete);
  const sizeNote = aggregate.partialSize ? ' (known subtotal; other sizes not reported)' : '';
  const bins = aggregate.bins.map(b => {
    const label = b.value == null ? 'N/A' : `${b.incomplete ? '≥' : ''}${fmtCount(b.value)}`;
    const percent = b.value == null ? 0 : Math.round(b.value / max * 100);
    const bar = b.value == null ? '<span class="grade-bar withheld" aria-hidden="true"></span>'
      : `<span class="grade-bar ${b.incomplete ? 'partial' : ''}" style="height:${Math.max(0, percent)}%" aria-hidden="true"></span>`;
    return `<div class="grade-chart-col" aria-label="${escapeHTML(b.range)}: ${escapeHTML(label)} students" title="${escapeHTML(b.range)} · ${escapeHTML(label)}">
      <strong class="grade-chart-count">${escapeHTML(label)}</strong><div class="grade-chart-bar-wrap">${bar}</div><span class="grade-chart-band">${escapeHTML(b.key)}</span><small>${escapeHTML(b.label)}</small></div>`;
  }).join('');
  const status = Object.entries(aggregate.statuses).filter(([k,v]) => v !== null)
    .map(([k,v]) => `<span class="status-count">${escapeHTML(k)} <strong>${fmtCount(v)}</strong></span>`).join('');
  const source = [...new Set(chosen.map(x => x.source || 'unknown'))].join(' / ');
  const termInfo = profile?.coverage?.sessionDetails?.find(item => item.yearsession === state.session);
  const selectedAverage = single ? single.average : (termInfo?.average ?? null);
  const rate = aggregate.passRate == null ? '—' : `${aggregate.passRate.toFixed(1)}%`;
  const rowTable = `<div class="distribution-table"><table><thead><tr><th>Range</th><th>Letter</th><th>Reported count</th></tr></thead><tbody>${aggregate.bins.map(b => `<tr><td>${escapeHTML(b.range)}</td><td>${escapeHTML(b.label)}</td><td>${b.value == null ? 'Unavailable' : `${b.incomplete ? 'At least ' : ''}${fmtCount(b.value)}`}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="distribution-panel" aria-label="Historical grade distribution">
    <div class="distribution-toolbar"><div><h4>Grade distribution</h4><span class="detail-copy">Actual published grade-band counts, not estimated grades</span></div><div class="distribution-filters"><label>Academic session<select data-filter-session="${escapeHTML(key)}">${sessions.map(s => `<option value="${escapeHTML(s)}" ${s===state.session?'selected':''}>${escapeHTML(s)}</option>`).join('')}</select></label><label>Section<select data-filter-section="${escapeHTML(key)}"><option value="ALL" ${state.section === 'ALL' ? 'selected' : ''}>All available sections</option>${options}</select></label></div></div>
    <div class="section-stat-grid"><div><small>${single ? 'Section average' : 'Published term mean'}</small><strong>${fmtPercent(selectedAverage)}</strong><span>${single ? 'published section mean' : 'source session average; available sections only'}</span></div><div><small>${escapeHTML(aggregate.sizeLabel)}</small><strong>${fmtCount(aggregate.reported)}</strong><span>${aggregate.sections} record${aggregate.sections===1?'':'s'}${sizeNote}</span></div><div><small>Highest individual mark</small><strong>${fmtPercent(aggregate.high)}</strong></div><div><small>Lowest individual mark</small><strong>${fmtPercent(aggregate.low)}</strong></div><div><small>Median</small><strong>${fmtPercent(single?.median)}</strong><span>${single?.median != null ? 'reported section median' : 'Only shown for single sections'}</span></div><div><small>25th / 75th percentile</small><strong>${single?.p25 != null && single?.p75 != null ? `${fmtPercent(single.p25)} / ${fmtPercent(single.p75)}` : '—'}</strong></div><div><small>Standard deviation</small><strong>${single?.stdDev != null ? single.stdDev.toFixed(1) + ' pt' : '—'}</strong><span>available on individual sections</span></div><div><small>Pass rate (graded outcomes)</small><strong>${rate}</strong><span>${aggregate.passRate == null ? 'unavailable for this source' : 'pass / (pass + fail); withdrawals excluded'}</span></div></div>
    <div class="distribution-chart-header"><span>Students by grade range</span><span>Published count${aggregate.fullyPublished ? 's' : 's; some withheld'}</span></div>
    <div class="grade-chart" role="group" aria-label="Published grade counts by UBC percentage band for ${escapeHTML(state.session)}${state.section==='ALL'?'':` section ${escapeHTML(state.section)}`}">${bins}</div>
    <p class="chart-caption">Percentage ranges (left to right) · Each bar shows the published student count, not a percentage of the class. N/A means unavailable or withheld.</p>
    ${missing ? '<p class="data-warning">Some grade bins are blank or privacy-suppressed. A ≥ count is a lower bound from published sections only; a blank is not zero. We never reconstruct withheld counts.</p>' : `<p class="dist-complete">All eleven grade-band counts are present for the ${chosen.length === 1 ? 'selected section' : 'selected records'}.</p>`}
    <details class="distribution-breakdown"><summary>View exact grade-band counts</summary>${rowTable}</details>
    ${status ? `<div class="status-breakdown">Historical standing counts: ${status}</div>` : ''}
    <p class="detail-copy">Source: ${escapeHTML(source)}. ${aggregate.reported != null ? `Student count: ${escapeHTML(aggregate.sizeLabel.toLowerCase())}. ` : ''}${profile.coverage?.limitedSectionHistory ? 'The local index retains only the 120 newest section records; older semesters may be incomplete. ' : ''}${chosen.length > 1 ? 'Aggregated counts include only the available sections shown for this session; individual section summaries should be used for median and quartiles. ' : ''}Counts cover source grade categories, not a guaranteed current enrollment or an exact GPA distribution.</p>
  </div>`;
}

function renderCourse(c, standalone = false) {
  const key = courseKey(c), profile = profiles.get(key), pending = loading.has(key), error = errors.get(key), open = standalone || expanded.has(key);
  const status = error ? `<span class="status-dot amber"></span><span title="${escapeHTML(error)}">Historical source unavailable</span>` : pending ? '<span class="status-dot gray"></span>Loading historical data…' : profile?.average != null ? '<span class="status-dot"></span>Published historical averages available' : profile ? '<span class="status-dot amber"></span>No published averages found' : '<span class="status-dot gray"></span>No data loaded';
  const latest = profile?.coverage?.latestPublished;
  const newerVariants = (profile?.relatedCodes ?? []).filter(v => latest && v.latest > latest);
  const coverageHint = latest ? `<span class="last-coverage"> · through ${escapeHTML(latest)}${newerVariants.length ? ` · newer ${escapeHTML(newerVariants.map(x => x.course).join('/'))} entries` : ''}</span>` : '';
  const section = c.sections.length ? ` · Section${c.sections.length > 1 ? 's' : ''} ${escapeHTML(c.sections.join(', '))}` : '';
  const teaching = profile?.teachingTeam?.length ? profile.teachingTeam.slice(0,8).map(p => `<span class="educator-chip">${escapeHTML(p.name)}</span>`).join('') : '<span class="notice-text">No teaching team listed.</span>';
  const related = profile?.relatedCodes?.length ? `<div class="detail-heading">Related course codes</div><div class="variant-strip">${profile.relatedCodes.map(x => `<button type="button" class="variant-code" data-related="${escapeHTML(c.subject + ' ' + x.course)}">${escapeHTML(c.subject + ' ' + x.course)} · through ${escapeHTML(x.latest)}</button>`).join('')}</div><p class="detail-copy">Suffix codes are distinct registrations and are never silently merged.</p>` : '';
  const sections = (profile?.recentSections ?? []).slice().sort((a,b) => (c.sections.includes(b.section)?1:0)-(c.sections.includes(a.section)?1:0) || b.yearsession.localeCompare(a.yearsession) || a.section.localeCompare(b.section)).slice(0,20);
  const sectionTable = sections.length ? `<div class="section-evidence"><table><thead><tr><th>Session</th><th>Section</th><th>Avg</th><th>Students</th><th>High / Low</th><th>Educator(s)</th></tr></thead><tbody>${sections.map(x => `<tr><td>${escapeHTML(x.yearsession)}</td><td>${escapeHTML(x.section)}${c.sections.includes(x.section)?' ★':''}</td><td>${fmtPercent(x.average)}</td><td>${fmtCount(x.reported)}</td><td>${fmtPercent(x.high)} / ${fmtPercent(x.low)}</td><td>${escapeHTML(x.educators.join('; ')||'Not listed')}</td></tr>`).join('')}</tbody></table></div><p class="detail-copy">Historical section IDs don't identify today's teaching team. “Students” means Enrolled (older data) or Reported (newer data).</p>` : '<p class="notice-text">No historical section records in this source.</p>';
  const partial = profile?.coverage?.partialYearsessions ?? 0;
  const warnings = partial ? `<div class="data-warning">${partial} recorded term${partial===1?'':'s'} contain unpublished section averages. Term-level means use only published entries.</div>` : '';
  const details = open ? `<div class="course-detail">${renderDistribution(profile,key)}<details class="detail-collapse"><summary>Historical course averages by session · ${profile ? escapeHTML(historyRange(profile.history)) : 'No history'}</summary>${renderHistory(profile)}<p class="detail-copy">Coverage: ${profile ? escapeHTML(historyRange(profile.history)) : 'None'}${profile?.coverage?.latest ? ` · Latest archive term: ${escapeHTML(profile.coverage.latest)}` : ''}</p></details>${warnings}${related}<details class="detail-collapse"><summary>Historical sections (up to 20 shown)</summary>${sectionTable}</details><details class="detail-collapse"><summary>Recorded teaching team</summary><div class="educator-list">${teaching}</div></details><p class="detail-copy">Data source: ${escapeHTML(profile?.source?.stats || 'unavailable')}. ${profile?.coverage?.yearsessions ?? 0} terms with published averages. Missing grade bins are never inferred. <a href="${UBC_GPA_SOURCE}" target="_blank" rel="noopener noreferrer">UBC's published 4.33 equivalency ↗</a> is not a predicted personal mark.</p></div>` : '';
  return `<article class="course-item ${standalone?'standalone-course':''}" data-key="${escapeHTML(key)}"><div class="course-head"><div class="course-logo">${escapeHTML(c.subject)}</div><div class="course-title-block"><strong>${escapeHTML(courseLabel(c))}</strong><small>${escapeHTML(profile?.title || 'Historical course overview')}${section}</small></div>${standalone ? `<button class="outline-btn add-explored" type="button" data-add-explored="${escapeHTML(key)}">Save to My Classes +</button>` : `<button class="remove-course" data-remove="${escapeHTML(key)}" type="button" aria-label="Remove ${escapeHTML(courseLabel(c))}">✕</button>`}</div><div class="course-middle extended"><div><span class="course-stat-label">Recent 5-year mean</span><span class="course-stat-value highlight">${pending?'···':fmtPercent(profile?.average5)}</span></div><div><span class="course-stat-label">All-time mean</span><span class="course-stat-value">${pending?'···':fmtPercent(profile?.average)}</span></div><div><span class="course-stat-label">Highest course mean</span><span class="course-stat-value">${fmtPercent(profile?.high)}</span></div><div><span class="course-stat-label">Lowest course mean</span><span class="course-stat-value">${fmtPercent(profile?.low)}</span></div><div><span class="course-stat-label"><a href="${UBC_GPA_SOURCE}" target="_blank" rel="noopener noreferrer" class="gpa-source-link">UBC 4.33 equivalent ↗</a> · recent mean</span><span class="course-stat-value">${fmtGpa(profile?.average5)}</span></div><div><span class="course-stat-label">Highest / lowest mark</span><span class="course-stat-value small-mark">${fmtPercent(profile?.highMark)} / ${fmtPercent(profile?.lowMark)}</span></div></div><div class="course-bottom"><div>${status}${coverageHint}</div><div>${standalone ? '' : `<label class="compare-label"><input type="checkbox" data-select="${escapeHTML(key)}" ${selected.has(key)?'checked':''} aria-label="Compare ${escapeHTML(courseLabel(c))}"/> Compare</label><a class="detail-toggle" href="${escapeHTML(courseUrl(c))}">View full report →</a>`}</div></div>${details}</article>`;
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
  if (!/\.(txt|csv|ics|html?)$/i.test(file.name)) { message('Please upload a .txt, .csv, .html or .ics file.', true); return; }
  if (file.size > 100_000) { message('File too large. Please choose a file under 100 KB.', true); return; }
  $('fileName').textContent = file.name;
  $('scheduleInput').value = await file.text();
  message('File read locally. Select “Find my courses” to import.');
  e.target.value = '';
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
render(); if (page === 'classes') refreshAll();

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
$('courseView').addEventListener('click',e=>{
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

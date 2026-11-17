import { parseSchedule, normalizeSavedCourses, courseKey, courseLabel } from '../lib/schedule.mjs';
import { normalizeProfile, fmtPercent, historyRange, recentChange } from '../lib/grades.mjs';

const $ = id => document.getElementById(id);
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
function renderCourse(c) {
  const key = courseKey(c), profile = profiles.get(key), pending = loading.has(key), error = errors.get(key), open = expanded.has(key);
  const status = error ? `<span class="status-dot amber"></span><span title="${escapeHTML(error)}">Source temporarily unavailable</span>` : pending ? '<span class="status-dot gray"></span>Loading live data…' : profile?.average != null ? '<span class="status-dot"></span>Published course averages available' : profile ? '<span class="status-dot amber"></span>Listing found; published averages unavailable' : '<span class="status-dot gray"></span>No course statistics found';
  const latest = profile?.coverage?.latestPublished;
  const newerVariants = (profile?.relatedCodes ?? []).filter(v => latest && v.latest > latest);
  const coverageHint = latest ? `<span class="last-coverage"> · through ${escapeHTML(latest)}${newerVariants.length ? ` · newer ${escapeHTML(newerVariants.map(x => x.course).join('/'))} records` : ''}</span>` : '';
  const section = c.sections.length ? ` · Section${c.sections.length > 1 ? 's' : ''} ${c.sections.join(', ')}` : '';
  const chart = profile?.history?.length ? (() => {
    const data = profile.history.slice(-16);
    return `<div class="history-chart" role="img" aria-label="Historical average grades by session">${data.map(p => `<span class="history-column" title="${escapeHTML(p.yearsession)}: ${fmtPercent(p.average)}" style="height:${Math.max(3, p.average)}%"></span>`).join('')}</div><div class="year-tags"><span>${escapeHTML(data[0].yearsession)}</span><span>${escapeHTML(data.at(-1).yearsession)}</span></div>`;
  })() : '<p class="notice-text">Course-level historical trend not available.</p>';
  const teaching = profile?.teachingTeam?.length ? profile.teachingTeam.slice(0, 6).map(p => `<span class="educator-chip">${escapeHTML(p.name)}</span>`).join('') : '<span class="notice-text">Teaching team data not available.</span>';
  const partial = profile?.coverage?.partialYearsessions ?? 0;
  const related = profile?.relatedCodes?.length ? `<div class="detail-heading">Related codes in the archive</div><div class="variant-strip">${profile.relatedCodes.map(x => `<button type="button" class="variant-code" data-related="${escapeHTML(c.subject + ' ' + x.course)}">${escapeHTML(c.subject + ' ' + x.course)} · through ${escapeHTML(x.latest)}</button>`).join('')}</div><p class="detail-copy">Some UBC course codes have a suffix (A/B etc.). These are kept separate rather than silently combining different registrations.</p>` : '';
  const sections = (profile?.recentSections ?? []).slice().sort((a,b) => {
    const hitA = c.sections.includes(a.section) ? 1 : 0;
    const hitB = c.sections.includes(b.section) ? 1 : 0;
    return hitB-hitA || b.yearsession.localeCompare(a.yearsession) || a.section.localeCompare(b.section);
  }).slice(0, 15);
  const sectionTable = sections.length ? `<div class="section-evidence"><table><thead><tr><th>Session</th><th>Section</th><th>Published average</th><th>Listed educator(s)</th></tr></thead><tbody>${sections.map(x=>`<tr><td>${escapeHTML(x.yearsession)}</td><td>${escapeHTML(x.section)}${c.sections.includes(x.section) ? ' · same section code' : ''}</td><td>${fmtPercent(x.average)}</td><td>${escapeHTML(x.educators.join('; ') || 'Not listed')}</td></tr>`).join('')}</tbody></table></div><p class="detail-copy">These are historical published sections, not current Workday section assignments. A matching section number does not imply the same instructor or teaching conditions.</p>` : '<p class="notice-text">No section-level grade averages in the current source.</p>';
  const warning = partial ? `<div class="data-warning">${partial} recorded academic session${partial === 1 ? '' : 's'} had one or more section averages unavailable. Aggregates for those sessions use only published entries and may not represent the entire course.</div>` : '';
  const details = open ? `<div class="course-detail"><div class="detail-heading">Historical course average by session</div>${chart}<p class="detail-copy">Available sessions: ${profile ? escapeHTML(historyRange(profile.history)) : 'None'}${profile?.coverage?.latest ? ` · Latest: ${escapeHTML(profile.coverage.latest)}` : ''} · These values are historical aggregate averages and not the averages of specific current sections.</p>${warning}${related}<div class="detail-heading">Published historical sections (up to 15)</div>${sectionTable}<div class="detail-heading">Previous teaching team entries</div><div class="educator-list">${teaching}</div><p class="detail-copy">Data source: ${escapeHTML(profile?.source?.stats || 'unavailable')}. ${profile?.coverage?.yearsessions ? `${profile.coverage.yearsessions} yearsessions covered. ` : ''}Missing or suppressed values are not estimated. ${profile?.coverage?.latestPublished ? `Latest published average: ${escapeHTML(profile.coverage.latestPublished)}. ` : ''}${error ? ` Provider error: ${escapeHTML(error)}.` : ''}</p></div>` : '';
  return `<article class="course-item" data-key="${escapeHTML(key)}"><div class="course-head"><div class="course-logo">${escapeHTML(c.subject)}</div><div class="course-title-block"><strong>${escapeHTML(courseLabel(c))}</strong><small>${escapeHTML(profile?.title || 'Historical course overview')}${escapeHTML(section)}</small></div><button class="remove-course" data-remove="${escapeHTML(key)}" type="button" aria-label="Remove ${escapeHTML(courseLabel(c))}">✕</button></div><div class="course-middle"><div><span class="course-stat-label">Recent 5-year mean</span><span class="course-stat-value highlight">${pending ? '···' : fmtPercent(profile?.average5)}</span></div><div><span class="course-stat-label">All-time average</span><span class="course-stat-value">${pending ? '···' : fmtPercent(profile?.average)}</span></div><div><span class="course-stat-label">Recent trend</span><span class="course-stat-value">${recentChange(profile?.history ?? []) == null ? '—' : (recentChange(profile.history) > 0 ? '+' : '') + recentChange(profile.history).toFixed(1) + 'pt'}</span></div></div><div class="course-bottom"><div>${status}${coverageHint}</div><div><label class="compare-label"><input type="checkbox" data-select="${escapeHTML(key)}" ${selected.has(key) ? 'checked' : ''} aria-label="Compare ${escapeHTML(courseLabel(c))}" /> Compare</label><button class="detail-toggle" type="button" data-expand="${escapeHTML(key)}">${open ? 'Less ↑' : 'Details ↓'}</button></div></div>${details}</article>`;
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
document.querySelectorAll('[data-course]').forEach(el => el.addEventListener('click', () => {
  addCourses(parseSchedule(el.dataset.course, $('campusSelect').value));
  location.hash = '#workspace';
  message(`${el.dataset.course} added to your lineup.`);
}));
render(); refreshAll();

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
fetch('/api/coverage').then(async r => { if(!r.ok) throw new Error('No local dataset has been imported.'); return r.json(); }).then(data=>{coverage=data;renderCoverage();}).catch(err=>{ $('coverageSummary').textContent = `${err.message} Import the raw ZIP to see data coverage.`; });

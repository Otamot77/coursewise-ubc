import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validApiPath } from './lib/grades.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const UPSTREAM = process.env.GRADE_API_BASE || 'https://ubcgrades.com/api';
const TTL = 24 * 60 * 60 * 1000;
const cache = new Map();
let localIndex = null;
let localMetadata = null;
let localCoverage = null;
let catalog = [];
let catalogSubjects = { UBCV: [], UBCO: [] };
try {
  const indexFile = path.join(root, 'data', 'course-index.json.gz');
  if (existsSync(indexFile)) {
    localIndex = JSON.parse(gunzipSync(readFileSync(indexFile)));
    const metaFile = path.join(root, 'data', 'metadata.json');
    if (existsSync(metaFile)) localMetadata = JSON.parse(readFileSync(metaFile, 'utf8'));
    const coverageFile = path.join(root, 'data', 'coverage.json');
    if (existsSync(coverageFile)) localCoverage = JSON.parse(readFileSync(coverageFile, 'utf8'));
    catalog = Object.entries(localIndex).map(([key, profile]) => {
      const [campus, subject, course] = key.split(':');
      const title = profile.stats?.course_title || '';
      const average = profile.stats?.average ?? null;
      const latest = profile.coverage?.latestPublished || profile.coverage?.latest || '';
      return { campus, subject, course, title, average, latest,
        sessions: profile.coverage?.yearsessions ?? 0 };
    });
    catalogSubjects = {
      UBCV: [...new Set(catalog.filter(c => c.campus === 'UBCV').map(c => c.subject))].sort(),
      UBCO: [...new Set(catalog.filter(c => c.campus === 'UBCO').map(c => c.subject))].sort()
    };
    console.log(`Loaded ${Object.keys(localIndex).length} local PAIR course profiles.`);
  }
} catch (error) {
  console.error('Local grade index could not be loaded; using the public API:', error.message);
  localIndex = null;
}

const INITIAL_ROUTES = Object.freeze({ '/': 'home', '/my-classes': 'classes', '/explore': 'explore', '/course': 'course', '/gpa': 'gpa', '/data': 'data' });

/** Mark the correct page active in the HTML response, before the browser loads JS.
 * All other pages receive the native hidden attribute, preventing a flash of Home.
 * The client router still keeps navigation states up-to-date after initialization.
 */
function renderInitialPage(html, pathname) {
  const active = INITIAL_ROUTES[pathname] ?? 'home';
  return html.replace(/<section\b[^>]*\bdata-page="([^"]+)"[^>]*>/g, (tag, pageName) => {
    if (!Object.values(INITIAL_ROUTES).includes(pageName)) return tag;
    const reset = tag
      .replace(/\s+hidden(?=\s|>)/g, '')
      .replace(/\bclass="([^"]*)"/, (_, cls) => {
        const classes = cls.split(/\s+/).filter(c => c && c !== 'is-active');
        if (pageName === active) classes.push('is-active');
        return `class="${classes.join(' ')}"`;
      });
    return pageName === active ? reset : reset.replace(/>$/, ' hidden>');
  });
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

async function upstream(pathname) {
  let sawUnavailable = false;
  for (const version of ['v3', 'v2']) {
    let response;
    try {
      response = await fetch(`${UPSTREAM}/${version}/${pathname}`, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    } catch (error) {
      throw new Error(`Grade source could not be reached (${error.name === 'TimeoutError' ? 'timeout' : 'network error'}).`);
    }
    if (response.status === 404) { sawUnavailable = true; continue; }
    if (!response.ok) throw new Error(`Grade source returned HTTP ${response.status}.`);
    let data;
    try { data = await response.json(); } catch { throw new Error('Grade source returned invalid JSON.'); }
    return { data, version };
  }
  return { data: null, version: sawUnavailable ? 'unavailable' : null };
}

async function profile(campus, subject, course) {
  const base = `${campus}/${subject}/${course}`;
  const jobs = [
    ['stats', `course-statistics/${base}`],
    ['history', `course-statistics/average-history/${base}`],
    ['teachingTeam', `course-statistics/teaching-team/${base}`]
  ];
  const settled = await Promise.allSettled(jobs.map(([, route]) => upstream(route)));
  const values = {}; const sources = {}; let failures = 0;
  settled.forEach((outcome, i) => {
    const key = jobs[i][0];
    if (outcome.status === 'fulfilled') {
      values[key] = outcome.value.data;
      sources[key] = outcome.value.version;
    } else {
      failures++;
      values[key] = null;
      sources[key] = 'error';
    }
  });
  if (failures === jobs.length) throw new Error('Historical grade provider is temporarily unreachable.');
  return { ...values, sources, fetchedAt: new Date().toISOString() };
}

const sendJSON = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
};
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return sendJSON(res, 405, { error: 'Method not allowed' });
  let url;
  try { url = new URL(req.url, `http://${HOST}:${PORT}`); } catch { return sendJSON(res, 400, { error: 'Invalid URL' }); }
  if (url.pathname === '/api/course') {
    const campus = url.searchParams.get('campus') || '';
    const subject = url.searchParams.get('subject') || '';
    const course = url.searchParams.get('course') || '';
    if (!validApiPath(campus, subject, course)) return sendJSON(res, 400, { error: 'Expected campus (UBCV/UBCO), subject and course.' });
    const key = `${campus}/${subject}/${course}`;
    try {
      const localProfile = localIndex?.[`${campus}:${subject}:${course}`];
      if (localProfile) return sendJSON(res, 200, { ...localProfile,
        sources: { stats: 'local PAIR CSV', history: 'local PAIR CSV', teachingTeam: 'local PAIR CSV' },
        fetchedAt: localMetadata?.generatedAt ?? null });
      const cached = cache.get(key);
      if (cached && Date.now() - cached.time < TTL) return sendJSON(res, 200, cached.data);
      const data = await profile(campus, subject, course);
      if (data.sources.stats !== 'error') cache.set(key, { time: Date.now(), data });
      return sendJSON(res, 200, data);
    } catch (err) { return sendJSON(res, 503, { error: err.message }); }
  }
  if (url.pathname === '/api/catalog') {
    if (!localIndex) return sendJSON(res, 404, { error: 'Course catalog needs the locally imported PAIR dataset. See README for import instructions.' });
    const campus = url.searchParams.get('campus') || 'UBCV';
    const subject = (url.searchParams.get('subject') || '').trim().toUpperCase();
    const subjectPrefix = (url.searchParams.get('subjectPrefix') || '').trim().toUpperCase();
    const level = url.searchParams.get('level') || '';
    const q = (url.searchParams.get('q') || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const sort = url.searchParams.get('sort') || 'recent';
    const pageValue = Number(url.searchParams.get('page') || 1);
    if (!/^(UBCV|UBCO)$/.test(campus) || (subject && !/^[A-Z]{2,6}$/.test(subject)) || (subjectPrefix && !/^[A-Z]{1,6}$/.test(subjectPrefix)) || !['', '100','200','300','400','500','600'].includes(level) || q.length > 80 ||
        !['recent', 'name', 'average'].includes(sort) || !Number.isInteger(pageValue) || pageValue < 1 || pageValue > 10000) {
      return sendJSON(res, 400, { error: 'Invalid catalog filters.' });
    }
    const filtered = catalog.filter(x => x.campus === campus && (!subject || x.subject === subject) && (!subjectPrefix || x.subject.startsWith(subjectPrefix)) && (!level || (level === '600' ? Number(x.course.slice(0,3)) >= 600 : Math.floor(Number(x.course.slice(0,3)) / 100) * 100 === Number(level))) &&
      (!q || `${x.subject} ${x.course} ${x.subject}${x.course} ${x.title}`.toUpperCase().includes(q) ||
        `${x.subject} ${x.course}`.includes(q.replace(/_/g, ' '))));
    filtered.sort((a, b) => {
      if (sort === 'name') return `${a.subject} ${a.course}`.localeCompare(`${b.subject} ${b.course}`);
      if (sort === 'average') return (b.average ?? -1) - (a.average ?? -1) || `${a.subject} ${a.course}`.localeCompare(`${b.subject} ${b.course}`);
      return b.latest.localeCompare(a.latest) || `${a.subject} ${a.course}`.localeCompare(`${b.subject} ${b.course}`);
    });
    const perPage = 9;
    return sendJSON(res, 200, {
      page: pageValue, perPage, total: filtered.length, subjects: catalogSubjects[campus],
      results: filtered.slice((pageValue - 1) * perPage, pageValue * perPage)
    });
  }
  if (url.pathname === '/api/coverage') {
    if (!localIndex || !localCoverage) return sendJSON(res, 404, { error: 'Local coverage dataset has not been imported.' });
    return sendJSON(res, 200, { metadata: localMetadata, sessions: localCoverage.sessions });
  }
  if (url.pathname === '/api/health') return sendJSON(res, 200, {
    ok: true, source: localIndex ? 'Local UBC PAIR CSV + API fallback' : 'UBCGrades API',
    indexedCourses: localIndex ? Object.keys(localIndex).length : 0,
    coursesWithPublishedAverages: localMetadata?.coursesWithAnyPublishedAverage ?? null,
    latestDataset: localCoverage?.sessions?.reduce((latest, item) => latest > item.yearsession ? latest : item.yearsession, '') ?? null,
    mode: localIndex ? 'local-first' : 'live'
  });
  const requested = ['/', '/my-classes', '/explore', '/course', '/gpa', '/data'].includes(url.pathname) ? '/index.html' : url.pathname;
  let decoded;
  try { decoded = decodeURIComponent(requested); } catch { return sendJSON(res, 400, { error: 'Invalid filename' }); }
  const resolved = path.resolve(root, `.${decoded}`);
  if (!resolved.startsWith(root + path.sep)) return sendJSON(res, 403, { error: 'Forbidden' });
  if (!['.html', '.css', '.mjs', '.js', '.svg', '.json', '.txt'].includes(path.extname(resolved))) return sendJSON(res, 404, { error: 'Not found' });
  try {
    const original = await readFile(resolved);
    // The same HTML shell serves multiple URLs; set initial visibility on the server
    // so the homepage never flashes before the client-side module initializes.
    const content = requested === '/index.html'
      ? Buffer.from(renderInitialPage(original.toString('utf8'), url.pathname), 'utf8')
      : original;
    res.writeHead(200, { 'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'" });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { sendJSON(res, 404, { error: 'Not found' }); }
});
if (process.env.NODE_ENV !== 'test') server.listen(PORT, HOST, () => console.log(`UBCGrades Next listening at http://${HOST}:${PORT}`));
export { server, profile, upstream };

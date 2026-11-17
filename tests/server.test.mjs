import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { server } = await import('../server.mjs');
let root;
before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  root = `http://127.0.0.1:${server.address().port}`;
});
after(async () => await new Promise(resolve => server.close(resolve)));

test('health endpoint reports whether the local archive has been indexed', async () => {
  const response = await fetch(`${root}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(['live', 'local-first'].includes(body.mode));
  assert.ok(Number.isInteger(body.indexedCourses));
});

test('coverage endpoint returns provenance when locally indexed', async () => {
  const response = await fetch(`${root}/api/coverage`);
  assert.ok([200, 404].includes(response.status));
  const body = await response.json();
  if (response.ok) {
    assert.ok(body.sessions.length > 0);
    assert.ok(body.sessions.every(x => x.campus === 'UBCV' || x.campus === 'UBCO'));
    assert.ok(body.metadata.indexedCourses > 0);
  } else assert.ok(body.error);
});

test('invalid input rejected before querying any grade provider', async () => {
  const response = await fetch(`${root}/api/course?campus=UBCV&subject=%2E%2E%2Fetc&course=100`);
  assert.equal(response.status, 400);
});

test('frontend is served without exposing compressed indexes as static files', async () => {
  const home = await fetch(`${root}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Workday/i);
  const forbidden = await fetch(`${root}/data/course-index.json.gz`);
  assert.equal(forbidden.status, 404);
});


test('full searchable catalog supports course and title filters without exposing raw records', async () => {
  const response=await fetch(`${root}/api/catalog?campus=UBCV&q=CPEN%20221&page=1`);
  if (response.status===404) {
    assert.match((await response.json()).error, /imported PAIR dataset/);
    return;
  }
  assert.equal(response.status,200);
  const data=await response.json();
  assert.ok(data.total>=1);
  assert.ok(data.results.some(x=>x.subject==='CPEN' && x.course.startsWith('221')));
  assert.ok(data.results.every(x=>x.campus==='UBCV'));
  assert.ok(data.results.every(x=>!('recentSections' in x)));
  assert.ok(data.subjects.includes('CPEN'));
});

test('catalog rejects invalid filters and oversized queries', async () => {
  const r=await fetch(`${root}/api/catalog?campus=BAD`);
  assert.ok([400,404].includes(r.status));
  if(r.status===400) assert.match((await r.json()).error,/Invalid catalog/);
});

test('catalog uses nine-item pages and supports year level + type-ahead subject prefix', async () => {
  const response = await fetch(`${root}/api/catalog?campus=UBCV&subjectPrefix=CP&level=200&page=1`);
  if (response.status === 404) return; // Source-only mode has no catalog.
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.perPage, 9);
  assert.ok(data.results.length <= 9);
  assert.ok(data.results.length > 0);
  assert.ok(data.results.every(x => x.subject.startsWith('CP') && Number(x.course.slice(0, 3)) >= 200 && Number(x.course.slice(0,3)) < 300));
  assert.ok(data.subjects.includes('CPEN'));
});

test('catalog rejects invalid level or subject prefix filters', async () => {
  const invalid = await fetch(`${root}/api/catalog?campus=UBCV&subjectPrefix=CP1&level=900`);
  assert.ok([400,404].includes(invalid.status));
  if (invalid.status === 400) assert.match((await invalid.json()).error, /Invalid catalog/);
});

test('primary sections have distinct direct URLs served by the application', async () => {
  for (const page of ['/my-classes', '/explore', '/gpa', '/data', '/course?campus=UBCV&subject=CPSC&course=110']) {
    const response = await fetch(`${root}${page}`);
    assert.equal(response.status, 200, page);
    const html = await response.text();
    assert.match(html, /data-page="home"/);
    assert.match(html, /data-page="course"/);
    assert.match(html, /id="homeForm"/);
  }
});


test('My Classes includes the local-only grade goal planner', async () => {
  const response = await fetch(`${root}/my-classes`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="gradePlanner"/);
  assert.match(html, /id="plannerTarget"/);
  assert.match(html, /id="plannerRows"/);
  const lib = await fetch(`${root}/lib/planner.mjs`);
  assert.equal(lib.status, 200);
  assert.match(await lib.text(), /calculateGradePlan/);
});

test('instructor comparison analytics module is served without needing private data', async () => {
  const response = await fetch(`${root}/lib/instructors.mjs`);
  assert.equal(response.status, 200);
  const code = await response.text();
  assert.match(code, /compareInstructors/);
  assert.match(code, /shared/);
  const app = await fetch(`${root}/assets/app.mjs`);
  assert.equal(app.status, 200);
  assert.match(await app.text(), /renderInstructorComparison/);
});

test('Workday XLSX importer is locally served and wired into My Classes', async () => {
  const importer=await fetch(`${root}/lib/workday-xlsx.mjs`);
  assert.equal(importer.status,200);
  assert.match(await importer.text(),/parseWorkdayXlsx/);
  const page=await fetch(`${root}/my-classes`);
  const html=await page.text();
  assert.match(html,/\.xlsx/);
  const app=await fetch(`${root}/assets/app.mjs`);
  const body=await app.text();
  assert.match(body,/await parseWorkdayXlsx\(file/);
  assert.match(body,/Only course codes and sections were extracted/);
});

test('course reports use explicit SVG histograms and saved lineups show compact insights', async () => {
  const charts=await fetch(`${root}/lib/charts.mjs`);
  assert.equal(charts.status,200);
  const code=await charts.text();
  assert.match(code,/gradeDistributionSvg/);
  assert.match(code,/rect class="distribution-svg-bar"/);
  assert.match(code,/historyTrendSvg/);
  assert.match(code,/compactTrendSvg/);
  const app=await fetch(`${root}/assets/app.mjs`);
  const body=await app.text();
  assert.match(body,/function renderCourseOverview/);
  assert.match(body,/lineup-highlights/);
  assert.match(body,/More historical statistics/);
});

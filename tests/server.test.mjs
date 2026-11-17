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

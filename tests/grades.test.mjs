import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, fmtPercent, historyRange, recentChange, validApiPath } from '../lib/grades.mjs';
test('normalizes real API response schema without inventing values', () => {
  const p = normalizeProfile({ stats: { course_title: 'Test', average: 71.5, average_past_5_yrs: '', max_course_avg: null }, history: { yearsessions: { '2023W': 72, '2024W': 74 } }, teachingTeam: [{ name: 'Sample Educator', yearsessions: { '2024W': 1 } }] });
  assert.equal(p.average, 71.5); assert.equal(p.average5, null);
  assert.equal(fmtPercent(p.average5), '—'); assert.equal(p.history.length, 2); assert.equal(recentChange(p.history), 2);
  assert.equal(historyRange(p.history), '2023–2024');
});
test('missing course profile stays missing', () => assert.equal(normalizeProfile({ stats: null }), null));
test('upstream path segments are allowlisted', () => {
  assert.ok(validApiPath('UBCV', 'MATH', '100'));
  assert.ok(!validApiPath('UBCV', '../MATH', '100'));
  assert.ok(!validApiPath('UBCO', 'CPSC', '100/evil'));
});

test('section averages and variant links preserve only published values', () => {
  const data = normalizeProfile({ stats: { course_title: 'Software Construction I', average: 72 }, history: { yearsessions: { '2022W': 72 } },
    recentSections: [{ yearsession: '2022W', section: '101', average: 76.3, educators: ['Professor A'], reported: 123 },
                     { yearsession: '2024W', section: '102', average: null }],
    relatedCodes: [{ course: '221A', latest: '2025W' }, { course: '../bad', latest: '2025W' }] });
  assert.equal(data.recentSections.length, 1);
  assert.equal(data.recentSections[0].average, 76.3);
  assert.deepEqual(data.relatedCodes, [{ course: '221A', latest: '2025W' }]);
});

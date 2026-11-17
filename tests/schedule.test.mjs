import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule, normalizeSavedCourses } from '../lib/schedule.mjs';

test('parses Workday campus suffix and sections', () => {
  const result = parseSchedule('CPEN_V 221 - 101\nMATH_O 100 - 201');
  assert.deepEqual(result, [
    { campus: 'UBCV', subject: 'CPEN', course: '221', sections: ['101'] },
    { campus: 'UBCO', subject: 'MATH', course: '100', sections: ['201'] }
  ]);
});
test('supports comma-separated course lists and alpha suffix', () => {
  assert.deepEqual(parseSchedule('CPSC 110, MATH 200, CHEM 123A').map(x => `${x.subject} ${x.course}`), ['CPSC 110', 'MATH 200', 'CHEM 123A']);
});
test('deduplicates repeated Workday listings and preserves sections', () => {
  const result = parseSchedule('CPSC_V 210 - 101\nCPSC_V 210 - 102\nCPSC_V 210 - 101');
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].sections, ['101', '102']);
});
test('does not parse common non-course labels', () => {
  assert.deepEqual(parseSchedule('ROOM 123\nTERM 202\n'), []);
});
test('normalizes and rejects unsafe local storage values', () => {
  assert.equal(normalizeSavedCourses([{ campus: 'UBCV', subject: 'CPSC', course: '110', sections: ['101'] }, { campus: 'UBCX', subject: 'CPSC', course: '110' }, { campus: 'UBCV', subject: '<h1>', course: '200' }]).length, 1);
});

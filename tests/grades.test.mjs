import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, fmtPercent, historyRange, recentChange, validApiPath, GRADE_BANDS, GPA_EQUIVALENCIES, letterFromPercentage, gpaEquivalency, aggregateDistributions } from '../lib/grades.mjs';
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
  assert.equal(data.recentSections.length, 2);
  assert.equal(data.recentSections[1].average, null);
  assert.equal(data.recentSections[0].average, 76.3);
  assert.deepEqual(data.relatedCodes, [{ course: '221A', latest: '2025W' }]);
});


test('exact published 4.33 equivalency at every integer from 50 to 90', () => {
  assert.equal(GPA_EQUIVALENCIES.length, 41);
  for (let percent=50; percent<=90; percent++) {
    const actual=gpaEquivalency(percent);
    assert.equal(actual.gpa, GPA_EQUIVALENCIES[percent-50]);
    assert.equal(actual.approximate, false);
  }
  assert.equal(gpaEquivalency(90).gpa, 4.33);
  assert.equal(gpaEquivalency(95).gpa, 4.33);
  assert.equal(gpaEquivalency(85).gpa, 3.95);
  assert.equal(gpaEquivalency(86).gpa, 4.00);
  assert.equal(gpaEquivalency(49).gpa, null);
  assert.equal(gpaEquivalency(49.8).gpa, null);
  assert.equal(gpaEquivalency(85.6).gpa, 4.00);
  assert.equal(gpaEquivalency(85.6).approximate, true);
  assert.equal(gpaEquivalency('not a grade'), null);
  assert.equal(letterFromPercentage(76), 'B+');
  assert.equal(letterFromPercentage(49), 'F');
});

test('letter grade range boundaries match UBC grading conventions', () => {
  assert.equal(GRADE_BANDS.length, 11);
  for (const [mark, label] of [[100,'A+'],[90,'A+'],[89,'A'],[85,'A'],[84,'A−'],[80,'A−'],[79,'B+'],[76,'B+'],[75,'B'],[72,'B'],[71,'B−'],[68,'B−'],[67,'C+'],[64,'C+'],[63,'C'],[60,'C'],[59,'C−'],[55,'C−'],[54,'D'],[50,'D'],[49,'F'],[0,'F']]) {
    assert.equal(letterFromPercentage(mark), label, `${mark}%`);
  }
});

test('distribution aggregates preserve withheld bins as lower bounds, and zero as exact', () => {
  const first = { reported: 10, reportedKind: 'Reported', high: 92, low: 30,
    distribution: {'<50': 1, '50-54': 0, '85-89': 3, '90-100': 4},
    statusCounts: {Pass: null} };
  const second = {reported: 12, reportedKind: 'Reported', high: 95, low: 51,
    distribution: {'<50': null, '50-54': 0, '85-89': 5, '90-100': 7} };
  const result = aggregateDistributions([first, second]);
  assert.equal(result.reported,22);
  assert.equal(result.high,95);
  assert.equal(result.low,30);
  assert.deepEqual(result.bins.find(x=>x.key==='90-100').value, 11);
  assert.equal(result.bins.find(x=>x.key==='50-54').value, 0);
  assert.equal(result.bins.find(x=>x.key==='50-54').incomplete, false);
  assert.equal(result.bins.find(x=>x.key==='<50').value, 1);
  assert.equal(result.bins.find(x=>x.key==='<50').incomplete, true);
  assert.equal(result.bins.find(x=>x.key==='68-71').value, null);
  assert.equal(result.fullyPublished,false);
});

test('section metadata normalizes medians, high lows and suppressed distribution safely', () => {
  const p=normalizeProfile({stats: {average: 75, max_grade: 100, min_grade: 24}, recentSections: [{yearsession: '2024W', section: '101', average: 75, reported: '32', high: '100', low:'24', median:'75', p25:'66', p75:'82', distribution: {'<50': '', '80-84': '0', '90-100': '6'}}]});
  const x=p.recentSections[0];
  assert.equal(p.highMark, 100);assert.equal(p.lowMark, 24);
  assert.equal(x.median,75);assert.equal(x.distribution['<50'],null);
  assert.equal(x.distribution['80-84'],0);
  assert.equal(x.distribution['90-100'],6);
});


test('pass rate uses graded outcomes only, not withdrawals or missing modern data', () => {
  const older = aggregateDistributions([{reported:100, reportedKind:'Enrolled', statusCounts:{Pass:80,Fail:10,Withdrew:10}}]);
  assert.ok(Math.abs(older.passRate - 88.8888889) < 0.0001);
  assert.equal(older.passRateSource,'status');
  const newer = aggregateDistributions([{reported:100, reportedKind:'Reported', statusCounts:{Pass:null,Fail:null}}]);
  assert.equal(newer.passRate,null);
  const complete = { '<50':2, '50-54':3, '55-59':0, '60-63':4, '64-67':0,
    '68-71':1, '72-75':0, '76-79':0, '80-84':5, '85-89':0, '90-100':5 };
  const gradeBands = aggregateDistributions([{reported:20,reportedKind:'Reported',distribution:complete,statusCounts:{}}]);
  assert.equal(gradeBands.passRate,90);
  assert.equal(gradeBands.passRateSource,'grade-bands');
  const withheld = aggregateDistributions([{reported:20,reportedKind:'Reported',distribution:{...complete,'<50':null},statusCounts:{}}]);
  assert.equal(withheld.passRate,null);
  assert.equal(withheld.passRateSource,null);
});

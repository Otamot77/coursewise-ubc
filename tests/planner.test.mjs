import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_BANDS } from '../lib/grades.mjs';
import { chooseDistribution, gradeAtPercentile, percentileForGrade, calculateGradePlan } from '../lib/planner.mjs';

const uniform = { bins: Array(11).fill(10), n: 110 };
const concentrated = (index, count = 100) => {
  const bins = Array(11).fill(0); bins[index] = count;
  return { bins, n:count };
};
const section = (yearsession, distribution, section='101') => ({ yearsession, section, distribution });
const bins = (value=0) => Object.fromEntries(GRADE_BANDS.map(b => [b.key, value]));

test('complete latest term is preferred; suppressed bins are not silently assumed zero', () => {
  const good={...bins(0), '76-79':20};
  const missing={...bins(0), '76-79':null, '80-84':12};
  const profile={recentSections:[section('2025W',missing),section('2024W',good)],coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:1},{yearsession:'2024W',sectionsTotal:1}]}};
  assert.equal(chooseDistribution(profile)?.session, '2024W');
  assert.equal(chooseDistribution({recentSections:[section('2025W',missing)]}),null);
});

test('never double-count OVERALL and do not use truncated term or cherry-picked sections', () => {
  const good={...bins(0), '80-84':16};
  const profile={recentSections:[section('2025W',good,'101'),section('2025W',good,'OVERALL'),section('2024W',good,'101')],coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:2},{yearsession:'2024W',sectionsTotal:1}]}};
  const dist=chooseDistribution(profile);
  assert.equal(dist.session,'2024W');
  assert.equal(dist.n,16);
  assert.equal(chooseDistribution({recentSections:[section('2025W',good,'101'),section('2025W',good,'OVERALL')],coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:1}]}}).n,16);
});

test('quantile and reverse percentile interpolate the published grade bands', () => {
  const dist=concentrated(7); // 76–79%: continuous interval 76–80
  assert.equal(gradeAtPercentile(dist,0.5),78);
  assert.equal(percentileForGrade(dist,78),50);
  assert.equal(gradeAtPercentile(dist,0),76);
  assert.equal(gradeAtPercentile(dist,1),80);
  assert.equal(gradeAtPercentile(null,0.5),null);
  assert.equal(percentileForGrade(dist,105),null);
});

test('the historical 50 + 99 example has a 74.5% baseline, not equal 75% per course', () => {
  const result=calculateGradePlan([
    {id:'A',credits:3,average:50,distribution:concentrated(0),fixedGrade:51},
    {id:'B',credits:3,average:99,distribution:concentrated(10)}
  ],75);
  assert.equal(result.baseline,74.5);
  assert.equal(result.requiredFlexibleAverage,99);
  assert.equal(result.status,'ready');
  assert.ok(Math.abs(result.rows.find(x=>x.id==='B').grade-99)<1e-6);
  assert.ok(Math.abs(result.achieved-75)<1e-6);
});

test('unequal credits, completed grades and changing a fixed course dynamically rebalance others', () => {
  const items=[{id:'math',credits:6,average:60,distribution:concentrated(5),fixedGrade:80},
    {id:'arts',credits:3,average:80,distribution:concentrated(10)}];
  const result=calculateGradePlan(items,85);
  assert.equal(result.baseline,(6*60+3*80)/9);
  assert.equal(result.requiredFlexibleAverage,95);
  assert.ok(Math.abs(result.rows.find(x=>x.id==='arts').grade-95)<1e-6);
  assert.equal(result.status,'ready');
  const revised=calculateGradePlan([{...items[0],fixedGrade:70},items[1]],85);
  assert.equal(revised.status,'impossible');
  assert.ok(revised.requiredFlexibleAverage>100);
});

test('no invented percentile when a flexible course is missing a distribution', () => {
  const result=calculateGradePlan([{id:'A',credits:3,average:70,distribution:uniform},
    {id:'B',credits:3,average:80,distribution:null}],75);
  assert.equal(result.baseline,75);
  assert.equal(result.status,'missing');
  assert.deepEqual(result.missing,['B']);
  assert.equal(result.percentile,null);
  assert.equal(result.rows[0].grade,null);
  assert.equal(result.requiredFlexibleAverage,75);
});

test('equal-percentile strategy cannot always match a target, even if mathematically reachable', () => {
  const result=calculateGradePlan([
    {id:'A',credits:3,average:80,distribution:concentrated(9)},
    {id:'B',credits:3,average:80,distribution:concentrated(9)}
  ],70);
  assert.equal(result.status,'outside-common');
  assert.equal(result.feasibleCommon,false);
  assert.ok(result.range.min>70);
});

test('all fixed grades compute actual weighted result, not an artificial percentile', () => {
  const result=calculateGradePlan([{id:'A',credits:3,average:null,distribution:null,fixedGrade:90},
    {id:'B',credits:6,average:null,distribution:null,fixedGrade:60}],75);
  assert.equal(result.status,'all-fixed');
  assert.equal(result.achieved,70);
  assert.equal(result.percentile,null);
  assert.equal(result.baseline,null);
});

test('exact zero percentiles and grades remain valid inputs', () => {
  const p=calculateGradePlan([{id:'A',credits:3,average:50,distribution:concentrated(0),fixedGrade:0}],0);
  assert.equal(p.achieved,0);assert.equal(p.rows[0].grade,0);
  assert.equal(calculateGradePlan([{id:'A',credits:0,average:50}],75).status,'invalid');
});

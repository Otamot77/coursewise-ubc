import test from 'node:test';
import assert from 'node:assert/strict';
import { courseComparison, standingAtGrade } from '../lib/comparison.mjs';
import { GRADE_BANDS } from '../lib/grades.mjs';
const b = counts => Object.fromEntries(GRADE_BANDS.map((x,i)=>[x.key,counts[i]]));
const one = (session, gradeBands, extra={}) => ({yearsession:session,section:'101',reported:40,reportedKind:'Reported',distribution:b(gradeBands),...extra});
const dist={session:'2025W',bins:[0,0,0,0,0,0,0,10,20,10,0],n:40};
test('percentile at band lower boundaries is exact; interior is an explicit interval',()=>{
  const at80 = standingAtGrade(dist,80);
  assert.equal(at80.exact,true);
  assert.equal(at80.percentBelow,25); // 10 in 76-79, the rest >=80
  const at82 = standingAtGrade(dist,82);
  assert.equal(at82.exact,false);
  assert.equal(at82.lowerBound,25);
  assert.equal(at82.upperBound,75);
  assert.equal(at82.percentBelow,45);
  assert.equal(standingAtGrade(dist,90).percentBelow,100);
  const top = standingAtGrade({session:'2025W',bins:[0,0,0,0,0,0,0,0,0,0,10],n:10},100);
  assert.equal(top.exact,false);
  assert.ok(top.percentBelow<100);
});
test('bad or incomplete band counts must not fabricate a percentile',()=>{
  assert.equal(standingAtGrade({...dist,bins:[0,0,0,0,0,0,0,null,20,10,0]},80),null);
  assert.equal(standingAtGrade({...dist,n:100},80),null);
  assert.equal(standingAtGrade(dist,110),null);
});
test('prefer published single-section median & quartiles for current term',()=>{
  const profile={average:71,average5:73,high:82,low:64,highMark:99,lowMark:2,
   history:[{yearsession:'2024W',average:72},{yearsession:'2025W',average:74}],
   recentSections:[one('2025W',dist.bins,{median:81,p25:73,p75:86,reported:40})],
   coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:1}]}};
  const s=courseComparison(profile,80);
  assert.equal(s.quartiles.method,'published section');
  assert.equal(s.quartiles.median,81);
  assert.equal(s.quartiles.p25,73);
  assert.equal(s.quartiles.p75,86);
  assert.equal(s.latestStudents,40);
  assert.equal(s.standing.percentBelow,25);
  assert.equal(s.latestMean,74);
});
test('multiple sections use a full term estimated median, never cherry pick a section',()=>{
  const profile={history:[{yearsession:'2025W',average:78}], recentSections:[
    one('2025W',[0,0,0,0,0,0,0,20,20,0,0],{section:'101',median:80}),
    one('2025W',[0,0,0,0,0,0,0,20,20,0,0],{section:'102',median:90})],
    coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:2}]}};
  const s=courseComparison(profile,82);
  assert.equal(s.latestStudents,80);
  assert.equal(s.quartiles.method,'estimated from complete grade bands');
  assert.equal(s.quartiles.median,80);
  assert.ok(s.standing.percentBelow > 50);
});
test('suppressed newer term can show its published section median but no invented rank',()=>{
 const missing=[0,0,0,0,0,0,0,null,20,10,0];
 const profile={recentSections:[one('2025W',missing,{median:83,reported:40})],history:[{yearsession:'2025W',average:80}],coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:1}]}};
 const s=courseComparison(profile,80);
 assert.equal(s.quartiles.median,83);
 assert.equal(s.quartiles.p25,null);
 assert.equal(s.standing,null);
});
test('truncated newest term is not used for percentile calculation',()=>{
 const profile={recentSections:[one('2025W',dist.bins)],coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:2}]}};
 const s=courseComparison(profile,80);
 assert.equal(s.latestStudentsPartial,true);
 assert.equal(s.standing,null);
});

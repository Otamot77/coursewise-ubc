import {test} from 'node:test';
import assert from 'node:assert/strict';
import { selectTermSections, coursePassport, attainmentAtGrade, historicalConsistency } from '../lib/passport.mjs';
import { GRADE_BANDS } from '../lib/grades.mjs';
const row=(section,dist=Array(11).fill(1))=>({yearsession:'2025W',section,distribution:Object.fromEntries(GRADE_BANDS.map((b,i)=>[b.key,dist[i]])),reported:dist.reduce((a,b)=>a+(b??0),0),average:75,median:73,source:'test',educators:[]});
const profile={recentSections:[row('101'),row('OVERALL',Array(11).fill(10))],coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:1,average:75}]},history:[{yearsession:'2023W',average:70},{yearsession:'2024W',average:73},{yearsession:'2025W',average:75}]};
test('Passport never combines OVERALL with explicit sections',()=>{
  assert.deepEqual(selectTermSections(profile,'2025W').rows.map(x=>x.section),['101']);
  const passport=coursePassport(profile,{target:85});
  assert.equal(passport.sampleSize,11);
  assert.equal(passport.median,73);
  assert.equal(passport.thresholds[85].exact,true);
  assert.ok(Math.abs(passport.thresholds[85].atOrAbove-2/11*100)<1e-9);
});
test('a boundary has an exact count but points within a range only have bounds',()=>{
  const d={session:'2025W',bins:[0,0,0,0,0,0,0,0,5,3,2],n:10};
  assert.equal(attainmentAtGrade(d,85).atOrAbove,50);
  assert.equal(attainmentAtGrade(d,85).exact,true);
  const inside=attainmentAtGrade(d,87);
  assert.equal(inside.exact,false);
  assert.equal(inside.atLeastLower,20);
  assert.equal(inside.atLeastUpper,50);
  assert.equal(attainmentAtGrade(d,100).exact,false);
});
test('withheld grade counts do not create a made-up percentile',()=>{
  const p={...profile,recentSections:[row('101',[1,null,...Array(9).fill(1)])]};
  const report=coursePassport(p,{term:'2025W'});
  assert.equal(report.complete,false);
  assert.equal(report.target,null);
  assert.equal(report.thresholds[80],null);
});
test('truncated course terms cannot produce a full-term passport',()=>{
  const p={...profile,coverage:{sessionDetails:[{yearsession:'2025W',sectionsTotal:3}]}};
  assert.equal(coursePassport(p).complete,false);
  assert.equal(coursePassport(p,{term:'2025W',section:'101'}).complete,true);
});
test('consistency uses variation of academic term averages, not individual marks',()=>{
  const c=historicalConsistency(profile);
  assert.equal(c.range,5);
  assert.equal(c.termCount,3);
  assert.equal(historicalConsistency({history:profile.history.slice(0,2)}),null);
});


test('target 100 is an estimate, not a falsely exact percentile',()=>{
  const d={session:'2025W',bins:[0,0,0,0,0,0,0,0,0,0,11],n:11};
  const result=attainmentAtGrade(d,100);
  assert.equal(result.exact,false);
  assert.equal(result.atLeastLower,0);
  assert.equal(result.atLeastUpper,100);
  assert.ok(result.atOrAbove>0 && result.atOrAbove<100);
});

test('selection from old terms is labeled with its actual academic years',()=>{
  const old={history:[{yearsession:'1999W',average:60},{yearsession:'2000W',average:70},{yearsession:'2001W',average:65}]};
  const c=historicalConsistency(old);
  assert.equal(c.first,'1999W');
  assert.equal(c.last,'2001W');
  assert.equal(c.range,10);
});

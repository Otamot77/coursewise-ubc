import test from 'node:test';
import assert from 'node:assert/strict';
import { completedCourseStanding } from '../lib/completed.mjs';
const dist=(session='2024W')=>({session,n:100,bins:[5,5,5,5,5,5,5,5,20,20,20]});
test('only explicitly completed courses with real final grades count',()=>{
 const res=completedCourseStanding([
  {id:'a',label:'A',finalGrade:80,credits:3,completed:true,distribution:dist()},
  {id:'b',label:'B',finalGrade:90,credits:4,completed:false,distribution:dist()},
  {id:'c',label:'C',finalGrade:null,credits:3,completed:true,distribution:dist()}]);
 assert.equal(res.total,1);assert.equal(res.covered,1);assert.equal(res.standing,40);assert.equal(res.topShare,60);
});
test('missing and suppressed distributions excluded and surfaced rather than treated as zero',()=>{
 const res=completedCourseStanding([
  {id:'a',finalGrade:80,credits:3,completed:true,distribution:dist()},
  {id:'b',finalGrade:85,credits:4,completed:true,distribution:null}]);
 assert.equal(res.status,'partial');assert.equal(res.total,2);assert.equal(res.covered,1);
 assert.equal(res.rows[1].available,false);assert.equal(res.standing,40);
});
test('weights available courses by credits and keeps their individual standing provenance',()=>{
 const res=completedCourseStanding([
  {id:'a',finalGrade:80,credits:2,completed:true,distribution:dist('2020W')},
  {id:'b',finalGrade:85,credits:4,completed:true,distribution:dist('2022W')}]);
 assert.equal(res.standing,(40*2+60*4)/6);assert.equal(res.rows[0].evidence.session,'2020W');
 assert.equal(res.rows[1].evidence.exact,true);
});
test('empty and all-unavailable completed collections have no fictitious percentile',()=>{
 assert.equal(completedCourseStanding([]).standing,null);
 const r=completedCourseStanding([{id:'x',completed:true,finalGrade:95,credits:3,distribution:null}]);
 assert.equal(r.status,'unavailable');assert.equal(r.topShare,null);
});

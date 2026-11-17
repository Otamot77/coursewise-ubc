import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findCourseMatches,parseCourseQuery,normalizeCourseQuery} from '../lib/course-search.mjs';
const courses=[
  {campus:'UBCV',subject:'CPSC',course:'110',title:'Computation, Programs and Programming'},
  {campus:'UBCV',subject:'MATH',course:'100',title:'Differential Calculus'},
  {campus:'UBCV',subject:'CPEN',course:'221A',title:'Software Construction'},
  {campus:'UBCV',subject:'CPEN',course:'221',title:'Software Construction (older)'},
  {campus:'UBCO',subject:'CPSC',course:'110',title:'Okanagan Computing'}
];
test('a valid-looking fabricated code is not a course',()=>{
  assert.deepEqual(findCourseMatches(courses,'UBCV','FFFF222'),{found:false,course:null,suggestions:[]});
});
test('exact course lookup accepts common input formats and respects campus',()=>{
  assert.equal(findCourseMatches(courses,'UBCV','cpsc110').course.course,'110');
  assert.equal(findCourseMatches(courses,'UBCO','cpsc_v 110').found,true); // Workday-style code is understood
  assert.equal(findCourseMatches(courses,'UBCO','cpsc 110').course.campus,'UBCO');
  assert.equal(normalizeCourseQuery('  math_  100  '),'MATH 100');
  assert.deepEqual(parseCourseQuery('CPEN 221A'),{subject:'CPEN',course:'221A'});
});
test('typos suggest existing courses but do not authorize navigation',()=>{
  let result=findCourseMatches(courses,'UBCV','MTAH 100');
  assert.equal(result.found,false);
  assert.equal(result.suggestions[0].subject,'MATH');
  result=findCourseMatches(courses,'UBCV','CPEN 222');
  assert.equal(result.found,false);
  assert.ok(result.suggestions.some(x=>x.course==='221'));
  assert.ok(result.suggestions.every(x=>!('recentSections' in x)));
});
test('title searches return clickable suggestions; unrelated text does not fabricate results',()=>{
  assert.equal(findCourseMatches(courses,'UBCV','differential calculus').suggestions[0].subject,'MATH');
  assert.equal(findCourseMatches(courses,'UBCV','nonsense-nope').suggestions.length,0);
});

test('a course present only at the other UBC campus is suggested, never falsely matched',()=>{
  const result=findCourseMatches(courses,'UBCO','MATH 100');
  assert.equal(result.found,false);
  assert.equal(result.suggestions[0].campus,'UBCV');
  assert.equal(result.suggestions[0].course,'100');
});

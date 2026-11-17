import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_BANDS } from '../lib/grades.mjs';
import { availableInstructorTerms, compareInstructors, instructorPeriod } from '../lib/instructors.mjs';

const counts = (n=0) => Object.fromEntries(GRADE_BANDS.map(b => [b.key, n]));
const section = (yearsession, code, average, size, educators, distribution=counts(10)) => ({
  yearsession, section:code, average, reported:size, reportedKind:'Reported', educators, distribution
});

test('student-weighted averages, matched-term reference and high/low are descriptive', () => {
 const p={recentSections:[
  section('2025W','101',60,20,['Ada']),section('2025W','102',80,80,['Ada']),
  section('2025W','103',70,100,['Bert']),section('2024W','101',95,30,['Bert'])]};
 const result=compareInstructors(p);
 const ada=result.instructors.find(p=>p.name==='Ada');
 assert.equal(ada.sections,2);assert.equal(ada.average,76);
 assert.equal(ada.low,60);assert.equal(ada.high,80);
 assert.equal(ada.referenceAverage,73);assert.equal(ada.difference,3);
 assert.equal(ada.students,100);assert.equal(ada.partialStudents,false);
 assert.equal(ada.distribution.total,220);assert.equal(ada.distribution.sections,2);
});

test('shared sections count for each named person but never twice for same person', () => {
 const p={recentSections:[section('2025W','101',82,30,['Ada','Bert','ada']),section('2025W','102',90,20,['Ada'])]};
 const groups=compareInstructors(p).instructors;
 assert.equal(groups.find(g=>g.name==='Ada').sections,2);
 assert.equal(groups.find(g=>g.name==='Ada').shared,1);
 assert.equal(groups.find(g=>g.name==='Bert').sections,1);
 assert.equal(groups.find(g=>g.name==='Bert').shared,1);
});

test('source missing averages and suppressed bins are not treated as zero', () => {
 const partial={...counts(5), '85-89': null};
 const p={recentSections:[section('2025W','101',null,10,['Ada'], partial), section('2025W','102',70,null,['Ada'], counts(2))]};
 const ada=compareInstructors(p).instructors[0];
 assert.equal(ada.average,70);assert.equal(ada.graded,1);
 assert.equal(ada.students,null);assert.equal(ada.partialStudents,true);
 assert.equal(ada.distribution.sections,1);assert.equal(ada.distribution.total,22);
});

test('five academic years, individual terms and OVERALL exclusion', () => {
 const p={recentSections:[
  section('2025W','101',75,100,['Ada']), section('2025W','OVERALL',55,100,['Fake']),
  section('2024S','101',70,100,['Ada']), section('2020W','101',60,100,['Bert']),
  section('2016W','OVERALL',65,100,['Cara'])]};
 assert.deepEqual(availableInstructorTerms(p),['2025W','2024S','2020W','2016W']);
 assert.deepEqual(compareInstructors(p,'2025W').instructors.map(g=>g.name),['Ada']);
 assert.deepEqual(compareInstructors(p).instructors.map(g=>g.name),['Ada']);
 assert.deepEqual(compareInstructors(p,'all').instructors.map(g=>g.name),['Ada','Bert','Cara']);
 assert.equal(compareInstructors(p,'all').sections,4);
});

test('fallback to unweighted when section sizes are incomplete, and missing attribution stays unknown',()=>{
 const p={recentSections:[section('2024W','101',60,null,['Ada']),section('2024W','102',80,100,['Ada']),section('2024W','103',90,100,[])]};
 const result=compareInstructors(p,'all');
 const ada=result.instructors[0];
 assert.equal(ada.average,70);
 assert.equal(ada.method,'unweighted section means');
 assert.equal(ada.students,100);assert.equal(ada.partialStudents,true);
 assert.equal(result.unassigned,1);
});

test('empty or upstream API profile produces no invented instructor stats',()=>{
 assert.deepEqual(compareInstructors(null).instructors,[]);
 assert.deepEqual(compareInstructors({teachingTeam:[{name:'Ada'}]}).instructors,[]);
 assert.deepEqual(instructorPeriod([]),[]);
});

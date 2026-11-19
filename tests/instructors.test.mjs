import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_BANDS } from '../lib/grades.mjs';
import { availableInstructorTerms, compareInstructors, instructorPeriod, instructorReport } from '../lib/instructors.mjs';

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


test('full instructor section reports contain retained rows independent of comparison period',()=>{
 const p={recentSections:[
  {...section('2025W','101',70,100,['Ada','Bert']),median:72,p25:61,p75:83,stdDev:null},
  {...section('2019W','101',65,50,['Ada']),median:null,p25:null,p75:null,stdDev:12.4},
  section('2025W','102',80,60,['Bert'])
 ]};
 const full=instructorReport(p,'ada');
 assert.equal(full.name,'Ada');
 assert.equal(full.sections,2);
 assert.equal(full.graded,2);
 assert.equal(full.shared,1);
 assert.equal(full.sizeTotal,150);
 assert.deepEqual(full.terms,['2025W','2019W']);
 assert.ok(full.rows.some(r=>r.stdDev===12.4));
 assert.deepEqual(full.history.map(h=>h.session),['2019W','2025W']);
 assert.ok(Math.abs(full.mean-(70*100+65*50)/150)<1e-6);
 const term=instructorReport(p,'Ada','2025W');
 assert.equal(term.sections,1);
 assert.equal(term.mean,70);
 assert.equal(term.totalFromArchive,2);
 assert.equal(instructorReport(p,'Ada','2023W'),null);
 assert.equal(instructorReport(p,'Unknown'),null);
});

test('instructor report with withheld grades retains section but excludes incomplete histogram',()=>{
 const partial={...counts(2), '80-84':null};
 const r=instructorReport({recentSections:[section('2025W','101',75,40,['Ada'],partial)]},'Ada');
 assert.equal(r.sections,1);
 assert.equal(r.distribution.sections,0);
 assert.equal(r.distribution.percentages,null);
 assert.equal(r.distribution.total,0);
});


test('matched-term differences use percentage points, exclude unmatched academic terms, and use consistent weights', () => {
  const p={recentSections:[
    section('2025W','101',60,20,['Ada']),
    section('2025W','102',80,80,['Ada']),
    section('2025W','103',70,null,['Bert']),
    section('2024W','101',99,100,['Bert'])
  ]};
  const ada=compareInstructors(p,'all').instructors.find(x=>x.name==='Ada');
  // Bert's 2024W section is not an appropriate comparator for Ada.
  // Because Bert's 2025W size is unknown, BOTH averages are unweighted.
  assert.equal(ada.average,70);
  assert.equal(ada.referenceAverage,70);
  assert.equal(ada.difference,0);
  assert.equal(ada.method,'unweighted section means');
  assert.equal(ada.referenceMethod,ada.method);
  assert.deepEqual(ada.matchedTerms,['2025W']);
  assert.equal(ada.referenceSections,3);
  const full=instructorReport(p,'Ada');
  assert.equal(full.difference,0);
  assert.equal(full.referenceAverage,70);
  assert.equal(full.referenceSections,3);
  const term=instructorReport(p,'Bert','2024W');
  assert.equal(term.average,undefined);
  assert.equal(term.mean,99);
  assert.equal(term.referenceAverage,99);
  assert.equal(term.referenceSections,1);
});

test('a missing published instructor mean does not invent a same-term difference',()=>{
  const p={recentSections:[section('2025W','101',null,50,['Ada']), section('2025W','102',72,80,['Bert'])]};
  const ada=compareInstructors(p,'all').instructors.find(x=>x.name==='Ada');
  assert.equal(ada.difference,null);
  assert.equal(ada.referenceAverage,null);
  assert.deepEqual(ada.matchedTerms,[]);
  const full=instructorReport(p,'Ada');
  assert.equal(full.difference,null);
  assert.equal(full.referenceAverage,null);
});

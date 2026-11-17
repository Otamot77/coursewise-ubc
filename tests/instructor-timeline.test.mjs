import {test} from 'node:test';
import assert from 'node:assert/strict';
import {instructorTimelineSvg} from '../lib/charts.mjs';
test('instructor timeline shows individual sessions against matching course means',()=>{
 const svg=instructorTimelineSvg([{session:'2024W',average:80,sections:1},{session:'2025W',average:71,sections:2}],[{yearsession:'2024W',average:75},{yearsession:'2025W',average:70}]);
 assert.match(svg,/instructor-timeline-svg/);assert.match(svg,/Instructor sections/);assert.match(svg,/Whole-course term mean/);
 assert.match(svg,/2024W: recorded instructor section mean 80.0%/);
 assert.match(svg,/course mean 75.0%/);
});
test('missing course means are not invented in instructor timeline',()=>{
 const svg=instructorTimelineSvg([{session:'2025W',average:64,sections:1}],[]);
 assert.match(svg,/2025W/);assert.doesNotMatch(svg,/course mean 0.0%/);
});

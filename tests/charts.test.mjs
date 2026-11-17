import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeDistributionSvg,historyTrendSvg,compactTrendSvg} from '../lib/charts.mjs';
import {GRADE_BANDS} from '../lib/grades.mjs';
const rows = GRADE_BANDS.map((b,i)=>({...b,value: i === 8 ? 23 : i === 9 ? 13 : 0,incomplete:false}));
test('published counts render as nonzero explicit SVG rectangles independent of CSS layout',()=>{
  const svg=gradeDistributionSvg(rows);
  assert.match(svg,/<svg/);
  assert.match(svg,/class="distribution-svg-bar" data-count="23"/);
  assert.match(svg,/class="distribution-svg-bar" data-count="13"/);
  assert.match(svg,/height="[1-9][0-9.]*" rx="3" fill="#239c79"/);
  assert.match(svg,/80-84/);
  assert.match(svg,/A−/);
  assert.doesNotMatch(svg,/style="height:/);
});
test('withheld is not a zero and partial counts are labeled lower bounds',()=>{
  const bins=rows.map(r=>({...r}));
  bins[0].value=null;
  bins[3].value=3;bins[3].incomplete=true;
  const svg=gradeDistributionSvg(bins);
  assert.match(svg,/N\/A/);
  assert.match(svg,/≥ 3/);
  assert.match(svg,/url\(#cw-partial-bar\)/);
});
test('historical line graph exposes term labels and scaled axis',()=>{
  const rows=[{yearsession:'2023W',average:77.1},{yearsession:'2024W',average:80.1},{yearsession:'2025W',average:80.3}];
  const html=historyTrendSvg(rows);
  assert.match(html,/<polyline/);
  assert.match(html,/2023W/);
  assert.match(html,/2025W: 80.3%/);
  assert.match(html,/\d+\.\d%/);
  assert.match(compactTrendSvg(rows),/Historical course mean trend/);
});

test('historical mean points include an accessible designed hover and keyboard tooltip',()=>{
  const svg=historyTrendSvg([{yearsession:'2023W',average:77.1},{yearsession:'2024W',average:80.1},{yearsession:'2025W',average:80.3}]);
  assert.match(svg,/class="history-point" tabindex="0" role="group"/);
  assert.match(svg,/aria-label="2025W: 80.3%"/);
  assert.match(svg,/class="history-hover-tooltip"/);
  assert.match(svg,/fill="#183b37"/);
  assert.match(svg,/80\.3% <tspan/);
  assert.doesNotMatch(svg,/<circle[^>]+><title>/);
});

test('instructor distributions render actual SVG bars on a shared percent scale',async()=>{
  const {instructorDistributionSvg}=await import('../lib/charts.mjs');
  const first=[0,0,0,0,10,11,12,10,14,22,21];
  const second=[15,10,8,8,10,10,10,11,11,4,3];
  const output=instructorDistributionSvg(first,first.map(x=>x*50),{scaleMax:22,title:'Instructor A'});
  const peer=instructorDistributionSvg(second,second.map(x=>x*30),{scaleMax:22,title:'Instructor B'});
  assert.match(output,/class="instructor-dist-svg"/);
  assert.match(output,/class="instructor-dist-bar" data-percent="22\.00"/);
  assert.match(output,/height="108\.24"/);
  assert.match(peer,/data-percent="15\.00"/);
  assert.match(peer,/>25%<\/text>/); // top tick is identical for both charts
  assert.match(output,/>25%<\/text>/);
  assert.doesNotMatch(output,/style="height:/);
  assert.equal((output.match(/class="instructor-dist-bar"/g)||[]).length,11);
  assert.equal((peer.match(/class="instructor-dist-bar"/g)||[]).length,11);
  assert.match(output,/viewBox="0 0 482 190"/);
  assert.match(output,/tabindex="0" aria-label=/);
  assert.equal((output.match(/font-size="11" fill="#627f73"/g)||[]).length,11);
  assert.match(output,/width="22" height="108\.24"/);
  assert.match(output,/90\+/);
  assert.match(instructorDistributionSvg(null),/No complete published/);
});

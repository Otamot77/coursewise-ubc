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

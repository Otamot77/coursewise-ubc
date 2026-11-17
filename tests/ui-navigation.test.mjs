import test from 'node:test';
import assert from 'node:assert/strict';

// Rendering regression tests for the real app module. The original v0.7 bug
// was a ReferenceError *after* valid grade data returned, which API-only tests
// did not detect. These tests use a minimal DOM so CI needs no browser setup.
const COUNTS = { '<50': 0, '50-54': 2, '55-59': 0, '60-63': 0,
  '64-67': 1, '68-71': 1, '72-75': 2, '76-79': 6, '80-84': 23,
  '85-89': 13, '90-100': 1 };
const fixture = {
  stats: { course_title:'Test Course', average:79.2,
    average_past_5_yrs:78.9, max_course_avg:80.7,
    min_course_avg:77.1,max_grade:94,min_grade:10 },
  history: {yearsessions: {'2023W':77.1,'2024W':79.2,'2025W':80.3}},
  recentSections:[{yearsession:'2025W',section:'101',average:80.3,
    reported:49,reportedKind:'Reported',high:92,low:50,median:81,p25:80,p75:85,
    distribution:COUNTS,statusCounts:{},educators:['Prof Example'],source:'PAIR'}],
  coverage:{latestPublished:'2025W',yearsessions:3,sessionDetails:[{yearsession:'2025W',average:80.3,reported:49,sectionsTotal:1}]},
  teachingTeam:[{name:'Prof Example',yearsessions:{'2025W':['101']}}],
  sources:{stats:'local PAIR CSV'},relatedCodes:[]
};

class MockElement {
  constructor(id){
    this.id=id;this.value=id==='sortSelect'?'original':'UBCV';this.checked=false;
    this.hidden=false;this.textContent='';this.innerHTML='';this.dataset={};
    this.listeners=new Map();this.classList={toggle(){},add(){},remove(){}};
  }
  addEventListener(type, handler){this.listeners.set(type,handler);}
  setAttribute(){}
  querySelectorAll(){return [];}
  querySelector(){return null;}
}
let sequence=0;
const storage=new Map();
async function mount(path, search='') {
  const nodes=new Map();
  globalThis.document={
    getElementById(id){if(!nodes.has(id))nodes.set(id,new MockElement(id));return nodes.get(id);},
    querySelectorAll(){return []}
  };
  globalThis.window={location:{pathname:path}};
  globalThis.location={search};
  globalThis.localStorage={getItem(key){return storage.get(key)??null;},setItem(key,val){storage.set(key,val);}};
  const calls=[];
  globalThis.fetch=async (url)=>{
    calls.push(url);
    if(String(url).startsWith('/api/course?')) return new Response(JSON.stringify(fixture),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({error:'Unexpected URL'}),{status:404,headers:{'content-type':'application/json'}});
  };
  await import(`../assets/app.mjs?ui-test=${++sequence}`);
  // Let the asynchronously loaded API profile update the DOM.
  for (let tries=0;tries<40;tries++) {
    await new Promise(resolve=>setTimeout(resolve,2));
    if(path==='/course' && nodes.get('courseView')?.innerHTML.includes('grade-distribution-svg'))break;
    if(path==='/my-classes' && nodes.get('courseCards')?.innerHTML.includes('78.9%'))break;
  }
  return {nodes, calls, get:(id)=>nodes.get(id)};
}

test('full course report renders all loaded grade bands and section options without JavaScript errors',async()=>{
  const state=await mount('/course','?campus=UBCV&subject=ACAM&course=300');
  assert.equal(state.get('courseViewStatus').hidden,true);
  const html=state.get('courseView').innerHTML;
  assert.match(html,/Test Course/);
  assert.match(html,/grade-distribution-svg/);
  assert.match(html,/distribution-svg-bar/);
  assert.match(html,/Section 101/);
  assert.match(html,/80\.3%/);
  assert.match(html,/Reported students/);
});

test('My Classes restores saved courses and stats after navigating back from full report',async()=>{
  storage.set('coursewise:schedule:v1',JSON.stringify([{campus:'UBCV',subject:'ACAM',course:'300',sections:['101']} ]));
  const state=await mount('/my-classes');
  const html=state.get('courseCards').innerHTML;
  assert.match(html,/lineup-course/);
  assert.match(html,/78\.9%/);
  assert.match(html,/80\.3%/);
  assert.match(html,/Test Course/);
  assert.match(state.get('dataStatus').textContent,/1 courses with data/);
  assert.equal(state.get('courseCount').textContent,1);
});

test('course reports show the new instructor bar chart and explain term-matched comparison',async()=>{
  const state=await mount('/course','?campus=UBCV&subject=ACAM&course=300');
  const html=state.get('courseView').innerHTML;
  assert.match(html,/instructor-dist-svg/);
  assert.match(html,/instructor-dist-bar/);
  assert.match(html,/Difference vs course/);
  assert.match(html,/academic terms they taught/);
  assert.match(html,/history-hover-tooltip/);
});

test('sticky navigation, Grade Goals shortcut and credit explanation are present on all pages',async()=>{
  const {readFileSync}=await import('node:fs');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../assets/styles.css',import.meta.url),'utf8');
  assert.match(html,/Know your courses/);
  assert.match(html,/compare instructors, import your Workday schedule/i);
  assert.match(html,/id="plannerJump" href="#gradePlanner"/);
  assert.match(html,/1\.5-credit courses/);
  assert.match(css,/\.site-header\{position:sticky;top:0;z-index:90/);
  assert.match(css,/\.desktop-nav a\{height:44px;flex:0 0 auto!important;display:flex!important/);
  assert.match(css,/\.history-point:hover \.history-hover-tooltip/);
});

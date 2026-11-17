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
  addEventListener(type, handler){const previous=this.listeners.get(type);this.listeners.set(type, previous ? (...args)=>{previous(...args);handler(...args);} : handler);}
  setAttribute(){}
  scrollIntoView(){}
  querySelectorAll(){return [];}
  querySelector(selector){
    if (this.id === 'courseView' && selector === '#instructor-comparison') {
      const host=this;
      // A minimal replacement host to exercise delegated events without JSDOM.
      return {set outerHTML(value){host.innerHTML=value;}};
    }
    return null;
  }
}
let sequence=0;
const storage=new Map();
async function mount(path, search='', missing=false) {
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
    if(String(url).startsWith('/api/course?')) return new Response(JSON.stringify(missing?{error:'Course not found in the local grade archive.'}:fixture),{status:missing?404:200,headers:{'content-type':'application/json'}});
    if(String(url).startsWith('/api/course-search?')) return new Response(JSON.stringify({found:false,course:null,suggestions:[{campus:'UBCV',subject:'MATH',course:'100',title:'Differential Calculus'}]}),{status:200,headers:{'content-type':'application/json'}});
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
  assert.match(html,/GRADE DIFFICULTY PASSPORT/);
  assert.match(html,/Target grade/);
  assert.match(html,/80%\+/);
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

test('instructor list prioritizes full section reports; comparison is secondary and two-way',async()=>{
  const state=await mount('/course','?campus=UBCV&subject=ACAM&course=300');
  const html=state.get('courseView').innerHTML;
  assert.match(html,/Instructor section histories/);
  assert.match(html,/View full report →/);
  assert.match(html,/data-instructor-name="Prof Example"/);
  assert.match(html,/Compare selected \(0\/2\)/);
  assert.doesNotMatch(html,/instructor-dist-svg/); // Optional comparison starts closed.
  assert.match(html,/vs same-term/);
  assert.match(html,/history-hover-tooltip/);
  assert.match(html,/section-stats-visible/);
  assert.match(html,/Highest and lowest course-term averages/);
  assert.doesNotMatch(html,/Grade spread \(std\. dev\.\)/);
  assert.match(html,/Median grade/);
  assert.match(html,/25th percentile/);
  assert.match(html,/Grades ≥ 50%/);
  assert.doesNotMatch(html,/<summary>More section statistics/);
  // The historical summary must not repeat individual highest/lowest marks.
  const historical=html.match(/<section class="historical-stat-summary"[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(historical);
  assert.doesNotMatch(historical,/Highest individual mark|Lowest individual mark/);
});

test('deep-linked instructor full report shows section results and distribution',async()=>{
  const state=await mount('/course','?campus=UBCV&subject=ACAM&course=300&instructor=Prof%20Example');
  const html=state.get('courseView').innerHTML;
  assert.match(html,/id="instructor-report"/);
  assert.match(html,/INSTRUCTOR SECTION REPORT/);
  assert.match(html,/Prof Example/);
  assert.match(html,/Section-by-section results/);
  assert.match(html,/data-instructor-report-term/);
  assert.doesNotMatch(html,/Grade spread \(SD\)/);
  assert.match(html,/Find on Rate My Professors/);
  assert.match(html,/grade-distribution-svg/);
  assert.match(html,/80\.3%/);
  assert.match(html,/2025W/);
});


test('clicking View full report opens educator section data; closing restores instructor roster',async()=>{
  const state=await mount('/course','?campus=UBCV&subject=ACAM&course=300');
  const onClick=state.get('courseView').listeners.get('click');
  const targetFor=(selector,value)=>({closest:asked=>asked===selector?value:null});
  onClick({target:targetFor('[data-instructor-report]',{dataset:{instructorReport:'UBCV:ACAM:300',instructorName:'Prof Example'}})});
  const report=state.get('courseView').innerHTML;
  assert.match(report,/id="instructor-report"/);
  assert.match(report,/Grade distribution across these sections/);
  assert.match(report,/80\.3%/);
  assert.match(report,/Section-by-section results/);
  onClick({target:targetFor('[data-instructor-close]',{dataset:{instructorClose:'UBCV:ACAM:300'}})});
  const restored=state.get('courseView').innerHTML;
  assert.match(restored,/Instructor section histories/);
  assert.doesNotMatch(restored,/id="instructor-report"/);
});

test('optional comparison is initially closed, can be opened, and documents two maximum',async()=>{
  const state=await mount('/course','?campus=UBCV&subject=ACAM&course=300');
  const onClick=state.get('courseView').listeners.get('click');
  assert.doesNotMatch(state.get('courseView').innerHTML,/class="instructor-dist-svg"/);
  onClick({target:{closest:selector=>selector==='[data-instructor-toggle-compare]'?{dataset:{instructorToggleCompare:'UBCV:ACAM:300'}}:null}});
  assert.match(state.get('courseView').innerHTML,/Tick one or two instructors/);
  assert.match(state.get('courseView').innerHTML,/Hide comparison/);
  assert.match(state.get('courseView').innerHTML,/0 of 2 selected/);
  const src=(await import('node:fs')).readFileSync(new URL('../assets/app.mjs',import.meta.url),'utf8');
  assert.match(src,/state\.picks\.length < 2/);
  assert.match(src,/Maximum two instructors/);
  assert.doesNotMatch(src,/Maximum three instructors/);
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

test('comparison table shows median/quartiles/high-low and recalculates the percentile threshold',async()=>{
  storage.set('coursewise:schedule:v1',JSON.stringify([{campus:'UBCV',subject:'ACAM',course:'300',sections:['101']}]));
  const state=await mount('/my-classes');
  const pick=state.get('courseCards').listeners.get('change');
  pick({target:{dataset:{select:'UBCV:ACAM:300'},checked:true}});
  state.get('showCompare').listeners.get('click')();
  const html=state.get('comparisonTable').innerHTML;
  assert.match(html,/Median grade/);
  assert.match(html,/25th-percentile grade/);
  assert.match(html,/75th-percentile grade/);
  assert.match(html,/Highest \/ lowest individual mark/);
  assert.match(html,/Students in most recent term/);
  assert.match(html,/80\.3%/);
  assert.match(html,/81\.0%/);
  assert.match(html,/Standing at 80%/);
  assert.doesNotMatch(html,/Teaching team entries|History range|Source unavailable/);
  state.get('compareTargetGrade').value='82';
  state.get('compareTargetGrade').listeners.get('input')();
  assert.match(state.get('comparisonTable').innerHTML,/Standing at 82%/);
});


test('homepage keeps unrecognized course codes inline and only navigates on exact catalog match',async()=>{
  storage.clear();
  const state=await mount('/');
  const navigated=[];
  globalThis.window.location.assign=url=>navigated.push(url);
  let valid=false;
  globalThis.fetch=async url=>{
    const target=new URL(url,'http://test.local');
    const q=target.searchParams.get('q');
    valid=q==='CPSC 110';
    return new Response(JSON.stringify(valid?
      {found:true,course:{campus:'UBCV',subject:'CPSC',course:'110',title:'Computing'},suggestions:[]}:
      {found:false,course:null,suggestions:[{campus:'UBCV',subject:'MATH',course:'100',title:'Differential Calculus'}]}),
      {status:200,headers:{'content-type':'application/json'}});
  };
  state.get('homeCode').value='FFFF222';
  await state.get('homeForm').listeners.get('submit')({preventDefault(){}});
  assert.equal(navigated.length,0,'Invalid course should never navigate');
  assert.match(state.get('homeMessage').innerHTML,/Course not found/);
  assert.match(state.get('homeMessage').innerHTML,/Did you mean/);
  assert.match(state.get('homeMessage').innerHTML,/MATH 100/);
  state.get('homeCode').value='CPSC 110';
  await state.get('homeForm').listeners.get('submit')({preventDefault(){}});
  assert.deepEqual(navigated,['/course?campus=UBCV&subject=CPSC&course=110']);
});

test('invalid direct course URLs display a not-found state, not a fabricated course report',async()=>{
  const state=await mount('/course','?campus=UBCV&subject=FFFF&course=222',true);
  for(let i=0;i<30&&!state.get('courseView').innerHTML.includes('Course not found');i++)await new Promise(r=>setTimeout(r,2));
  const html=state.get('courseView').innerHTML;
  assert.match(html,/Course not found/);
  assert.match(html,/Search another course/);
  assert.doesNotMatch(html,/GRADE DIFFICULTY PASSPORT/);
  assert.doesNotMatch(html,/grade-distribution-svg/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readLineups,swapCourse,historicSemesterBaseline,makeLineup} from '../lib/lineups.mjs';
const a={campus:'UBCV',subject:'CPEN',course:'211',sections:['101']};
const b={campus:'UBCV',subject:'MATH',course:'253',sections:[]};
const c={campus:'UBCV',subject:'CPSC',course:'210',sections:[]};
test('legacy saved lineup migrates without losing planner targets or grades',()=>{
 const p={target:86,entries:{'UBCV:CPEN:211':{credits:4,fixedGrade:83}}};
 const state=readLineups(null,[a],p);
 assert.deepEqual(state.lineups[0].courses,[a]);
 assert.equal(state.lineups[0].planner.entries['UBCV:CPEN:211'].fixedGrade,83);
});
test('bad saved storage and repeated IDs do not destroy active lineup',()=>{
 const raw={activeId:'second',lineups:[makeLineup('first','First',[a]),makeLineup('second','Second',[b]),makeLineup('second','Duplicate',[c])]};
 const state=readLineups(raw);assert.equal(state.lineups.length,2);assert.equal(state.activeId,'second');
});
test('swap preserves unrelated courses and never carries old section identifiers',()=>{
 const next=swapCourse([a,b],'UBCV:CPEN:211',c);
 assert.deepEqual(next,[c,b]);
 assert.deepEqual(next[0].sections,[]);
 assert.deepEqual([a,b][0].sections,['101']);
 assert.throws(()=>swapCourse([a,b],'UBCV:CPEN:211',b),/already/);
});
test('baseline is credit weighted and unavailable when any mean is missing',()=>{
 const profiles=new Map([['UBCV:CPEN:211',{average5:70}],['UBCV:MATH:253',{average:90}]]);
 assert.equal(historicSemesterBaseline([a,b],profiles,{'UBCV:CPEN:211':{credits:4},'UBCV:MATH:253':{credits:2}}), (70*4+90*2)/6);
 assert.equal(historicSemesterBaseline([a,c],profiles),null);
});

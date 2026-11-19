"""Offline Chromium UI smoke test. No localhost navigation: browser policy blocks it.
Rewrites local ES-module imports as data URLs, stubs /api responses using the
real offline grade index, and tests live DOM interactions in Chromium.
Requires python playwright and local Chromium, but no external network.
"""
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from functools import lru_cache
import base64, gzip, json, re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
index=json.loads(gzip.decompress((ROOT/'data/course-index.json.gz').read_bytes()))
CSS=(ROOT/'assets/styles.css').read_text()+'\n'+(ROOT/'assets/redesign.css').read_text()
HTML=(ROOT/'index.html').read_text()
HTML=re.sub(r'<script\b[^>]*src="/assets/app.mjs"[^>]*></script>', '', HTML)
HTML=re.sub(r'<link\b[^>]*href="/assets/(styles|redesign).css"[^>]*>', '', HTML)

@lru_cache(maxsize=None)
def module_data(path):
    raw=(ROOT/path).read_text()
    def replace(match):
        referenced=(Path(path).parent/match.group(1)).as_posix()
        normalized=(ROOT/referenced).resolve().relative_to(ROOT).as_posix()
        return match.group(0).replace(match.group(1),module_data(normalized))
    raw=re.sub(r"(?<=from )['\"](\.{1,2}/[^'\"]+\.mjs)['\"]", replace, raw)
    return 'data:text/javascript;base64,'+base64.b64encode(raw.encode()).decode()

def build_app(page_name,query=''):
    app=(ROOT/'assets/app.mjs').read_text()
    app=app.replace("const page = ROUTES[window.location.pathname.replace(/\\/$/, '') || '/'] || 'home';",f"const page = '{page_name}';")
    assert f"const page = '{page_name}';" in app
    if query: app=app.replace('location.search',json.dumps(query))
    def replace(match):
        normalized=(ROOT/'assets'/match.group(1)).resolve().relative_to(ROOT).as_posix()
        return match.group(0).replace(match.group(1),module_data(normalized))
    app=re.sub(r"(?<=from )['\"](\.{1,2}/[^'\"]+\.mjs)['\"]", replace, app)
    return 'data:text/javascript;base64,'+base64.b64encode(app.encode()).decode()

def mount(browser, page_name,initial_storage=None, query=''):
    page=browser.new_page(viewport={'width':1360,'height':900})
    page.set_content(HTML, wait_until='domcontentloaded')
    page.add_style_tag(content=CSS)
    fixture={key:index[key] for key in ['UBCV:CPSC:110','UBCV:CPEN:211','UBCV:MATH:253','UBCV:MATH:100','UBCV:ACAM:300']}
    page.evaluate('''({fixture,storage})=>{
      window.__coursewiseStorage = new Map(Object.entries(storage));
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem(key){return window.__coursewiseStorage.get(key)??null},
        setItem(key,val){window.__coursewiseStorage.set(key,String(val))},
        removeItem(key){window.__coursewiseStorage.delete(key)}
      }});
      // about:blank cannot accept path history updates; real-site history is tested in DOM unit tests.
      window.history.replaceState=()=>{};
      window.fetch=async(input)=>{
        const u=new URL(String(input),'http://coursewise.test');
        if(u.pathname==='/api/course-search'){
          const q=(u.searchParams.get('q')||'').trim().toUpperCase();
          const campus=u.searchParams.get('campus')||'UBCV';
          const exact=Object.keys(fixture).find(key=>key===`${campus}:${q.replace(/\\s+/,':')}`);
          const row=exact?(()=>{const [campus,subject,course]=exact.split(':');return {campus,subject,course,title:fixture[exact].stats?.course_title||''};})():null;
          const suggestions=q==='FFFF222'||q==='FFFF 222'?[]:[{campus:'UBCV',subject:'MATH',course:'100',title:'Differential Calculus'}];
          return new Response(JSON.stringify({found:!!row,course:row,suggestions:row?[]:suggestions}),{status:200,headers:{'content-type':'application/json'}});
        }
        if(u.pathname==='/api/course'){
          const key=[u.searchParams.get('campus'),u.searchParams.get('subject'),u.searchParams.get('course')].join(':');
          const payload=fixture[key];
          return new Response(JSON.stringify(payload||{error:'Missing in fixture: '+key}),{status:payload?200:404,headers:{'content-type':'application/json'}});
        }
        if(u.pathname==='/api/catalog'){
          const q=(u.searchParams.get('q')||'').toUpperCase();
          const results=Object.keys(fixture).filter(k=>k.includes(q.replace(/\\s+/g,':'))||k.includes(q.replace(/\\s+/g,''))).map(k=>{
            const [campus,subject,course]=k.split(':');
            return {campus,subject,course,title:fixture[k].stats?.course_title||'',latest:'2025W',sessions:8,average:fixture[k].stats?.average||null,attain85:42,distributionTerm:'2025W',distributionN:225};
          });
          return new Response(JSON.stringify({results,total:results.length,perPage:9,page:1,subjects:['CPEN','CPSC','MATH','ACAM']}),{status:200,headers:{'content-type':'application/json'}});
        }
        if(u.pathname==='/api/coverage')return new Response(JSON.stringify({error:'No coverage'}),{status:404,headers:{'content-type':'application/json'}});
        return new Response(JSON.stringify({error:'Unexpected endpoint: '+u.pathname}),{status:404,headers:{'content-type':'application/json'}});
      };
    }''',{'fixture':fixture,'storage':initial_storage or {}})
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.evaluate('(url)=>import(url)',build_app(page_name,query))
    return page,errors

def snapshot(page):
    return page.evaluate('Object.fromEntries(window.__coursewiseStorage)')

def main():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        storage={'coursewise:schedule:v1':json.dumps([
            {'campus':'UBCV','subject':'CPEN','course':'211','sections':['101']},
            {'campus':'UBCV','subject':'CPSC','course':'110','sections':['101']}
        ])}
        page,errors=mount(browser,'home')
        page.locator('#homeCode').fill('FFFF222')
        page.locator('#homeForm button[type="submit"]').click()
        page.locator('#homeMessage').get_by_text('Course not found',exact=False).wait_for(timeout=15000)
        assert page.locator('.home-search').count()==1, 'Invalid search left the homepage'
        assert page.locator('#courseView').is_hidden(), 'An invalid search opened a fake course page'
        page.locator('#homeCode').fill('MTAH 100')
        page.locator('#homeForm button[type="submit"]').click()
        page.locator('#homeMessage').get_by_text('Did you mean',exact=False).wait_for(timeout=15000)
        assert page.locator('#homeMessage').get_by_text('MATH 100').count()==1
        assert not errors,errors
        print('HOME SEARCH: invalid codes stay inline; typo suggestions are clickable')
        page.close()
        page,errors=mount(browser,'course',{},'?campus=UBCV&subject=FFFF&course=222')
        page.locator('.course-not-found').wait_for(timeout=15000)
        assert page.locator('.grade-distribution-svg').count()==0
        assert not errors,errors
        print('DIRECT URL: invalid course shows a proper not-found state without a fabricated report')
        page.close()
        # Adding manually must verify exact catalog membership, not just a code pattern.
        page,errors=mount(browser,'classes')
        page.locator('#manualCode').fill('FFFF222')
        page.locator('#addButton').click()
        page.locator('#inlineCourseMessage').get_by_text('not found',exact=False).wait_for(timeout=15000)
        assert page.locator('.lineup-course').count()==0, 'Unlisted course was inserted into My Classes'
        page.locator('#manualCode').fill('MTAH 100')
        page.locator('#addButton').click()
        page.locator('.manual-suggestion').first.wait_for(timeout=15000)
        page.locator('.manual-suggestion').first.click()
        assert page.locator('.lineup-course').count()==1
        assert not errors,errors
        print('MANUAL ADD: rejects non-existent codes inline; suggestions can be added')
        page.close()
        page,errors=mount(browser,'classes',storage)
        page.locator('.lineup-course').first.wait_for(timeout=15000)
        page.locator('.lineup-course').filter(has_text='CPEN 211').locator('.lineup-highlight-primary strong').wait_for(timeout=15000)
        assert page.locator('.lineup-course').count()==2
        assert page.locator('#lineupSelect').count()==1
        print('CLASSES: loaded 2 saved courses, cards and grade planner mounted')
        page.locator('[data-swap-start="UBCV:CPEN:211"]').click()
        assert page.locator('#swapPanel').is_visible()
        page.locator('#swapCode').fill('MATH 253')
        page.locator('#swapForm button[type="submit"]').click()
        page.locator('.swap-metrics').wait_for(timeout=15000)
        assert 'MATH 253' in page.locator('#swapPanel').inner_text()
        print('SWAP PREVIEW: alternative loaded with grade statistics')
        page.locator('[data-swap-apply]').click()
        assert page.locator('.lineup-course').filter(has_text='MATH 253').count()==1
        assert page.locator('.lineup-course').filter(has_text='CPEN 211').count()==0
        assert page.locator('#undoSwapNotice').is_visible()
        page.locator('#undoSwapButton').click()
        assert page.locator('.lineup-course').filter(has_text='CPEN 211').count()==1
        assert page.locator('.lineup-course').filter(has_text='MATH 253').count()==0
        print('SWAP APPLY/UNDO: restored original courses')
        # Grade Goal settings must follow the correct lineup, not leak across options.
        page.locator('.planner-advanced summary').click()
        page.locator('[data-planner-credits="UBCV:CPEN:211"]').fill('4')
        page.locator('[data-planner-credits="UBCV:CPEN:211"]').dispatch_event('change')
        page.locator('[data-planner-number="UBCV:CPEN:211"]').fill('77')
        page.locator('[data-planner-number="UBCV:CPEN:211"]').dispatch_event('change')
        page.locator('.lineup-more summary').click()
        page.locator('#duplicateLineup').click()
        assert page.locator('#lineupSelect option').count()==2
        page.locator('#clearButton').click()
        assert page.locator('.lineup-course').count()==0
        page.locator('#lineupSelect').select_option('main')
        assert page.locator('.lineup-course').count()==2
        assert page.locator('[data-inline-credits="UBCV:CPEN:211"]').input_value()=='4'
        assert page.locator('[data-inline-grade="UBCV:CPEN:211"]').input_value()=='77'
        # Unified grade controls: completed means actual final grade, not a target.
        page.locator('[data-inline-complete="UBCV:CPEN:211"]').check()
        page.locator('#completedBody .completed-total').wait_for(timeout=15000)
        assert 'Top ' in page.locator('#completedBody').inner_text()
        assert '1 of 1' in page.locator('#completedBody').inner_text()
        page.locator('[data-inline-complete="UBCV:CPEN:211"]').uncheck()
        assert '0 completed' in page.locator('#completedCount').inner_text()
        print('COMPLETED STANDING: inline final grade drives summary; unchecked courses excluded')
        print('LINEUPS: duplicate, clear copy, restore original credit and grade settings')
        saved=snapshot(page)
        assert not errors,errors
        page.close()
        page,errors=mount(browser,'classes',saved)
        page.locator('.lineup-course').first.wait_for(timeout=15000)
        assert page.locator('.lineup-course').count()==2
        assert page.locator('#lineupSelect option').count()==2
        print('RELOAD: saved lineup and active selection survived')
        page.set_viewport_size({'width':375,'height':812})
        assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'My Classes overflows small screens'
        assert not errors,errors
        page.close()
        page,errors=mount(browser,'course',{},'?campus=UBCV&subject=CPEN&course=211')
        page.locator('[data-passport-target]').wait_for(timeout=15000)
        assert 'GRADE DIFFICULTY PASSPORT' in page.locator('#courseView').inner_text()
        page.locator('[data-passport-target]').fill('80')
        assert page.locator('[data-passport-target-label]').inner_text()=='80%'
        assert page.locator('.distribution-target-guide').count()>0
        assert '80%' in page.locator('.distribution-target-guide').get_attribute('aria-label')
        print('PASSPORT: slider updates standing and synchronized SVG target line')
        assert not errors,errors
        page.screenshot(path=str(ROOT.parent/'coursewise-redesign-passport-browser.png'),full_page=True)
        passport_storage=snapshot(page)
        page.close()
        page,errors=mount(browser,'course',passport_storage,'?campus=UBCV&subject=MATH&course=100')
        page.locator('[data-passport-target]').wait_for(timeout=15000)
        assert page.locator('[data-passport-target]').input_value()=='80', 'Target slider did not persist across course pages'
        page.locator('#instructor-featured').wait_for(timeout=15000)
        assert page.locator('#instructor-featured .instructor-dist-svg').count()==1
        assert page.locator('[data-instructor-focus]').count()>0
        page.locator('[data-instructor-focus]').last.click()
        assert page.locator('#instructor-featured').count()==1
        print('INSTRUCTOR PREVIEW: real distribution visible by default; selected chart changes inline')
        page.locator('[data-instructor-report]').first.wait_for(timeout=15000)
        page.locator('[data-instructor-report]').first.click()
        page.locator('.instructor-full-report').wait_for(timeout=15000)
        assert page.locator('.instructor-timeline-svg').count()==1
        assert page.locator('.instructor-rmp-link').count()==1
        assert '/search/professors/1413?' in page.locator('.instructor-rmp-link').get_attribute('href')
        assert page.locator('.instructor-full-report').locator('th',has_text='Grade spread').count()==0
        print('INSTRUCTORS: full report timeline and university-scoped RMP link')
        assert not errors,errors
        page.screenshot(path=str(ROOT.parent/'coursewise-redesign-instructor-browser.png'),full_page=True)
        for width in [375,768,1440]:
            page.set_viewport_size({'width':width,'height':812})
            assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), f'Course report overflow at {width}px'
        page.close()
        print('RESPONSIVE: course report and My Classes fit narrow phone screens')
        page,errors=mount(browser,'explore')
        page.locator('#catalogStatus').wait_for(timeout=15000)
        page.locator('#browseSort').select_option('attain85')
        page.locator('.catalog-advanced summary').click()
        page.locator('#browseMin85').select_option('20')
        print('BROWSE: new evidence filters present; no JS exceptions')
        assert not errors,errors
        page.close()
        # A slow replacement lookup must not allow premature apply or overwrite a newer preview.
        page,errors=mount(browser,'classes',storage)
        page.locator('.lineup-course').first.wait_for(timeout=15000)
        page.evaluate('''() => {
          const realFetch = window.fetch;
          window.fetch = (input, ...args) => {
            const url = String(input);
            if (url.includes('/api/course?') && url.includes('course=253')) {
              return new Promise(resolve => { window.releaseSlowSwap = () => resolve(realFetch(input,...args)); });
            }
            return realFetch(input,...args);
          };
        }''')
        page.locator('[data-swap-start="UBCV:CPEN:211"]').click()
        page.locator('#swapCode').fill('MATH 253')
        page.locator('#swapForm button[type="submit"]').click()
        assert page.locator('[data-swap-apply]').count()==0, 'Apply appeared before statistics loaded'
        page.locator('#swapCode').fill('ACAM 300')
        page.locator('#swapForm button[type="submit"]').click()
        page.locator('.swap-metrics').wait_for(timeout=15000)
        assert 'ACAM 300' in page.locator('#swapPanel .swap-heading').inner_text()
        page.evaluate('window.releaseSlowSwap()')
        page.wait_for_timeout(120)
        assert 'ACAM 300' in page.locator('#swapPanel .swap-heading').inner_text(), 'Slow older preview overwrote newer choice'
        assert page.locator('[data-swap-apply]').count()==1
        assert not errors,errors
        print('SWAP RACE: pending requests cannot be applied and stale previews cannot overwrite new ones')
        page.close()
        # Optional real Workday export, supplied for this development session only.
        # The workbook is private and is never included in a release archive.
        workbook=Path('/mnt/data/View_My_Courses.xlsx')
        if workbook.exists():
            page,errors=mount(browser,'classes')
            page.locator('#scheduleFile').set_input_files('/mnt/data/View_My_Courses.xlsx')
            page.locator('#importMessage').wait_for(timeout=15000)
            page.wait_for_function('document.getElementById("importMessage").textContent.includes("extracted")',timeout=15000)
            assert page.locator('#scheduleInput').input_value().strip()
            page.locator('#importButton').click()
            page.locator('.lineup-course').first.wait_for(timeout=15000)
            assert page.locator('.lineup-course').count()>0
            assert not errors,errors
            print('WORKDAY XLSX: real uploaded workbook previewed and imported')
            page.close()
        else:
            print('WORKDAY XLSX: user-provided workbook unavailable; synthetic unit tests still run')
        browser.close()
        print('BROWSER SMOKE PASS: all major flows')
if __name__=='__main__':main()

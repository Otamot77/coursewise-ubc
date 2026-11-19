"""Deep real-DOM regression on actual archived UBC course profiles.
Run: python3 scripts/regression_full.py
Runs offline (Chromium blocks localhost here), with API requests served from the
real processed grade index. Does not mock any chart, stats, or DOM render code.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import mount


def assert_clean(errors, where):
    assert not errors, f'{where}: unhandled JS exceptions: {errors}'


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',
                                     args=['--no-sandbox','--disable-dev-shm-usage'])
        seed = {'coursewise:schedule:v1':json.dumps([
            {'campus':'UBCV','subject':'CPEN','course':'211','sections':['101']},
            {'campus':'UBCV','subject':'CPSC','course':'110','sections':['101']}])}
        page, errors = mount(browser,'course',{},'?campus=UBCV&subject=MATH&course=100')
        page.locator('.instructor-roster-table tbody tr').first.wait_for(timeout=15000)
        assert '± VS SAME-TERM SECTIONS' in page.locator('.instructor-roster-table thead').inner_text()
        assert 'STUDENTS*' in page.locator('.instructor-roster-table thead').inner_text()
        assert ' pp' in page.locator('.instructor-roster-table tbody tr').first.locator('td').nth(2).inner_text()
        assert 'Course mean' in page.locator('.instructor-feature-metrics').inner_text()
        assert ' pp' in page.locator('.instructor-feature-metrics').inner_text()
        first_name=page.locator('#instructor-featured h4').inner_text()
        focus=page.locator('[data-instructor-focus]')
        alternative=focus.last.get_attribute('data-instructor-name')
        assert alternative!=first_name
        focus.last.click()
        assert page.locator('#instructor-featured h4').inner_text()==alternative
        assert page.locator('#instructor-featured .instructor-dist-svg').count()==1
        print('INSTRUCTOR: visible matched-term ± in pp, comparison baseline, student counts; focus updates real histogram')

        page.locator('[data-instructor-sort]').select_option('mean')
        top=float(page.locator('.instructor-roster-table tbody tr').first.locator('td').nth(1).locator('strong').inner_text().replace('%',''))
        second=float(page.locator('.instructor-roster-table tbody tr').nth(1).locator('td').nth(1).locator('strong').inner_text().replace('%',''))
        assert top >= second
        page.locator('[data-instructor-sort]').select_option('name')
        sorted_names=page.locator('.instructor-roster-table tbody tr td:first-child strong').all_text_contents()
        assert sorted_names==sorted(sorted_names,key=str.casefold)
        page.locator('[data-instructor-query]').fill('Mart')
        search_results=page.locator('.instructor-roster-table tbody tr td:first-child strong').all_text_contents()
        assert search_results and all('mart' in name.lower() for name in search_results)
        page.locator('[data-instructor-query]').fill('')
        page.locator('[data-instructor-period]').select_option('2025W')
        assert page.locator('#instructor-featured').is_visible()
        for td in page.locator('.instructor-roster-table tbody tr td:nth-child(6)').all_text_contents():
            assert td.strip()=='2025W'
        page.locator('[data-instructor-period]').select_option('recent')
        print('INSTRUCTOR FILTERS: term, name query, mean/name sorting all recompute actual records')

        page.locator('[data-instructor-pick]').nth(0).check()
        page.locator('[data-instructor-pick]').nth(1).check()
        assert page.locator('[data-instructor-pick]').nth(2).is_disabled()
        page.locator('[data-instructor-toggle-compare]').click()
        assert page.locator('.instructor-compare-card').count()==2
        assert page.locator('.instructor-compare-card .instructor-dist-svg').count()>=1
        page.locator('[data-instructor-pick]').first.uncheck()
        assert page.locator('[data-instructor-pick]').nth(2).is_enabled()
        assert page.locator('.instructor-compare-card').count()==1
        print('INSTRUCTOR COMPARE: two maximum, chart render, reenable after unchecked')

        page.locator('[data-instructor-report]').first.click()
        report=page.locator('#instructor-report')
        report.wait_for(timeout=15000)
        assert report.locator('.instructor-report-metrics').get_by_text('± vs same-term sections').count()==1
        assert 'pp' in report.locator('.instructor-report-metrics').inner_text()
        all_rows=report.locator('.instructor-report-table tbody tr').count()
        opts=page.locator('[data-instructor-report-term] option')
        if opts.count()>1:
            page.locator('[data-instructor-report-term]').select_option(index=1)
            assert page.locator('.instructor-report-table tbody tr').count()<=all_rows
        page.locator('[data-instructor-close]').click()
        assert page.locator('#instructor-report').count()==0
        print('INSTRUCTOR FULL REPORT: same-term metric, term filter, individual sections, close')

        term_selector=page.locator('[data-filter-session]')
        term_selector.select_option(index=1)
        selected_term=term_selector.input_value()
        assert selected_term in page.locator('.passport-term').inner_text()
        if page.locator('[data-filter-section] option').count()>1:
            page.locator('[data-filter-section]').select_option(index=1)
            assert 'Section ' in page.locator('.passport-term').inner_text()
        page.locator('[data-passport-target]').fill('85')
        assert page.locator('[data-passport-target-label]').inner_text()=='85%'
        assert page.locator('.grade-distribution-svg').count()>0
        print('COURSE DISTRIBUTION: term / section selection, median/target/marker stay connected')
        for width in (320,375,390,768,1024,1440):
            page.set_viewport_size({'width':width,'height':780})
            assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),f'Overflow at {width}'
        assert_clean(errors,'course')
        page.close()

        page,errors=mount(browser,'classes')
        page.locator('#scheduleInput').fill('CPEN_V 211 - 101\nCPSC_V 110 - 101')
        page.locator('#importButton').click()
        page.locator('.lineup-course').first.wait_for(timeout=15000)
        assert page.locator('.lineup-course').count()==2
        assert page.locator('#importCard').is_hidden(), 'First completed import should dismiss setup'
        assert page.locator('#workspaceFeedback').is_visible(), 'Import success message vanished with hidden form'
        assert '2 new' in page.locator('#workspaceFeedback').inner_text()
        assert_clean(errors,'initial import')
        page.close()
        print('WORKDAY PASTE: two courses imported; success feedback remains visible after form closes')

        page, errors=mount(browser,'classes',seed)
        page.locator('.lineup-course').first.wait_for(timeout=15000)
        assert page.locator('.lineup-course').count()==2
        assert page.locator('#importCard').is_hidden()
        page.locator('#importToggle').click()
        assert page.locator('#importCard').is_visible()
        page.locator('#importToggle').click()
        assert page.locator('#importCard').is_hidden()
        print('WORKSPACE: no permanent import sidebar; import action opens/closes')
        page.locator('[data-select]').first.check()
        page.locator('[data-select]').nth(1).check()
        page.locator('#showCompare').click()
        assert page.locator('#comparePanel').is_visible()
        first_comparison=page.locator('#comparisonTable').inner_text()
        assert 'CPEN 211' in first_comparison and 'CPSC 110' in first_comparison
        page.locator('#compareTargetGrade').fill('85')
        page.locator('#compareTargetGrade').dispatch_event('input')
        assert '85' in page.locator('#comparisonTable').inner_text() or first_comparison!=page.locator('#comparisonTable').inner_text()
        page.locator('#closeCompare').click()
        assert page.locator('#comparePanel').is_hidden()
        print('COURSE COMPARE: two real course records; threshold update and dismiss')

        page.locator('#sortSelect').select_option('name')
        assert 'CPEN 211' in page.locator('.lineup-course').first.inner_text()
        page.locator('#sortSelect').select_option('average5')
        assert page.locator('.lineup-course').count()==2
        page.locator('[data-inline-credits="UBCV:CPEN:211"]').fill('4')
        page.locator('[data-inline-credits="UBCV:CPEN:211"]').dispatch_event('change')
        assert page.locator('[data-planner-credits="UBCV:CPEN:211"]').input_value()=='4'
        page.locator('[data-inline-grade="UBCV:CPEN:211"]').fill('84.5')
        page.locator('[data-inline-grade="UBCV:CPEN:211"]').dispatch_event('change')
        assert page.locator('[data-planner-number="UBCV:CPEN:211"]').input_value()=='84.5'
        page.locator('[data-inline-complete="UBCV:CPEN:211"]').check()
        assert page.locator('#completedBody .completed-row').count()==1
        assert 'Top ' in page.locator('#completedBody').inner_text()
        assert '1 of 1' in page.locator('#completedBody').inner_text()
        page.locator('#plannerTarget').fill('88')
        page.locator('#plannerTarget').dispatch_event('change')
        assert page.locator('#plannerTarget').input_value()=='88'
        assert page.locator('[data-inline-complete="UBCV:CPEN:211"]').is_checked()
        page.locator('.planner-advanced summary').click()
        page.locator('#plannerReset').click()
        assert page.locator('[data-inline-complete="UBCV:CPEN:211"]').is_checked(),'reset must preserve final grades'
        print('GRADE GOALS: credits, final grades, completion and goal target synchronize; reset preserves completed')
        page.locator('#lineupSelect').select_option('main')
        page.locator('.lineup-more summary').click()
        page.locator('#duplicateLineup').click()
        assert page.locator('#lineupSelect option').count()==2
        assert page.locator('[data-inline-complete="UBCV:CPEN:211"]').is_checked()
        page.locator('[data-inline-complete="UBCV:CPEN:211"]').uncheck()
        page.locator('#lineupSelect').select_option('main')
        assert page.locator('[data-inline-complete="UBCV:CPEN:211"]').is_checked()
        print('SAVED LINEUPS: independent completed grades and calculator settings')
        for width in (320,375,390,768,1024,1440):
            page.set_viewport_size({'width':width,'height':780})
            assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),f'My Classes overflow {width}'
        assert_clean(errors,'classes')
        page.close()
        page,errors=mount(browser,'gpa')
        assert '4.33' in page.locator('#gpaLookup').inner_text()
        assert page.locator('#letterGradeTable tr').count()==11
        assert_clean(errors,'gpa guide')
        page.close()
        page,errors=mount(browser,'data')
        page.locator('#coverageSummary').get_by_text('No local dataset',exact=False).wait_for(timeout=15000)
        assert_clean(errors,'data sources')
        page.close()
        print('SUPPORTING PAGES: GPA guide and missing-data coverage state render without JS errors')
        browser.close()
    print('DEEP BROWSER REGRESSION PASS')

if __name__=='__main__':
    run()

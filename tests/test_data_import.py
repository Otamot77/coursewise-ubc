import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_pair_data import build_profiles, csv_inputs, data_source, normalize_row, run


class ImportTests(unittest.TestCase):
    def test_import_zip_and_source_preference(self):
        rows = [('pair-reports/UBC/2023W/MATH.csv',
                 'Campus,Year,Session,Subject,Course,Detail,Section,Title,Professor,Enrolled,Avg\n'
                 'UBCV,2023,W,MATH,100,,OVERALL,Calculus,Older,100,77\n'),
                ('tableau-dashboard-v2/UBCV/2023W/MATH.csv',
                 'Campus,Year,Session,Subject,Course,Detail,Section,Title,Professor,Reported,Avg\n'
                 'UBCV,2023,W,MATH,100,,001,Calculus,Faculty A,60,80\n'
                 'UBCV,2023,W,MATH,100,,002,Calculus,Faculty B,40,60\n'
                 'UBCV,2023,W,MATH,100,,OVERALL,Calculus,,100,72\n')]
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / 'dataset.zip'
            with zipfile.ZipFile(src, 'w') as z:
                for name, content in rows:
                    z.writestr(name, content)
            run(src, Path(d) / 'out')
            import gzip
            import json
            with gzip.open(Path(d) / 'out' / 'course-index.json.gz') as file:
                result = json.load(file)
            course = result['UBCV:MATH:100']
            self.assertEqual(course['stats']['average'], 72)
            self.assertEqual(course['coverage']['sessionDetails'][0]['sections'], 2)
            self.assertEqual(course['coverage']['sessionDetails'][0]['source'], 'tableau-dashboard-v2')

    def test_preserve_unavailable_average_without_inventing_it(self):
        missing = normalize_row({'Campus': 'UBCV', 'Year': '2024', 'Session': 'W', 'Subject': 'MATH',
                                 'Course': '100', 'Section': '001', 'Avg': ''}, 'tableau-dashboard-v2')
        self.assertIsNone(missing['average'])
        published = {**missing, 'section': '002', 'average': 77, 'reported': 20}
        result, integrity = build_profiles([missing, published])
        item = result['UBCV:MATH:100']
        self.assertEqual(item['stats']['average'], 77)
        self.assertEqual(item['coverage']['partialYearsessions'], 1)
        self.assertEqual(item['coverage']['sessionDetails'][0]['missingSectionAverages'], 1)
        self.assertEqual(integrity['partiallyPublishedCourseSessions'], 1)

    def test_related_suffix_codes_kept_separate(self):
        base = {'Campus': 'UBCV', 'Year': '2022', 'Session': 'W', 'Subject': 'CPEN', 'Course': '221',
                'Section': '101', 'Avg': '72', 'Reported': '100', 'Professor': 'Example Professor'}
        a = {**base, 'Year': '2025', 'Detail': 'A', 'Avg': '78'}
        b = {**base, 'Year': '2025', 'Detail': 'B', 'Avg': '70'}
        result, _ = build_profiles([normalize_row(r, 'tableau-dashboard-v2') for r in (base, a, b)])
        self.assertEqual(result['UBCV:CPEN:221']['coverage']['latest'], '2022W')
        self.assertEqual(result['UBCV:CPEN:221']['relatedCodes'], [
            {'course': '221A', 'latest': '2025W'}, {'course': '221B', 'latest': '2025W'}])
        self.assertEqual(result['UBCV:CPEN:221A']['stats']['average'], 78)
        self.assertEqual(result['UBCV:CPEN:221B']['stats']['average'], 70)

    def test_raw_bins_and_class_size_are_kept_without_reconstructing_missing_counts(self):
        row = normalize_row({
            'Campus':'UBCV','Year':'2025','Session':'W','Subject':'CPSC','Course':'110',
            'Section':'101','Reported':'83','Avg':'79.75','Median':'80',
            'Percentile (25)':'73','Percentile (75)':'86',
            'High':'99','Low':'18','<50':'', '50-54':'0', '90-100':'9',
        }, 'tableau-dashboard-v2')
        self.assertEqual(row['reported'], 83)
        self.assertEqual(row['reportedKind'], 'Reported')
        self.assertIsNone(row['distribution']['<50'])
        self.assertEqual(row['distribution']['50-54'], 0)
        self.assertEqual(row['distribution']['90-100'], 9)
        result, _ = build_profiles([row])
        prof = result['UBCV:CPSC:110']
        section = prof['recentSections'][0]
        self.assertEqual(section['median'], 80)
        self.assertEqual(section['p25'], 73)
        self.assertEqual(section['p75'], 86)
        self.assertEqual(prof['stats']['max_grade'], 99)
        self.assertEqual(prof['stats']['min_grade'], 18)
        self.assertIsNone(section['distribution']['<50'])
        self.assertEqual(section['distribution']['90-100'],9)

    def test_reject_invalid_codes_and_campus_normalization(self):
        base = {'Campus': 'UBC', 'Year': '2024', 'Session': 'W', 'Subject': 'MATH',
                'Course': '100', 'Section': '001', 'Avg': '75'}
        self.assertEqual(normalize_row(base, 'pair-reports')['campus'], 'UBCV')
        self.assertIsNone(normalize_row({**base, 'Course': '../../etc'}, 'pair-reports'))
        self.assertEqual(data_source('abc/tableau-dashboard-v2/f.csv'), 'tableau-dashboard-v2')


if __name__ == '__main__':
    unittest.main()

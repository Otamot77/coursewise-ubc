#!/usr/bin/env python3
"""Create a local-first Coursewise index from UBC PAIR grade CSV archives.

Only statistics already published in source CSVs are used; suppressed values
are never invented. One record per published section (or OVERALL fallback)
is counted per course and year-session. Other source versions are retained only
in provenance, not added together.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import math
import re
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

SOURCE_RANK = {'pair-reports': 1, 'tableau-dashboard': 2, 'tableau-dashboard-v2': 3}
YEAR = re.compile(r'^(?:19|20)\d{2}$')
CODE = re.compile(r'^\d{3}[A-Z]?$')
SUBJECT = re.compile(r'^[A-Z]{2,6}$')
SECTION_LIMIT = 80


def data_source(filename):
    name = filename.lower().replace('\\', '/')
    for source in ('tableau-dashboard-v2', 'tableau-dashboard', 'pair-reports'):
        if f'/{source}/' in f'/{name}':
            return source
    return None


def csv_inputs(path):
    if path.is_file() and path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as zf:
            for info in zf.infolist():
                if info.filename.lower().endswith('.csv') and not info.is_dir() and data_source(info.filename):
                    with zf.open(info) as raw, io.TextIOWrapper(raw, encoding='utf-8-sig', errors='replace', newline='') as stream:
                        yield info.filename, csv.DictReader(stream)
    elif path.is_dir():
        for filename in sorted(path.rglob('*.csv')):
            if data_source(str(filename)):
                with filename.open(encoding='utf-8-sig', errors='replace', newline='') as stream:
                    yield str(filename), csv.DictReader(stream)
    else:
        raise ValueError('Input must be a ZIP or directory containing named PAIR data folders.')


def cleaned(value):
    return str(value or '').strip()


def valid_number(value):
    if value is None or cleaned(value) == '':
        return None
    try:
        number = float(str(value).replace(',', ''))
    except (ValueError, TypeError):
        return None
    return number if math.isfinite(number) else None


def normalize_row(row, source):
    campus = cleaned(row.get('Campus')).upper().replace('UBC', 'UBCV', 1) if cleaned(row.get('Campus')).upper() == 'UBC' else cleaned(row.get('Campus')).upper()
    year = cleaned(row.get('Year'))
    session = cleaned(row.get('Session')).upper()
    subject = cleaned(row.get('Subject')).upper()
    base = cleaned(row.get('Course')).upper().zfill(3)
    detail = cleaned(row.get('Detail')).upper()
    course = base if not detail or base.endswith(detail) else base + detail
    section = cleaned(row.get('Section')).upper()
    if section.isdigit():
        section = section.zfill(3)
    if (campus not in ('UBCV', 'UBCO') or not YEAR.fullmatch(year)
        or session not in ('S', 'W') or not SUBJECT.fullmatch(subject)
        or not CODE.fullmatch(course) or not section):
        return None
    average = valid_number(row.get('Avg', row.get('Average')))
    if average is not None and not 0 <= average <= 100:
        average = None
    reported = valid_number(row.get('Reported', row.get('Enrolled')))
    if reported is not None and (reported <= 0 or not reported.is_integer()):
        reported = None
    return {
        'campus': campus, 'yearsession': f'{year}{session}', 'subject': subject,
        'course': course, 'section': section, 'title': cleaned(row.get('Title')),
        'educators': cleaned(row.get('Professor')), 'reported': int(reported) if reported else None,
        'average': average, 'source': source,
    }


def educator_names(raw):
    return [n.strip() for n in re.split(r';|\s+\|\s+|\n', raw) if 3 < len(n.strip()) < 100]


def best_section_rows(rows):
    """Prefer actual sections; OVERALL is never additive to explicit sections."""
    explicit = [r for r in rows if r['section'] != 'OVERALL']
    selected = explicit if explicit else rows
    unique = {}
    duplicate_count = 0
    for r in selected:
        # Multiple identical section IDs may be caused by old PAIR professor duplicates.
        # Choose the row with a published mean first, then with greater attribution.
        previous = unique.get(r['section'])
        if previous:
            duplicate_count += 1
        if previous is None or (
            (r['average'] is not None, bool(r['educators']), r['reported'] is not None) >
            (previous['average'] is not None, bool(previous['educators']), previous['reported'] is not None)
        ):
            unique[r['section']] = r
    return list(unique.values()), duplicate_count


def build_profiles(rows, correction_map=None):
    correction_map = correction_map or {}
    by_year = defaultdict(list)
    for row in rows:
        by_year[(row['campus'], row['subject'], row['course'], row['yearsession'])].append(row)
    grouped = defaultdict(lambda: {'years': [], 'educators': defaultdict(dict), 'titles': [], 'sources': set(), 'sections': []})
    duplicate_sections = 0
    source_overlap_groups = 0
    partial_yearsessions = 0
    for (campus, subject, course, yearsession), data in by_year.items():
        if len({r['source'] for r in data}) > 1:
            source_overlap_groups += 1
        # A newer data vintage wins even when it suppresses an average. We do
        # not silently replace its withheld observations with older snapshots.
        best_rank = max(SOURCE_RANK[r['source']] for r in data)
        same = [r for r in data if SOURCE_RANK[r['source']] == best_rank]
        selected, dup = best_section_rows(same)
        duplicate_sections += dup
        available = [r for r in selected if r['average'] is not None]
        missing = len(selected) - len(available)
        if missing:
            partial_yearsessions += 1
        weighted = bool(available) and all(r['reported'] is not None for r in available)
        weight = sum(r['reported'] for r in available) if weighted else len(available)
        average = round(sum(r['average'] * (r['reported'] if weighted else 1) for r in available) / weight, 2) if available else None
        source = same[0]['source']
        profile = grouped[(campus, subject, course)]
        profile['years'].append({
            'yearsession': yearsession, 'average': average,
            'sections': len(available), 'sectionsTotal': len(selected),
            'missingSectionAverages': missing,
            'reported': sum(r['reported'] for r in available) if weighted else None,
            'method': 'reported-weighted' if weighted else ('unweighted-sections' if available else 'no-published-average'),
            'source': source,
        })
        profile['sources'].add(source)
        for r in selected:
            if r['title']:
                profile['titles'].append((yearsession, r['title']))
            correction_key = f"UBC-{yearsession}-{subject}-{course}-{r['section']}"
            people = educator_names(correction_map.get(correction_key, r['educators']))
            if r['average'] is not None:
                profile['sections'].append({
                    'yearsession': yearsession, 'section': r['section'], 'average': round(r['average'], 2),
                    'reported': r['reported'], 'educators': people[:8], 'source': source,
                })
            for person in people:
                profile['educators'][person][yearsession] = profile['educators'][person].get(yearsession, 0) + 1

    result = {}
    for (campus, subject, course), profile in grouped.items():
        years = sorted(profile['years'], key=lambda y: y['yearsession'])
        published = [y for y in years if y['average'] is not None]
        latest_year = int(years[-1]['yearsession'][:4])
        recent = [y for y in published if int(y['yearsession'][:4]) >= latest_year - 4]

        def mean(sessions):
            return round(sum(y['average'] for y in sessions) / len(sessions), 2) if sessions else None

        teachers = sorted(profile['educators'].items(), key=lambda x: (-sum(x[1].values()), x[0]))[:30]
        titles = sorted(profile['titles'])
        recent_sections = sorted(profile['sections'], key=lambda r: (r['yearsession'], r['section']), reverse=True)
        result[f'{campus}:{subject}:{course}'] = {
            'stats': {
                'course_title': titles[-1][1] if titles else '',
                'average': mean(published), 'average_past_5_yrs': mean(recent),
                'max_course_avg': round(max(y['average'] for y in published), 2) if published else None,
                'min_course_avg': round(min(y['average'] for y in published), 2) if published else None,
            },
            'history': {'yearsessions': {y['yearsession']: y['average'] for y in published}},
            'teachingTeam': [{'name': name, 'yearsessions': ys} for name, ys in teachers],
            'recentSections': recent_sections[:SECTION_LIMIT],
            'coverage': {
                'yearsessions': len(published), 'listedYearsessions': len(years),
                'latest': years[-1]['yearsession'], 'latestPublished': published[-1]['yearsession'] if published else None,
                'sources': sorted(profile['sources']), 'sessionDetails': years,
                'limitedSectionHistory': len(recent_sections) > SECTION_LIMIT,
                'partialYearsessions': sum(1 for y in years if y['missingSectionAverages']),
                'note': 'Means derived only from published averages. Section means weighted by reported count where available; missing grade data never reconstructed.'
            }
        }
    # Expose same-course-code variants without guessing that their grades
    # can be combined. e.g. CPEN 221 historically used 221 / 221A / 221B.
    families = defaultdict(list)
    for key, data in result.items():
        campus, subject, course = key.split(':')
        families[(campus, subject, course[:3])].append((course, data['coverage']['latestPublished'] or data['coverage']['latest']))
    for key, data in result.items():
        campus, subject, course = key.split(':')
        variants = sorted(families[(campus, subject, course[:3])])
        if len(variants) > 1:
            data['relatedCodes'] = [{'course': c, 'latest': latest} for c, latest in variants if c != course]
    return result, {'duplicateSectionRows': duplicate_sections,
                    'overlappingSourceCourseSessions': source_overlap_groups,
                    'partiallyPublishedCourseSessions': partial_yearsessions}


def read_corrections(source):
    filename = 'extra/pair-reports-UBC-instructor-corrections.json'
    try:
        if source.is_file() and source.suffix.lower() == '.zip':
            with zipfile.ZipFile(source) as zf:
                member = next((name for name in zf.namelist() if name.endswith(filename)), None)
                return json.loads(zf.read(member)) if member else {}
        found = list(source.rglob('pair-reports-UBC-instructor-corrections.json'))
        return json.loads(found[0].read_text()) if found else {}
    except (OSError, ValueError, KeyError):
        return {}


def run(source, output):
    records = []
    file_count = 0
    total_rows = 0
    valid_rows = 0
    with_average = 0
    coverage = defaultdict(lambda: Counter())
    unique_codes = defaultdict(set)
    sources = Counter()
    for filename, reader in csv_inputs(source):
        origin = data_source(filename)
        file_count += 1
        for raw in reader:
            total_rows += 1
            row = normalize_row(raw, origin)
            if row is None:
                continue
            valid_rows += 1
            if row['average'] is not None:
                with_average += 1
            records.append(row)
            stat_key = (row['campus'], row['yearsession'], origin)
            coverage[stat_key]['rows'] += 1
            coverage[stat_key]['publishedAverages' if row['average'] is not None else 'unavailableAverages'] += 1
            sources[origin] += 1
            unique_codes[stat_key].add((row['subject'], row['course']))
    if not file_count:
        raise ValueError('No CSVs found in pair-reports, tableau-dashboard or tableau-dashboard-v2 folders.')
    profiles, integrity = build_profiles(records, read_corrections(source))
    if not profiles:
        raise ValueError(f'Scanned {file_count} CSVs but found no recognizable rows.')
    output.mkdir(parents=True, exist_ok=True)
    with gzip.open(output / 'course-index.json.gz', 'wt', encoding='utf-8', compresslevel=8) as handle:
        json.dump(profiles, handle, separators=(',', ':'), ensure_ascii=False)
    session_rows = [
        {'campus': campus, 'yearsession': yearsession, 'source': origin, 'courses': len(unique_codes[key]),
         'rows': count['rows'], 'publishedAverages': count['publishedAverages'],
         'unavailableAverages': count['unavailableAverages']}
        for key, count in coverage.items()
        for campus, yearsession, origin in [key]
    ]
    session_rows.sort(key=lambda r: (r['campus'], r['yearsession'], r['source']))
    (output / 'coverage.json').write_text(json.dumps({'sessions': session_rows}, separators=(',', ':')) + '\n', encoding='utf-8')
    summary = {
        'generatedAt': datetime.now(timezone.utc).isoformat(), 'inputFiles': file_count, 'inputRows': total_rows,
        'validRows': valid_rows, 'rowsWithPublishedAverage': with_average, 'rowsWithoutPublishedAverage': valid_rows - with_average,
        'indexedCourses': len(profiles), 'coursesWithAnyPublishedAverage': sum(1 for v in profiles.values() if v['stats']['average'] is not None),
        'rawSource': source.name, 'sourceRows': dict(sources), 'integrity': integrity,
        'methodology': 'Published section means only, one source vintage per course/session. Blank or suppressed grades not reconstructed.'
    }
    (output / 'metadata.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Raw grade ZIP or extracted directory')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent.parent / 'data')
    args = parser.parse_args()
    try:
        run(args.source, args.out)
    except (ValueError, zipfile.BadZipFile) as error:
        parser.error(str(error))

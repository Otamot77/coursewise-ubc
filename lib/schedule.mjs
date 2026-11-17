/**
 * Parse copied Workday saved/registered schedules, plain course lists and ICS descriptions.
 * Runs in the browser. Raw Workday text is not sent to our API.
 */
const COURSE = /\b([A-Z]{2,6})(?:[_-]([VO]))?\s+([0-9]{3}[A-Z]?)(?![0-9A-Z])(?:\s*(?:[-–:]\s*|\b(?:section|sec\.?|lecture|lec\.?)\s*)([0-9]{3}[A-Z]?))?/gi;
const BAD_PREFIXES = new Set(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'ROOM', 'TERM', 'YEAR', 'COURSE', 'CLASS', 'SECT', 'LECTURE', 'UBCV', 'UBCO']);
const MAX_CHARACTERS = 100_000;
const MAX_COURSES = 35;

export function parseSchedule(input, defaultCampus = 'UBCV') {
  if (typeof input !== 'string' || !input.trim()) return [];
  // Remove HTML tags without executing scripts, and unwrap ICS escaped newline sequences.
  const normalized = input.slice(0, MAX_CHARACTERS)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\[nN]/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '\n');
  const results = new Map();
  for (const match of normalized.matchAll(COURSE)) {
    const subject = match[1].toUpperCase();
    if (BAD_PREFIXES.has(subject)) continue;
    const course = match[3].toUpperCase();
    const campus = match[2] ? (match[2].toUpperCase() === 'O' ? 'UBCO' : 'UBCV') : defaultCampus;
    const key = `${campus}:${subject}:${course}`;
    const section = match[4]?.toUpperCase() ?? null;
    if (results.has(key)) {
      const existing = results.get(key);
      if (section && !existing.sections.includes(section)) existing.sections.push(section);
    } else {
      results.set(key, { campus, subject, course, sections: section ? [section] : [] });
    }
    if (results.size >= MAX_COURSES) break;
  }
  return [...results.values()];
}

export function normalizeSavedCourses(input) {
  if (!Array.isArray(input)) return [];
  const result = new Map();
  for (const item of input.slice(0, MAX_COURSES)) {
    if (!item || !['UBCV', 'UBCO'].includes(item.campus)) continue;
    if (!/^[A-Z]{2,6}$/.test(item.subject ?? '') || !/^\d{3}[A-Z]?$/.test(item.course ?? '')) continue;
    const key = courseKey(item);
    if (!result.has(key)) result.set(key, { campus: item.campus, subject: item.subject, course: item.course, sections: Array.isArray(item.sections) ? item.sections.filter(x => /^\d{3}[A-Z]?$/.test(x)).slice(0, 8) : [] });
  }
  return [...result.values()];
}
export const courseKey = c => `${c.campus}:${c.subject}:${c.course}`;
export const courseLabel = c => `${c.subject} ${c.course}`;

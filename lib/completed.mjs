/** Completed-course standing, not a student-level average percentile.
 * The archive contains independent course distributions, never linked students.
 */
import { standingAtGrade } from './comparison.mjs';
import { validCredits, validGrade } from './planner.mjs';

export function completedCourseStanding(items) {
  if (!Array.isArray(items)) return {status:'empty',total:0,covered:0,rows:[],standing:null};
  const completed = items.filter(x => x?.completed === true && validGrade(x.finalGrade));
  const rows = completed.map(item => {
    const evidence = standingAtGrade(item.distribution, item.finalGrade);
    return { id:item.id, label:item.label, grade:item.finalGrade, credits:item.credits,
      evidence, available:!!(evidence && validCredits(item.credits)) };
  });
  const covered = rows.filter(r => r.available);
  const credits = covered.reduce((n,r)=>n+r.credits,0);
  const standing = credits ? covered.reduce((n,r)=>n+r.credits*r.evidence.percentBelow,0)/credits : null;
  return {status:!rows.length?'empty':!covered.length?'unavailable':covered.length===rows.length?'complete':'partial',
    total:rows.length,covered:covered.length,credits,rows,standing,
    // This is the weighted average of percentiles IN SEPARATE COURSES.
    // Never label it as a percentile among unique students or all UBC students.
    topShare:standing==null?null:100-standing};
}

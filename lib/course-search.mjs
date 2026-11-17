/** Exact catalog matching and conservative typo suggestions.
 * Only the imported catalog is authoritative; an arbitrary valid-looking code
 * does not prove a course exists or that a page has historical records.
 */
export function normalizeCourseQuery(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/[_\s]+/g, ' ').replace(/\s+/g, ' ');
}

export function parseCourseQuery(raw) {
  const cleaned = String(raw ?? '').toUpperCase().replace(/_([VO])(?=\s*\d{3})/g, '');
  const compact = normalizeCourseQuery(cleaned).replace(/\s/g, '');
  const match = compact.match(/^([A-Z]{2,6})(\d{3}[A-Z]?)$/);
  return match ? { subject: match[1], course: match[2] } : null;
}

function distance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  // A common typo is two adjacent letters reversed: MTAH → MATH.
  if(a.length===b.length)for(let i=0;i<a.length-1;i++){
    if(a[i]!==b[i] && a[i]===b[i+1] && a[i+1]===b[i] && a.slice(0,i)===b.slice(0,i) && a.slice(i+2)===b.slice(i+2))return 1;
  }
  const d = Array.from({length:a.length+1}, (_,i)=>i);
  for (let j=1;j<=b.length;j++) {
    let left=j, diag=j-1;
    for(let i=1;i<=a.length;i++) {
      const old=d[i];
      const cost=a[i-1]===b[j-1]?0:1;
      d[i]=Math.min(old+1,left+1,diag+cost);
      diag=old;left=d[i];
    }
    d[0]=j;
  }
  return d[a.length];
}

/** Return a compact public-only result, never any student grades or source rows. */
export function findCourseMatches(catalog, campus, rawQuery, limit=5) {
  const query=normalizeCourseQuery(rawQuery);
  const parsed=parseCourseQuery(rawQuery);
  const rows=catalog.filter(row=>row.campus===campus);
  const exact=parsed ? rows.find(row=>row.subject===parsed.subject&&row.course===parsed.course) : null;
  const publicRow=row=>({campus:row.campus,subject:row.subject,course:row.course,title:row.title||''});
  if(exact)return {found:true,course:publicRow(exact),suggestions:[]};
  if(!query)return {found:false,course:null,suggestions:[]};
  const suggestions=[];
  // A code may exist in the other campus's historical archive. Suggest that
  // explicitly rather than silently claiming it exists at the chosen campus.
  if(parsed){
    const other=catalog.find(row=>row.campus!==campus && row.subject===parsed.subject && row.course===parsed.course);
    if(other)suggestions.push({rank:1,row:other});
  }
  const compact=query.replace(/\s/g,'');
  if(parsed) {
    const typedNumber=Number(parsed.course.slice(0,3));
    for(const row of rows) {
      let rank=null;
      const number=Number(row.course.slice(0,3));
      const difference=Math.abs(number-typedNumber);
      if(row.subject===parsed.subject) {
        if(row.course.startsWith(parsed.course)||parsed.course.startsWith(row.course)) rank=0;
        else if(difference===0)rank=1;
        else if(difference<=3)rank=3+difference;
        else if(difference<=20)rank=10+difference;
      } else {
        const edit=distance(row.subject,parsed.subject);
        if(edit<=2 && row.course===parsed.course)rank=2+edit+(row.subject[0]!==parsed.subject[0]?3:0);
        else if(edit===1 && difference<=2)rank=8+difference;
      }
      if(rank!==null)suggestions.push({rank,row});
    }
  } else if(compact.length>=3) {
    // Title and prefix search: useful when students enter a name rather than a code.
    const lower=query.toLowerCase();
    for(const row of rows) {
      const name=String(row.title||'').toLowerCase();
      const code=`${row.subject} ${row.course}`;
      if(code.startsWith(query)||name.startsWith(lower))suggestions.push({rank:0,row});
      else if(name.includes(lower))suggestions.push({rank:4,row});
    }
  }
  suggestions.sort((a,b)=>a.rank-b.rank || a.row.subject.localeCompare(b.row.subject) || a.row.course.localeCompare(b.row.course));
  return {found:false,course:null,suggestions:suggestions.slice(0,Math.max(0,Math.min(5,limit))).map(x=>publicRow(x.row))};
}

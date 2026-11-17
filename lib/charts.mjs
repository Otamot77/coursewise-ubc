/** Accessible SVG charts with explicit pixel geometry: no percentage-height CSS bars. */
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const one = value => Number(value).toFixed(1);

/** Bins are the validated public UBC grade-count bins from aggregateDistributions(). */
export function gradeDistributionSvg(bins, title='Published student counts by grade range') {
  if (!Array.isArray(bins) || bins.length !== 11) return '<p class="notice-text">No published grade counts for this selection.</p>';
  const max = Math.max(1, ...bins.map(b => numeric(b.value) ?? 0));
  const niceMax = Math.max(1, Math.ceil(max / 5) * 5);
  const baseY = 205, plotH = 155, x0 = 73, step = 78, width=960;
  const grid = [0, .25, .5, .75, 1].map(frac => {
    const y = (baseY - frac * plotH).toFixed(2);
    return `<line x1="49" x2="938" y1="${y}" y2="${y}" stroke="#dfeee7" stroke-width="1" stroke-dasharray="${frac === 0 ? '0' : '4 5'}"/><text x="40" y="${Number(y)+4}" text-anchor="end" font-size="11" fill="#6e887d">${Math.round(niceMax * frac)}</text>`;
  }).join('');
  const bars = bins.map((band, i) => {
    const x=x0+i*step;
    const count=numeric(band.value);
    const h=count == null ? 0 : Math.max(0, count/niceMax * plotH);
    const y=baseY-h;
    const display = count == null ? 'N/A' : `${band.incomplete ? '≥ ' : ''}${count.toLocaleString()}`;
    const fill = band.incomplete ? 'url(#cw-partial-bar)' : '#239c79';
    const bar = count == null
      ? `<rect x="${x}" y="185" width="43" height="20" rx="3" fill="url(#cw-missing-bar)"/>`
      : h > 0 ? `<rect class="distribution-svg-bar" data-count="${count}" x="${x}" y="${y.toFixed(2)}" width="43" height="${h.toFixed(2)}" rx="3" fill="${fill}"><title>${esc(band.range)}: ${esc(display)} students</title></rect>` : '';
    const labelY=count == null ? 176 : Math.max(27,y-8);
    return `<g>${bar}<text x="${x+21.5}" y="${labelY.toFixed(2)}" text-anchor="middle" fill="#245d4d" font-size="12" font-weight="700">${esc(display)}</text><text x="${x+21.5}" y="226" text-anchor="middle" font-size="11" font-weight="700" fill="#2d544a">${esc(band.key)}</text><text x="${x+21.5}" y="246" text-anchor="middle" font-size="11" fill="#788f83">${esc(band.label)}</text></g>`;
  }).join('');
  return `<div class="grade-svg-scroll"><svg class="grade-distribution-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 260" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><defs><pattern id="cw-partial-bar" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="9" height="9" fill="#79c9aa"/><rect width="4" height="9" fill="#239c79"/></pattern><pattern id="cw-missing-bar" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f4f6f4"/><rect width="3" height="8" fill="#c5d5cd"/></pattern></defs>${grid}${bars}</svg></div>`;
}

/** Course-average history, not individual marks. Y axis is explicitly labeled and scaled. */
export function historyTrendSvg(history, title='Historical course averages') {
  const rows=(Array.isArray(history) ? history : []).filter(r => numeric(r.average) != null && typeof r.yearsession==='string').slice(-24);
  if (!rows.length) return '<p class="notice-text">No historical course averages published.</p>';
  const low=Math.min(...rows.map(r=>r.average)), high=Math.max(...rows.map(r=>r.average));
  let minY=Math.max(0, Math.floor((low-4)/5)*5), maxY=Math.min(100,Math.ceil((high+4)/5)*5);
  if(maxY-minY<10){minY=Math.max(0,minY-5);maxY=Math.min(100,maxY+5);}
  const left=47,right=614,top=24,bottom=165;
  const y=value=>bottom-(value-minY)/Math.max(1,maxY-minY)*(bottom-top);
  const x=i=>left+(rows.length===1?(right-left)/2:i*(right-left)/(rows.length-1));
  const grid=[minY,(minY+maxY)/2,maxY].map(v=>`<line x1="${left}" x2="${right}" y1="${y(v).toFixed(2)}" y2="${y(v).toFixed(2)}" stroke="#e1ece8" stroke-dasharray="3 5"/><text x="${left-10}" y="${(y(v)+4).toFixed(2)}" text-anchor="end" font-size="11" fill="#7d958b">${one(v)}%</text>`).join('');
  const points=rows.map((r,i)=>`${x(i).toFixed(2)},${y(r.average).toFixed(2)}`).join(' ');
  const step=Math.max(1,Math.ceil(rows.length/6));
  const marks=rows.map((r,i)=>`<g><circle cx="${x(i).toFixed(2)}" cy="${y(r.average).toFixed(2)}" r="${i===rows.length-1?5:3.6}" fill="${i===rows.length-1?'#117b5c':'#55b898'}" stroke="#fff" stroke-width="1.5"><title>${esc(r.yearsession)}: ${one(r.average)}%</title></circle>${i===0||i===rows.length-1||i%step===0 ? `<text x="${x(i).toFixed(2)}" y="190" text-anchor="middle" font-size="10" fill="#728d82">${esc(r.yearsession)}</text>` : ''}</g>`).join('');
  return `<div class="history-svg-scroll"><svg class="course-history-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 206" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${grid}<polyline fill="none" stroke="#159c76" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points}"/>${marks}</svg></div>`;
}

/** Small, legible trend for saved courses. */
export function compactTrendSvg(history) {
  const rows=(Array.isArray(history)?history:[]).filter(r=>numeric(r.average)!=null).slice(-12);
  if(!rows.length)return '';
  const lo=Math.max(0,Math.min(...rows.map(x=>x.average))-3);
  const hi=Math.min(100,Math.max(...rows.map(x=>x.average))+3);
  const coords=rows.map((r,i)=>`${8+(rows.length===1?60:i*120/(rows.length-1))},${34-(r.average-lo)/(hi-lo||1)*27}`).join(' ');
  return `<svg class="course-mini-trend" viewBox="0 0 136 42" role="img" aria-label="Historical course mean trend"><polyline fill="none" stroke="#269b79" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/></svg>`;
}

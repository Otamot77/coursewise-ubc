/** Local-only semester lineups and grades-only swaps. Pure functions for testability. */
import { normalizeSavedCourses, courseKey } from './schedule.mjs';

export const MAX_LINEUPS = 12;
const clean = value => String(value ?? '').replace(/[<>\x00-\x1F]/g,'').trim().slice(0,55);
const validSettings = value => ({
  target: Number.isFinite(value?.target) && value.target>=0 && value.target<=100 ? value.target : 80,
  entries: value?.entries && typeof value.entries === 'object' && !Array.isArray(value.entries) ? structuredClone(value.entries) : {}
});
export function makeLineup(id,name,courses=[],planner={}) {
  return {id:String(id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||'main',name:clean(name)||'My semester',
    courses:normalizeSavedCourses(courses),planner:validSettings(planner)};
}
export function readLineups(raw,oldCourses=[],oldPlanner={}) {
  const fallback=makeLineup('main','My semester',oldCourses,oldPlanner);
  if (!raw || !Array.isArray(raw.lineups)) return {activeId:'main',lineups:[fallback]};
  const ids=new Set(),lineups=[];
  for (const rawItem of raw.lineups.slice(0,MAX_LINEUPS)) {
    const entry=makeLineup(rawItem.id,rawItem.name,rawItem.courses,rawItem.planner);
    if(ids.has(entry.id))continue;
    ids.add(entry.id);lineups.push(entry);
  }
  if (!lineups.length)return {activeId:'main',lineups:[fallback]};
  return {activeId:lineups.some(x=>x.id===raw.activeId)?raw.activeId:lineups[0].id,lineups};
}
export function swapCourse(courses,oldKey,replacement) {
  const base=normalizeSavedCourses(courses),candidate=normalizeSavedCourses([replacement])[0];
  if (!candidate)throw new Error('Enter a valid replacement course.');
  const index=base.findIndex(x=>courseKey(x)===oldKey);
  if(index<0)throw new Error('The original course is no longer in this lineup.');
  if(base.some((x,i)=>i!==index&&courseKey(x)===courseKey(candidate)))throw new Error('This course is already in your lineup.');
  const newCourses=base.slice();
  newCourses[index]={...candidate,sections:[]}; // Never carry sections from a different course.
  return newCourses;
}
export function historicSemesterBaseline(courses,profiles,entries={}) {
  let total=0,weighted=0,covered=0;
  for(const c of courses){
    const key=courseKey(c), credits=entries[key]?.credits??3;
    const mean=profiles.get(key)?.average5 ?? profiles.get(key)?.average;
    if(!Number.isFinite(credits)||credits<=0 || !Number.isFinite(mean))return null;
    weighted+=mean*credits;total+=credits;covered++;
  }
  return covered>0 && total>0 ? weighted/total : null;
}

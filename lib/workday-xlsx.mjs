/**
 * Local-only Workday .xlsx schedule reader. Deliberately supports the XLSX XML
 * subset needed for course listings (shared/inline strings, multiple sheets).
 * No third-party script, cloud upload, macros or formula evaluation.
 */
import { parseSchedule, courseKey } from './schedule.mjs';

const MAX_FILE = 8 * 1024 * 1024;
const MAX_XML = 12 * 1024 * 1024;
const MAX_ROWS = 12000;
const MAX_SHEETS = 20;
const MAX_ENTRIES = 1000;
const decoder = new TextDecoder('utf-8');
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function xmlText(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (whole, code) => {
    if (code.startsWith('#')) {
      const point = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    }
    return entities[code.toLowerCase()] ?? whole;
  });
}

function attr(fragment, name) {
  // Works with <c r="A1">, <r:id> or XML namespace attributes.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = fragment.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? xmlText(match[1] ?? match[2]) : null;
}

function textRuns(fragment) {
  return [...fragment.matchAll(/<(?:[a-z][\w.-]*:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-z][\w.-]*:)?t>/gi)]
    .map(m => xmlText(m[1])).join('');
}

function sharedStrings(xml) {
  if (!xml) return [];
  const values = [];
  for (const match of xml.matchAll(/<(?:[a-z][\w.-]*:)?si\b[^>]*>([\s\S]*?)<\/(?:[a-z][\w.-]*:)?si>/gi)) {
    values.push(textRuns(match[1]));
    if (values.length > 100000) throw new Error('This workbook has too many shared strings.');
  }
  return values;
}

function cellsFromRow(xml, strings) {
  const cells = [];
  for (const m of xml.matchAll(/<(?:[a-z][\w.-]*:)?c\b([^>]*?)>([\s\S]*?)<\/(?:[a-z][\w.-]*:)?c>/gi)) {
    const type = attr(m[1], 't');
    const value = m[2].match(/<(?:[a-z][\w.-]*:)?v\b[^>]*>([\s\S]*?)<\/(?:[a-z][\w.-]*:)?v>/i)?.[1];
    const display = type === 'inlineStr' ? textRuns(m[2]) : type === 's' ? strings[Number(value)] ?? ''
      : type === 'str' ? xmlText(value ?? '') : type === 'e' ? '' : value != null ? xmlText(value) : '';
    if (display.trim()) cells.push({ col: attr(m[1], 'r')?.replace(/[0-9]/g, '').toUpperCase() ?? '', text: display.trim() });
    if (cells.length >= 150) break;
  }
  return cells;
}

function zipEntries(bytes) {
  if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Not an Excel .xlsx file (expected a ZIP-based workbook).');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = o => view.getUint16(o, true), u32 = o => view.getUint32(o, true);
  const start = Math.max(0, bytes.byteLength - 65557);
  let eocd = -1;
  for (let i=bytes.byteLength-22;i>=start;i--) if (u32(i)===0x06054b50) { eocd=i;break; }
  if (eocd < 0) throw new Error('The Excel ZIP directory is missing or damaged.');
  if (u16(eocd+4) !== 0 || u16(eocd+6) !== 0) throw new Error('Multi-part Excel archives are not supported.');
  const count=u16(eocd+10), offset=u32(eocd+16);
  if (count > MAX_ENTRIES || offset >= bytes.byteLength) throw new Error('The workbook is unusually large or damaged.');
  let pos=offset;
  const files=new Map();
  for (let i=0;i<count;i++) {
    if (pos+46 > bytes.byteLength || u32(pos)!==0x02014b50) throw new Error('The Excel ZIP directory is damaged.');
    const flags=u16(pos+8), method=u16(pos+10), compressed=u32(pos+20), uncompressed=u32(pos+24);
    const nameLen=u16(pos+28), extra=u16(pos+30), comment=u16(pos+32), local=u32(pos+42);
    const next=pos+46+nameLen+extra+comment;
    if (next > bytes.byteLength) throw new Error('The Excel ZIP directory is damaged.');
    const name=decoder.decode(bytes.subarray(pos+46,pos+46+nameLen));
    if (flags & 1) throw new Error('Password-protected XLSX files are not supported. Please export without a password.');
    if (uncompressed === 0xffffffff || compressed === 0xffffffff || local === 0xffffffff) throw new Error('Zip64 Excel exports are not supported.');
    if (uncompressed > MAX_XML) throw new Error('A worksheet is too large to import safely.');
    files.set(name.replace(/\\/g,'/').replace(/^\/+/,''), {method,compressed,uncompressed,local});
    pos=next;
  }
  return {files,bytes,view};
}

async function unzipXml(zip, name) {
  const entry=zip.files.get(name);
  if (!entry) return null;
  const {view,bytes}=zip, pos=entry.local;
  if (pos+30>bytes.byteLength || view.getUint32(pos,true)!==0x04034b50) throw new Error('The worksheet ZIP header is damaged.');
  const start=pos+30+view.getUint16(pos+26,true)+view.getUint16(pos+28,true);
  const end=start+entry.compressed;
  if (end>bytes.byteLength) throw new Error('The worksheet ZIP data is truncated.');
  if (![0,8].includes(entry.method)) throw new Error('Unsupported XLSX compression method.');
  const chunk=bytes.subarray(start,end);
  if (entry.method===0) return decoder.decode(chunk);
  if (typeof DecompressionStream==='undefined') throw new Error('This browser cannot read compressed XLSX files. Please use an updated Chrome, Edge, or Firefox.');
  let reader;
  try { reader=new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(); }
  catch { throw new Error('Your browser does not support XLSX decompression. Please update Chrome, Edge, or Firefox.'); }
  const parts=[];
  let total=0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_XML) throw new Error('A worksheet is too large to import safely.');
      parts.push(value);
    }
  } catch(error) { try { await reader.cancel(); } catch { /* done */ } throw error; }
  const output=new Uint8Array(total);let at=0;
  for(const part of parts){output.set(part,at);at+=part.length;}
  return decoder.decode(output);
}

function worksheetPaths(workbookXml, relsXml, zip) {
  if (!workbookXml) throw new Error('This file does not contain an Excel workbook.');
  const targets=new Map();
  for(const m of (relsXml ?? '').matchAll(/<(?:[a-z][\w.-]*:)?Relationship\b([^>]*?)\/?\s*>/gi)) {
    const id=attr(m[1],'Id'), target=attr(m[1],'Target');
    if(id && target && /(?:^|\/)worksheets\//.test(target)) {
      const normalized=target.startsWith('/')?target.replace(/^\/+/, ''):'xl/'+target.replace(/^\.\//,'');
      if(!normalized.split('/').includes('..'))targets.set(id,normalized);
    }
  }
  const paths=[];
  for(const m of workbookXml.matchAll(/<(?:[a-z][\w.-]*:)?sheet\b([^>]*?)\/?\s*>/gi)) {
    const relationship=attr(m[1],'r:id');
    let path=targets.get(relationship);
    // Some third-party exports omit relationships but follow standard filenames.
    if(!path && !relsXml)path=`xl/worksheets/sheet${paths.length+1}.xml`;
    if(path && zip.files.has(path) && !paths.includes(path))paths.push(path);
    if(paths.length>=MAX_SHEETS)break;
  }
  if(!paths.length){
    for(const key of zip.files.keys())if(/^xl\/worksheets\/sheet\d+\.xml$/i.test(key))paths.push(key);
  }
  return paths.slice(0,MAX_SHEETS);
}

/** Extracts only course identifiers (and sections when listed separately).
 * Returns the same shape as parseSchedule(). Data is never transmitted.
 */
export async function parseWorkdayXlsx(fileOrBuffer, defaultCampus='UBCV') {
  const buffer = typeof fileOrBuffer?.arrayBuffer === 'function' ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) throw new TypeError('Expected an XLSX file or ArrayBuffer.');
  const bytes=buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);
  if (bytes.byteLength>MAX_FILE) throw new Error('The XLSX is too large. Please use a workbook under 8 MB.');
  const zip=zipEntries(bytes);
  const workbook=await unzipXml(zip,'xl/workbook.xml');
  const rels=await unzipXml(zip,'xl/_rels/workbook.xml.rels');
  const paths=worksheetPaths(workbook,rels,zip);
  if(!paths.length)throw new Error('No readable worksheet found in this Excel file.');
  const strings=sharedStrings(await unzipXml(zip,'xl/sharedStrings.xml'));
  const courses=new Map();
  for(const path of paths){
    const xml=await unzipXml(zip,path);
    if(!xml)continue;
    let processed=0,sectionCol=null;
    for(const match of xml.matchAll(/<(?:[a-z][\w.-]*:)?row\b[^>]*>([\s\S]*?)<\/(?:[a-z][\w.-]*:)?row>/gi)) {
      if (++processed>MAX_ROWS)break;
      const cells=cellsFromRow(match[1],strings);
      if(!cells.length)continue;
      // Workday sometimes exports the course code and section as separate cells.
      for(const cell of cells)if(/^(?:course\s+)?section(?:\s+(?:number|id))?$/i.test(cell.text))sectionCol=cell.col;
      const found=parseSchedule(cells.map(c=>c.text).join(' '),defaultCampus);
      if(found.length===1 && sectionCol){
        const candidate=cells.find(c=>c.col===sectionCol)?.text.match(/^\s*(\d{3}[A-Z]?)\s*$/i)?.[1];
        if(candidate && !found[0].sections.includes(candidate))found[0].sections.push(candidate.toUpperCase());
      }
      for(const course of found) {
        const id=courseKey(course);
        if(!courses.has(id))courses.set(id,course);
        else courses.get(id).sections=[...new Set([...courses.get(id).sections,...course.sections])];
        if(courses.size>=35)break;
      }
      if(courses.size>=35)break;
    }
    if(courses.size>=35)break;
  }
  return [...courses.values()];
}

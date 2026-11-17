import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseWorkdayXlsx } from '../lib/workday-xlsx.mjs';

const xml = String.raw;
const workbook = xml`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Registered Courses" sheetId="1" r:id="rId1"/><sheet name="Saved Schedule" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const rels = xml`<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
const shared = xml`<?xml version="1.0"?><sst><si><t>Course</t></si><si><t>Section</t></si><si><r><t>CPSC_V </t></r><r><t>110</t></r></si><si><t>MATH_V 100</t></si><si><t>CPEN_V 221A</t></si></sst>`;
const sheet1 = xml`<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>101</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>201</v></c></row><row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4" t="inlineStr"><is><t>101</t></is></c></row></sheetData></worksheet>`;
const sheet2 = xml`<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>CHEM_O 121</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>CPSC_V 110 - 102</t></is></c></row></sheetData></worksheet>`;

function buildXlsx(entries, compressed=true) {
  const encoder=new TextEncoder();
  let at=0;
  const locals=[],centrals=[];
  for(const [name,data] of Object.entries(entries)) {
    const nameBytes=encoder.encode(name), raw=encoder.encode(data);
    const body=compressed?deflateRawSync(raw):Buffer.from(raw);
    const method=compressed?8:0;
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);
    local.writeUInt32LE(body.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(nameBytes.length,26);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(method,10);
    central.writeUInt32LE(body.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(at,42);
    locals.push(local,Buffer.from(nameBytes),body);centrals.push(central,Buffer.from(nameBytes));
    at+=local.length+nameBytes.length+body.length;
  }
  const centralBytes=Buffer.concat(centrals);
  const footer=Buffer.alloc(22);footer.writeUInt32LE(0x06054b50,0);
  footer.writeUInt16LE(Object.keys(entries).length,8);footer.writeUInt16LE(Object.keys(entries).length,10);
  footer.writeUInt32LE(centralBytes.length,12);footer.writeUInt32LE(at,16);
  const result=Buffer.concat([...locals,centralBytes,footer]);
  return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength);
}
const documents={'xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':rels,'xl/sharedStrings.xml':shared,'xl/worksheets/sheet1.xml':sheet1,'xl/worksheets/sheet2.xml':sheet2};

test('reads compressed Workday XLSX with shared strings, section columns and multiple sheets', async () => {
  const courses=await parseWorkdayXlsx(buildXlsx(documents));
  assert.deepEqual(courses.map(c=>[c.campus,c.subject,c.course,c.sections]),[
    ['UBCV','CPSC','110',['101','102']],
    ['UBCV','MATH','100',['201']],
    ['UBCV','CPEN','221A',['101']],
    ['UBCO','CHEM','121',[]]
  ]);
});

test('also reads uncompressed XLSX and preserves default campus for plain course codes', async () => {
  const rows={...documents, 'xl/worksheets/sheet2.xml':xml`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>STAT 200</t></is></c></row></sheetData></worksheet>`};
  const courses=await parseWorkdayXlsx(buildXlsx(rows,false),'UBCO');
  assert.equal(courses.find(c=>c.subject==='STAT')?.campus,'UBCO');
});

test('invalid and oversized spreadsheets return actionable errors', async () => {
  await assert.rejects(parseWorkdayXlsx(new TextEncoder().encode('not an xlsx').buffer), /Not an Excel/);
  await assert.rejects(parseWorkdayXlsx(new Uint8Array(9*1024*1024).buffer), /too large/);
});

test('spreadsheets without course data return no fabricated courses', async () => {
  const empty={...documents, 'xl/worksheets/sheet1.xml':xml`<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Student ID</t></is></c><c r="B1"><v>12345</v></c></row></sheetData></worksheet>`, 'xl/worksheets/sheet2.xml':xml`<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>My Account</t></is></c></row></sheetData></worksheet>`};
  assert.deepEqual(await parseWorkdayXlsx(buildXlsx(empty)),[]);
});

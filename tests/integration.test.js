import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import * as xml from '@xmldom/xmldom';
import { unzipSync, strFromU8 } from 'fflate';
import { readExcelBytes } from '../src/parser.js';
import { runRules } from '../src/rules.js';
import { buildPlan, applyPlan } from '../src/solver.js';
import { exportWorkbook } from '../src/exporter.js';

const sample = process.env.TKB_SAMPLE_XLSX;
test('cross-day moves retain assembly and the original inclusive Excel totals', { skip: !sample }, () => {
  const book = XLSX.read(readFileSync(sample), { type: 'buffer' });
  book.Sheets['THỨ HAI'].D9 = { t: 's', v: '1G' };
  book.Sheets['THỨ HAI'].K9.v += 1;
  book.Sheets.Sheet1.D6.v += 1;
  book.Sheets.Sheet1.I6.v += 1;
  book.Sheets['Tổng tiết'] = book.Sheets.Sheet1;
  delete book.Sheets.Sheet1;
  book.SheetNames[5] = 'Tổng tiết';
  const original = readExcelBytes(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), XLSX, 'fixture.xlsx');
  const teacher = original.data.days[0].rows.find(r => r.row === 24);
  const moves = [{ teacherKey: teacher.teacherKey, raw: '1G', from: { day: 'THỨ HAI', cell: 'D24' }, to: { day: 'THỨ BA', cell: 'G24' } }];
  const reopened = readExcelBytes(exportWorkbook(original, moves, xml), XLSX, 'exported.xlsx');
  const row = reopened.data.days[0].rows.find(r => r.row === 24);
  assert.equal(row.actualTotal, 5);
  assert.equal(row.sourceTotal.value, 6);
  assert.equal(row.lessons[0].raw, 'CC phân hiệu');
  assert.equal(row.lessons[0].kind, 'assembly');
  assert.equal(reopened.data.summary[0].sheetName, 'Tổng tiết');
  assert.equal(reopened.data.summary.find(r => r.teacherKey === teacher.teacherKey).dailyTotals[0].value, 6);
  assert.ok(!reopened.data.warnings.some(w => w.code === 'TOTAL_MISMATCH'));
});
test('real SheetJS read, solve, export and reopen preserve workbook content and formatting', { skip: !sample }, () => {
  const original = readExcelBytes(readFileSync(sample), XLSX, 'sample.xlsx');
  assert.deepEqual(original.data.stats, { days: 5, teachers: 24, occupiedSlots: 454 });
  assert.equal(runRules(original.data).length, 15);
  const snapshot = structuredClone(original.data);
  const plan = buildPlan(original.data);
  assert.equal(plan.remaining, 0); assert.ok(plan.moves.length > 1);
  const next = applyPlan(original.data, plan.moves);
  const bytes = exportWorkbook(original, plan.moves, xml);
  const reopened = readExcelBytes(bytes, XLSX, 'reopened.xlsx');
  assert.equal(runRules(reopened.data).length, 0);
  assert.deepEqual(reopened.data.warnings, original.data.warnings);
  assert.deepEqual(reopened.data.stats, original.data.stats);
  assert.deepEqual(original.data, snapshot);
  for (let d = 0; d < next.days.length; d++) for (let r = 0; r < next.days[d].rows.length; r++) {
    assert.deepEqual(reopened.data.days[d].rows[r].lessons, next.days[d].rows[r].lessons);
    const row = next.days[d].rows[r];
    assert.equal(reopened.data.days[d].rows[r].sourceTotal.value, row.actualTotal + (row.sourceTotal.includesAssembly ? row.assemblyCount : 0));
  }
  const beforeFiles = unzipSync(original.originalBytes), afterFiles = unzipSync(bytes);
  assert.deepEqual(Object.keys(beforeFiles).sort(), Object.keys(afterFiles).sort());
  const serialize = node => new xml.XMLSerializer().serializeToString(node);
  const parse = bytes => new xml.DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  const changedParts = [];
  for (const [path, before] of Object.entries(beforeFiles)) {
    const after = afterFiles[path];
    if (Buffer.from(before).equals(Buffer.from(after))) continue;
    changedParts.push(path);
    if (path === 'xl/workbook.xml') {
      const a = parse(before), b = parse(after);
      for (const doc of [a, b]) {
        const calc = doc.getElementsByTagName('calcPr')[0]; calc?.parentNode.removeChild(calc);
      }
      assert.equal(serialize(a), serialize(b));
      continue;
    }
    assert.match(path, /^xl\/worksheets\/sheet\d+\.xml$/);
    const a = parse(before), b = parse(after);
    const beforeCells = new Map(Array.from(a.getElementsByTagName('c')).map(c => [c.getAttribute('r'), c]));
    const afterCells = new Map(Array.from(b.getElementsByTagName('c')).map(c => [c.getAttribute('r'), c]));
    for (const [address, cell] of beforeCells) {
      const other = afterCells.get(address); assert.ok(other, address);
      assert.equal(cell.getAttribute('s'), other.getAttribute('s'), `style ${path}!${address}`);
      const formula = cell.getElementsByTagName('f')[0];
      if (formula) assert.equal(serialize(formula), serialize(other.getElementsByTagName('f')[0]));
      if (Number(address.match(/\d+$/)[0]) <= 8) assert.equal(serialize(cell), serialize(other));
    }
    // Remove only changed value payloads; the remaining XML must be identical.
    for (const address of new Set([...beforeCells.keys(), ...afterCells.keys()])) {
      const ac = beforeCells.get(address), bc = afterCells.get(address);
      if (ac && bc && serialize(ac) === serialize(bc)) continue;
      if (!ac) {
        const sheetIndex = Number(path.match(/sheet(\d+)/)[1]) - 1;
        const day = next.days.find(d => (d.sourceName || d.name) === reopened.workbook.SheetNames[sheetIndex]);
        assert.ok(day?.rows.some(row => row.lessons.some(l => l.cell === address && l.raw)), `new cell belongs to a moved lesson: ${path}!${address}`);
        assert.ok(bc); assert.equal(bc.getAttribute('s') || '', '');
        bc.parentNode.removeChild(bc);
        continue;
      }
      assert.ok(bc, 'Existing styled cells must be retained');
      for (const cell of [ac, bc]) {
        cell.removeAttribute('t');
        for (const child of Array.from(cell.childNodes)) if (['v', 'is'].includes(child.localName)) cell.removeChild(child);
      }
    }
    assert.equal(serialize(a), serialize(b), `preserved structure ${path}`);
  }
  assert.equal(reopened.workbook.Sheets['THỨ HAI'].C24.v, 'CC phân hiệu');
  assert.equal(reopened.data.days[0].rows.find(r => r.row === 24).assemblyCount, 1);
  assert.ok(changedParts.length >= 2);
  assert.deepEqual(exportWorkbook(original, [], xml), original.originalBytes);
});

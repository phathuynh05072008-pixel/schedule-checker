import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import * as xml from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import { readExcelBytes, isTeachingLesson } from '../src/parser.js';
import { runRules } from '../src/rules.js';
import { buildPlan, applyPlan } from '../src/solver.js';
import { exportWorkbook } from '../src/exporter.js';

const folder = process.argv[2];
if (!folder) throw new Error('Usage: node scripts/check-real-workbooks.mjs <sample folder>');
const output = resolve('.tmp/real-workbooks');
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const multiset = data => data.days.flatMap(day => day.rows.flatMap(row =>
  row.lessons.filter(isTeachingLesson).map(l => `${row.teacherKey}:${l.raw}`))).sort();
const report = [];
for (const [index, file] of (await readdir(folder)).filter(f => /\.xlsx$/i.test(f)).entries()) {
  const source = resolve(folder, file);
  const original = readExcelBytes(await readFile(source), XLSX, file);
  const sourceHash = hash(original.originalBytes);
  const snapshot = structuredClone(original.data);
  const start = performance.now();
  const plan = buildPlan(original.data);
  const milliseconds = Math.round(performance.now() - start);
  const next = applyPlan(original.data, plan.moves);
  const exported = exportWorkbook(original, plan.moves, xml);
  const reopened = readExcelBytes(exported, XLSX, 'exported.xlsx');
  assert.equal(plan.remaining, 0, file);
  assert.deepEqual(runRules(reopened.data), []);
  assert.deepEqual(original.data, snapshot);
  assert.deepEqual(multiset(reopened.data), multiset(original.data));
  assert.deepEqual(reopened.data.stats, original.data.stats);
  assert.deepEqual(reopened.workbook.SheetNames, original.workbook.SheetNames);
  assert.deepEqual(reopened.data.warnings, original.data.warnings);
  for (const [d, day] of next.days.entries())
    for (const [r, row] of day.rows.entries())
      assert.deepEqual(reopened.data.days[d].rows[r].lessons, row.lessons);
  // Independent literal oracle: do not reuse the limits or grouping from rules.js.
  for (const [d, day] of reopened.data.days.entries()) {
    const classCounts = new Map(), occupied = new Set();
    for (const row of day.rows) {
      assert.ok(row.lessons.filter(isTeachingLesson).length <= [6, 7, 4, 7, 6][d]);
      const blocks = new Map();
      for (const lesson of row.lessons) {
        if (lesson.kind === 'assembly') {
          const prior = original.data.days[d].rows.find(r => r.teacherKey === row.teacherKey).lessons.find(l => l.cell === lesson.cell);
          assert.equal(lesson.raw, prior.raw);
        }
        if (!lesson.className) continue;
        const slot = `${lesson.session}:${lesson.period}:${lesson.className}`;
        assert.ok(!occupied.has(slot), `class collision: ${file} ${day.name} ${slot}`); occupied.add(slot);
        const key = `${lesson.session}:${lesson.className}`;
        classCounts.set(key, (classCounts.get(key) || 0) + 1);
        if (!blocks.has(key)) blocks.set(key, []);
        blocks.get(key).push(lesson.period);
      }
      for (const periods of blocks.values()) {
        periods.sort((a, b) => a - b);
        assert.equal(periods.at(-1) - periods[0] + 1, periods.length, 'interleaved teacher lessons');
      }
    }
    for (const [key, count] of classCounts)
      assert.ok(count <= (key.startsWith('Sáng:') ? [1, 3, 2, 3, 2][d] : 2), `class limit: ${key}`);
  }
  const oldZip = unzipSync(original.originalBytes), newZip = unzipSync(exported);
  assert.deepEqual(Object.keys(newZip).sort(), Object.keys(oldZip).sort());
  const activeSheets = new Set(original.data.days.map(d => d.sourceName || d.name));
  original.data.summary.forEach(row => activeSheets.add(row.sheetName));
  for (const [path, bytes] of Object.entries(oldZip)) {
    const match = path.match(/^xl\/worksheets\/sheet(\d+)\.xml$/);
    if (path === 'xl/workbook.xml' || (match && activeSheets.has(original.workbook.SheetNames[Number(match[1]) - 1]))) continue;
    assert.deepEqual(newZip[path], bytes, `unchanged workbook part: ${path}`);
  }
  assert.equal(hash(await readFile(source)), sourceHash, 'original file unchanged');
  const target = resolve(output, `sample-${index + 1}.xlsx`);
  const expectedPath = resolve(output, `sample-${index + 1}-expected.json`);
  const expected = reopened.data.days.map(day => ({ name: day.sourceName || day.name,
    cells: Object.fromEntries(day.rows.flatMap(row => [
      ...row.lessons.map(l => [l.cell, l.raw]),
      ...(row.sourceTotal && reopened.workbook.Sheets[day.sourceName || day.name][row.sourceTotal.cell]?.v !== undefined
        ? [[row.sourceTotal.cell, row.actualTotal + (row.sourceTotal.includesAssembly ? row.assemblyCount : 0)]] : []),
    ])),
  }));
  if (reopened.data.summary.length) expected.push({ name: reopened.data.summary[0].sheetName,
    cells: Object.fromEntries(reopened.data.summary.flatMap(row => [
      ...row.dailyTotals.map(total => [total.cell, reopened.workbook.Sheets[row.sheetName][total.cell]?.v === undefined ? '' : total.value]),
      ...(row.weeklyTotal ? [[row.weeklyTotal.cell, reopened.workbook.Sheets[row.sheetName][row.weeklyTotal.cell]?.v === undefined ? '' : row.weeklyTotal.value]] : []),
    ])),
  });
  await writeFile(target, exported); await writeFile(expectedPath, JSON.stringify(expected, null, 2));
  report.push({ file, source, exported: target, expectedPath, teachers: original.data.stats.teachers,
    lessons: original.data.stats.occupiedSlots, before: runRules(original.data).length,
    changes: plan.moves.length, swaps: plan.moves.filter(m => m.type === 'swap').length,
    after: plan.remaining, milliseconds, warnings: original.data.warnings.length,
    invariants: 'lesson counts, consecutive blocks, conflicts, limits, assembly, archives, styles, original hash passed' });
}
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

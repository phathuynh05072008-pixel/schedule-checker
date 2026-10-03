import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_NAMES, parseClass, parseWorkbook, readExcelBytes, readExcelFile } from '../src/parser.js';

function fixture() {
  const workbook = { SheetNames: [...DAY_NAMES, 'Sheet1'], Sheets: {} };
  const put = (sheet, cell, v) => { sheet[cell] = { v }; };
  for (const day of DAY_NAMES) {
    const sheet = { '!ref': 'A1:K10', '!merges': [
      { s: { r: 6, c: 2 }, e: { r: 6, c: 5 } },
      { s: { r: 8, c: 0 }, e: { r: 9, c: 0 } },
    ] };
    workbook.Sheets[day] = sheet;
    put(sheet, 'A7', 'Môn'); put(sheet, 'B7', 'Tên GV'); put(sheet, 'C7', 'SÁNG');
    const count = day === 'THỨ TƯ' ? 4 : 7;
    if (count === 7) {
      put(sheet, 'G7', 'CHIỀU');
      sheet['!merges'].push({ s: { r: 6, c: 6 }, e: { r: 6, c: 8 } });
    }
    for (let i = 0; i < count; i++) put(sheet, `${String.fromCharCode(67 + i)}8`, `TIẾT ${i < 4 ? i + 1 : i - 3}`);
    put(sheet, 'A9', 'TIẾNG\n ANH'); put(sheet, 'B9', ' Nguyễn  An '); put(sheet, 'B10', 'Trần Bình');
    put(sheet, 'C9', 'HĐTN 2B');
    put(sheet, day === 'THỨ TƯ' ? 'H9' : 'K9', 1);
    put(sheet, day === 'THỨ TƯ' ? 'H10' : 'K10', 0);
  }
  const summary = { '!ref': 'A1:I7', '!merges': [] };
  workbook.Sheets.Sheet1 = summary;
  put(summary, 'C4', 'Tên GV'); put(summary, 'C6', 'Nguyễn An'); put(summary, 'C7', 'Trần Bình');
  for (let i = 0; i < 5; i++) {
    const col = String.fromCharCode(68 + i);
    put(summary, col + '4', DAY_NAMES[i]); put(summary, col + '6', 1); put(summary, col + '7', 0);
  }
  put(summary, 'I6', 5); put(summary, 'I7', 0);
  return workbook;
}

test('summary is optional and recognized by headers, independent of its name', () => {
  const workbook = fixture();
  workbook.Sheets['Tổng tiết'] = workbook.Sheets.Sheet1;
  delete workbook.Sheets.Sheet1;
  workbook.SheetNames[5] = 'Tổng tiết';
  assert.equal(parseWorkbook(workbook).summary[0].sheetName, 'Tổng tiết');
  delete workbook.Sheets['Tổng tiết']; workbook.SheetNames.pop();
  const data = parseWorkbook(workbook);
  assert.equal(data.days.length, 5); assert.deepEqual(data.summary, []);
  assert.ok(data.notes.some(n => n.includes('Không có bảng tổng hợp')));
  workbook.Sheets['Sheet1'] = { '!ref': 'A1:B2', A1: { v: 'Other data' } };
  workbook.SheetNames.push('Sheet1');
  assert.equal(parseWorkbook(workbook).days.length, 5);
});

test('recognizes aliases and shifted totals without inventing absent total columns', () => {
  const workbook = fixture();
  workbook.Sheets[' t2 '] = workbook.Sheets['THỨ HAI'];
  delete workbook.Sheets['THỨ HAI']; workbook.SheetNames[0] = ' t2 ';
  const monday = workbook.Sheets[' t2 '];
  for (const row of [9, 10]) { monday[`J${row}`] = monday[`K${row}`]; delete monday[`K${row}`]; }
  const data = parseWorkbook(workbook);
  assert.equal(data.days[0].sourceName, ' t2 ');
  assert.equal(data.days[0].totalColumn, 9);
  for (const row of [9, 10]) delete monday[`J${row}`];
  assert.equal(parseWorkbook(workbook).days[0].rows[0].sourceTotal, null);
  workbook.Sheets['THỨ HAI'] = monday; workbook.SheetNames.push('THỨ HAI');
  assert.throws(() => parseWorkbook(workbook), /nhiều sheet/);
});

test('finds a day from its worksheet title when the tab has an arbitrary name', () => {
  const workbook = fixture();
  workbook.Sheets['Lịch đầu tuần'] = workbook.Sheets['THỨ HAI'];
  workbook.Sheets['Lịch đầu tuần'].A5 = { v: 'Thứ Hai' };
  delete workbook.Sheets['THỨ HAI']; workbook.SheetNames[0] = 'Lịch đầu tuần';
  assert.equal(parseWorkbook(workbook).days[0].sourceName, 'Lịch đầu tuần');
});

test('normalizes NFC, activities, missing spaces and preserves raw input', () => {
  for (const text of ['HĐTN 2B', '2b', ' 2 B ', 'TNXH 2B', 'TCTV 2B', 'TCT 2B', 'CN 2B', 'ĐĐ2B'.normalize('NFD')]) {
    assert.equal(parseClass(text).className, '2B'); assert.equal(parseClass(text).raw, text);
  }
  assert.equal(parseClass('II').kind, 'unrecognized');
  assert.equal(parseClass('CC phân hiệu').className, null);
  assert.equal(parseClass(' ').kind, 'empty');
});
test('reads merged subjects, exact positions, daily totals without mutation', () => {
  const workbook = fixture(); const before = JSON.stringify(workbook);
  const result = parseWorkbook(workbook);
  assert.deepEqual(result.stats, { days: 5, teachers: 2, occupiedSlots: 5 });
  assert.equal(result.days[0].rows[1].subject, 'TIẾNG ANH');
  assert.equal(result.days[0].rows[0].lessons[0].cell, 'C9');
  assert.equal(result.days[2].slots.length, 4); assert.deepEqual(result.warnings, []);
  assert.equal(JSON.stringify(workbook), before);
});
test('Wednesday supports both the original morning-only and an afternoon timetable', () => {
  const workbook = fixture();
  const wednesday = workbook.Sheets['THỨ TƯ'];
  assert.equal(parseWorkbook(workbook).days[2].slots.length, 4);
  delete wednesday.H9; delete wednesday.H10;
  wednesday.G7 = { v: 'CHIỀU' };
  wednesday['!merges'].push({ s: { r: 6, c: 6 }, e: { r: 6, c: 8 } });
  for (const [cell, value] of [['G8', 'TIẾT 1'], ['H8', 'TIẾT 2'], ['I8', 'TIẾT 3'], ['G9', '1A'], ['H9', '1A'], ['I9', '2A']]) wednesday[cell] = { v: value };
  const data = parseWorkbook(workbook);
  assert.equal(data.days[2].slots.length, 7);
  assert.equal(data.days[2].rows[0].lessons.filter(l => l.session === 'Chiều' && l.className).length, 3);
});

test('reads horizontal merged teacher names without assigning a fake subject', () => {
  const workbook = fixture(); const day = workbook.Sheets['THỨ HAI'];
  day['!merges'].pop(); day['!merges'] = day['!merges'].filter(m => m.s.r !== 8);
  day['!merges'].push({ s: { r: 9, c: 0 }, e: { r: 9, c: 1 } });
  // Restore afternoon header removed by pop.
  day['!merges'].push({ s: { r: 6, c: 6 }, e: { r: 6, c: 8 } });
  day.A10 = { v: 'Trần Bình' }; delete day.B10;
  const teacher = parseWorkbook(workbook).days[0].rows[1];
  assert.equal(teacher.teacherName, 'Trần Bình'); assert.equal(teacher.subject, null);
});
test('rejects missing sheets, invalid headers, duplicate NFC names and orphan lessons', () => {
  let w = fixture(); delete w.Sheets['THỨ BA']; assert.throws(() => parseWorkbook(w), /thiếu sheet/);
  w = fixture(); w.Sheets['THỨ HAI'].D8.v = 'TIẾT 8'; assert.throws(() => parseWorkbook(w), /tiêu đề/);
  w = fixture(); w.Sheets['THỨ HAI'].B10.v = 'Nguyễn An'.normalize('NFD'); assert.throws(() => parseWorkbook(w), /trùng/);
  w = fixture(); delete w.Sheets['THỨ HAI'].B9; assert.throws(() => parseWorkbook(w), /thiếu tên/);
});
test('unknown content still counts, missing and stale totals are warnings', () => {
  const w = fixture(); w.Sheets['THỨ HAI'].D9 = { v: 'II' }; delete w.Sheets['THỨ BA'].K9;
  const result = parseWorkbook(w);
  assert.equal(result.days[0].rows[0].actualTotal, 2);
  for (const code of ['UNRECOGNIZED_CLASS', 'TOTAL_MISMATCH', 'TOTAL_UNAVAILABLE']) assert.ok(result.warnings.some(w => w.code === code));
});
test('rejects formulas and merged schedule slots', () => {
  let w = fixture(); w.Sheets['THỨ HAI'].C9.f = 'A1'; assert.throws(() => parseWorkbook(w), /công thức/);
  w = fixture(); w.Sheets['THỨ HAI']['!merges'].push({ s: { r: 8, c: 2 }, e: { r: 8, c: 3 } });
  assert.throws(() => parseWorkbook(w), /bị gộp/);
});
test('reader wraps errors and keeps original bytes independent', async () => {
  assert.throws(() => readExcelBytes(new Uint8Array([1]), null), /SheetJS/);
  assert.throws(() => readExcelBytes(new Uint8Array([1]), { read() { throw Error('bad zip'); } }), /Không đọc được/);
  assert.throws(() => readExcelBytes(new Uint8Array([1]), {}, 'old.xls'), /xlsx/);
  await assert.rejects(readExcelFile({ name: 'ok.xlsx', arrayBuffer() { throw Error('denied'); } }, {}), /Không thể mở/);
  const bytes = new Uint8Array([1, 2]); const result = readExcelBytes(bytes, { read: fixture }, 'test.xlsx');
  bytes[0] = 9; assert.equal(result.originalBytes[0], 1);
});
test('provided workbook: independently extracted reference', { skip: !process.env.TKB_REFERENCE_JSON }, () => {
  const data = parseWorkbook(JSON.parse(readFileSync(process.env.TKB_REFERENCE_JSON, 'utf8')));
  assert.deepEqual(data.stats, { days: 5, teachers: 24, occupiedSlots: 454 });
  assert.deepEqual(data.days.map(d => d.actualTotal), [75, 115, 59, 122, 83]);
  assert.ok(data.days.every(d => d.rows.length === 24));
  assert.deepEqual(data.warnings.map(w => [w.code, w.sheet, w.cell]), [
    ['UNRECOGNIZED_CLASS', 'THỨ HAI', 'G18'],
  ]);
  assert.equal(data.days[3].rows.find(r => r.row === 22).lessons[2].className, '4A');
  assert.equal(data.days[0].rows.find(r => r.row === 26).subject, null);
});

test('Monday first-period assembly is recognized and excluded, with either Excel total convention', () => {
  const workbook = fixture();
  workbook.Sheets['THỨ HAI'].C9.v = '  cc  phân hiệu '.normalize('NFD');
  let data = parseWorkbook(workbook);
  const teacher = data.days[0].rows[0];
  assert.equal(teacher.lessons[0].kind, 'assembly');
  assert.equal(teacher.actualTotal, 0);
  assert.equal(teacher.sourceTotal.includesAssembly, true);
  assert.deepEqual(data.warnings, []);
  workbook.Sheets['THỨ HAI'].K9.v = 0;
  workbook.Sheets.Sheet1.D6.v = 0;
  workbook.Sheets.Sheet1.I6.v = 4;
  data = parseWorkbook(workbook);
  assert.deepEqual(data.warnings, []);
  assert.equal(data.days[0].rows[0].sourceTotal.includesAssembly, false);
  workbook.Sheets['THỨ BA'].C9.v = 'CC phân hiệu';
  workbook.Sheets['THỨ HAI'].D9 = { v: 'CC phân hiệu' };
  data = parseWorkbook(workbook);
  assert.equal(data.days[1].rows[0].lessons[0].kind, 'unrecognized');
  assert.equal(data.days[0].rows[0].lessons[1].kind, 'unrecognized');
});

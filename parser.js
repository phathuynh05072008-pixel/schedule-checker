/** Read-only parser. No DOM, network calls, persistence or mutations of the workbook. */
export const DAY_NAMES = ['THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU'];
export const normalizeText = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
const key = value => normalizeText(value).toLocaleUpperCase('vi');
const address = (column, row) => `${String.fromCharCode(65 + column)}${row}`;
const valueAt = (sheet, column, row) => sheet[address(column, row)]?.v;

export class ParseError extends Error {
  constructor(message) { super(message); this.name = 'ParseError'; }
}

export function parseClass(value) {
  const raw = String(value ?? '');
  const text = key(raw);
  if (!text) return { raw, text: '', className: null, activity: null, kind: 'empty' };
  const match = text.match(/^(?:(HĐTN|TNXH|TCTV|TCT|LTTV|LTT|CN|ĐĐ)\s*)?([1-5])\s*([A-Z])$/u);
  return match
    ? { raw, text, className: match[2] + match[3], activity: match[1] ?? null, kind: 'lesson' }
    : { raw, text, className: null, activity: null, kind: 'unrecognized' };
}

export const isAssemblySlot = (day, slot) => day === 'THỨ HAI' && slot.session === 'Sáng' && slot.period === 1;
export const isTeachingLesson = lesson => lesson.kind === 'lesson' || lesson.kind === 'unrecognized';

// Resolve a merged value without spreading it into or changing the original worksheet.
export function mergedValue(sheet, column, row) {
  const range = (sheet['!merges'] ?? []).find(m =>
    m.s.r <= row - 1 && m.e.r >= row - 1 && m.s.c <= column && m.e.c >= column);
  return range ? valueAt(sheet, range.s.c, range.s.r + 1) : valueAt(sheet, column, row);
}

function teacherAt(sheet, row, subjectColumn, nameColumn) {
  const mergedName = (sheet['!merges'] ?? []).some(m =>
    m.s.r === row - 1 && m.e.r === row - 1 && m.s.c === subjectColumn && m.e.c === nameColumn);
  return {
    teacherName: normalizeText(mergedName ? valueAt(sheet, subjectColumn, row) : valueAt(sheet, nameColumn, row)),
    teacherCell: address(mergedName ? subjectColumn : nameColumn, row),
    subject: mergedName ? null : normalizeText(mergedValue(sheet, subjectColumn, row)),
  };
}

function lastRow(sheet) {
  const row = Number(sheet['!ref']?.match(/\d+$/)?.[0]);
  if (!row || row > 2000) throw new ParseError('Vùng dữ liệu không hợp lệ hoặc vượt 2.000 dòng.');
  return row;
}

function warn(warnings, code, sheet, cell, message) { warnings.push({ code, sheet, cell, message }); }

function checkTotal(sheet, cell, actual, warnings, sheetName, assemblyCount = 0) {
  const item = sheet[cell];
  // Original Excel totals may include assembly; accept either explicit convention.
  const includesAssembly = assemblyCount > 0 && item?.v === actual + assemblyCount;
  if (typeof item?.v !== 'number' || !Number.isFinite(item.v)) {
    warn(warnings, 'TOTAL_UNAVAILABLE', sheetName, cell, 'Không có giá trị tổng tiết dạng số để đối chiếu.');
  } else if (item.v !== actual && !includesAssembly) {
    warn(warnings, 'TOTAL_MISMATCH', sheetName, cell, `Tổng ghi trong file là ${item.v}, đếm dữ liệu được ${actual}.`);
  }
  return { cell, value: typeof item?.v === 'number' ? item.v : null, formula: item?.f ?? null, includesAssembly };
}

function parseDay(sheet, name, warnings) {
  const morningOnly = name === 'THỨ TƯ';
  const headerRow = Array.from({ length: Math.min(lastRow(sheet), 30) }, (_, i) => i + 1)
    .find(row => key(mergedValue(sheet, 0, row)) === 'MÔN' && key(mergedValue(sheet, 1, row)) === 'TÊN GV');
  if (!headerRow) throw new ParseError(`${name}: không tìm thấy tiêu đề Môn và Tên GV ở cột A, B.`);
  const slotCount = morningOnly ? 4 : 7;
  const slots = Array.from({ length: slotCount }, (_, i) => ({
    column: i + 2, session: i < 4 ? 'Sáng' : 'Chiều', period: i < 4 ? i + 1 : i - 3,
  }));
  for (const slot of slots) {
    if (key(mergedValue(sheet, slot.column, headerRow)) !== key(slot.session) ||
        key(valueAt(sheet, slot.column, headerRow + 1)) !== `TIẾT ${slot.period}`) {
      throw new ParseError(`${name}!${address(slot.column, headerRow + 1)}: tiêu đề buổi hoặc tiết không đúng cấu trúc.`);
    }
  }
  if (morningOnly && [6, 7, 8].some(c => key(mergedValue(sheet, c, headerRow)) === 'CHIỀU')) {
    throw new ParseError('THỨ TƯ chỉ được có buổi Sáng.');
  }
  const totalCandidates = Array.from({ length: 5 }, (_, i) => slotCount + 2 + i).filter(column =>
    /TỔNG/.test(key(mergedValue(sheet, column, headerRow))) ||
    Array.from({ length: lastRow(sheet) - headerRow - 1 }, (_, i) => i + headerRow + 2)
      .some(row => teacherAt(sheet, row, 0, 1).teacherName && typeof valueAt(sheet, column, row) === 'number'));
  const totalColumn = totalCandidates.length === 1 ? totalCandidates[0] : null;
  const rows = [];
  const names = new Map();
  for (let row = headerRow + 2; row <= lastRow(sheet); row++) {
    const teacher = teacherAt(sheet, row, 0, 1);
    const hasLessons = slots.some(slot => normalizeText(valueAt(sheet, slot.column, row)));
    if (!teacher.teacherName) {
      if (hasLessons) throw new ParseError(`${name}, dòng ${row}: có lịch dạy nhưng thiếu tên giáo viên.`);
      continue;
    }
    const teacherKey = key(teacher.teacherName);
    if (names.has(teacherKey)) {
      throw new ParseError(`${name}: tên giáo viên "${teacher.teacherName}" trùng ở dòng ${names.get(teacherKey)} và ${row}; cần phân biệt tên trước khi nhập.`);
    }
    names.set(teacherKey, row);
    const lessons = slots.map(slot => {
      const cell = address(slot.column, row);
      const merged = (sheet['!merges'] ?? []).some(m => m.s.r <= row - 1 && m.e.r >= row - 1 && m.s.c <= slot.column && m.e.c >= slot.column);
      if (merged) throw new ParseError(`${name}!${cell}: ô lịch dạy bị gộp, không thể xác định riêng từng tiết.`);
      if (sheet[cell]?.f || sheet[cell]?.t === 'e') throw new ParseError(`${name}!${cell}: ô lịch dạy chứa công thức hoặc lỗi Excel; cần nhập tên lớp dạng văn bản.`);
      const parsed = parseClass(valueAt(sheet, slot.column, row));
      if (isAssemblySlot(name, slot) && ['CC', 'CC PHÂN HIỆU'].includes(parsed.text)) {
        parsed.kind = 'assembly';
        parsed.activity = 'CC';
      }
      if (parsed.kind === 'unrecognized') warn(warnings, 'UNRECOGNIZED_CLASS', name, cell,
        `Chưa nhận diện được lớp trong "${parsed.raw}". Giữ nguyên và vẫn tính là một ô có lịch; cần kiểm tra thủ công.`);
      return { ...slot, cell, row, ...parsed };
    });
    const actualTotal = lessons.filter(isTeachingLesson).length;
    const assemblyCount = lessons.filter(item => item.kind === 'assembly').length;
    rows.push({ ...teacher, teacherKey, row, lessons, actualTotal, assemblyCount,
      sourceTotal: totalColumn === null ? null : actualTotal === 0 && !normalizeText(valueAt(sheet, totalColumn, row))
        ? { cell: address(totalColumn, row), value: 0, formula: sheet[address(totalColumn, row)]?.f ?? null, includesAssembly: false }
        : checkTotal(sheet, address(totalColumn, row), actualTotal, warnings, name, assemblyCount) });
  }
  if (!rows.length) throw new ParseError(`${name}: không tìm thấy giáo viên từ dòng 9.`);
  return { name, slots, totalColumn, rows, actualTotal: rows.reduce((sum, row) => sum + row.actualTotal, 0) };
}

function summaryLayout(sheet) {
  for (let row = 1; row <= Math.min(lastRow(sheet), 30); row++) for (let column = 1; column <= 3; column++) {
    if (key(mergedValue(sheet, column, row)) !== 'TÊN GV') continue;
    if (DAY_NAMES.every((name, i) => {
      const text = key(mergedValue(sheet, column + i + 1, row));
      return text === name || text === name.replace('THỨ ', '');
    })) return { row, column };
  }
  return null;
}

function parseSummary(sheet, days, warnings, sheetName, layout) {
  const rows = [];
  const seen = new Set();
  for (let row = layout.row + 1; row <= lastRow(sheet); row++) {
    const teacher = teacherAt(sheet, row, layout.column - 1, layout.column);
    if (!teacher.teacherName) continue;
    const teacherKey = key(teacher.teacherName);
    if (seen.has(teacherKey)) throw new ParseError(`${sheetName}: tên giáo viên "${teacher.teacherName}" bị trùng.`);
    seen.add(teacherKey);
    const dailyTotals = days.map((day, i) => {
      const source = day.rows.find(item => item.teacherKey === teacherKey);
      if (!source) {
        warn(warnings, 'MISSING_TEACHER', sheetName, teacher.teacherCell, `Không tìm thấy ${teacher.teacherName} trong ${day.name}.`);
        return { cell: address(i + layout.column + 1, row), value: valueAt(sheet, i + layout.column + 1, row) ?? null, actual: null };
      }
      const cell = address(i + layout.column + 1, row);
      if (source.actualTotal === 0 && !normalizeText(sheet[cell]?.v)) return { cell, value: 0, actual: 0, includesAssembly: false };
      return { ...checkTotal(sheet, cell, source.actualTotal, warnings, sheetName, source.assemblyCount), actual: source.actualTotal };
    });
    const actualWeek = dailyTotals.every(t => t.actual !== null) ? dailyTotals.reduce((sum, t) => sum + t.actual, 0) : null;
    const assemblyWeek = days.reduce((sum, day) => sum + (day.rows.find(r => r.teacherKey === teacherKey)?.assemblyCount ?? 0), 0);
    const weeklyCell = address(layout.column + 6, row);
    const weeklyTotal = actualWeek === null || !sheet[weeklyCell] ? null : checkTotal(sheet, weeklyCell, actualWeek, warnings, sheetName, assemblyWeek);
    rows.push({ ...teacher, sheetName, teacherKey, row, dailyTotals, actualWeek, weeklyTotal });
  }
  for (const day of days) for (const teacher of day.rows) {
    if (!seen.has(teacher.teacherKey)) warn(warnings, 'MISSING_SUMMARY_TEACHER', day.name, teacher.teacherCell,
      `${teacher.teacherName} chưa có trong ${sheetName}.`);
  }
  return rows;
}

export function parseWorkbook(workbook) {
  if (!Array.isArray(workbook?.SheetNames) || !workbook.Sheets) throw new ParseError('Không đọc được cấu trúc workbook Excel.');
  const sources = new Map();
  for (const name of workbook.SheetNames) {
    const normalized = key(name);
    const numeric = normalized.match(/^(?:THỨ|THU|T)\s*([2-6])$/);
    let day = numeric ? DAY_NAMES[Number(numeric[1]) - 2] : DAY_NAMES.find(d => key(d) === normalized);
    if (!day && !/CŨ|OLD|BACKUP|LƯU/i.test(normalized)) {
      const sheet = workbook.Sheets[name];
      const hasSchedule = Array.from({ length: 30 }, (_, i) => i + 1).some(row =>
        key(valueAt(sheet, 0, row)) === 'MÔN' && key(valueAt(sheet, 1, row)) === 'TÊN GV');
      if (hasSchedule) {
        const titles = DAY_NAMES.filter(d => Array.from({ length: 30 }, (_, i) => i + 1).some(row => key(valueAt(sheet, 0, row)) === d));
        if (titles.length === 1) day = titles[0];
      }
    }
    if (!day) continue;
    if (sources.has(day)) throw new ParseError(`Có nhiều sheet cùng nhận diện là ${day}; cần phân biệt trước khi nhập.`);
    sources.set(day, name);
  }
  const missing = DAY_NAMES.filter(name => !sources.has(name) || !workbook.Sheets[sources.get(name)]);
  if (missing.length) throw new ParseError(`File thiếu sheet bắt buộc: ${missing.join(', ')}.`);
  const warnings = [];
  const days = DAY_NAMES.map(name => ({ ...parseDay(workbook.Sheets[sources.get(name)], name, warnings), sourceName: sources.get(name) }));
  const teachers = [...new Set(days.flatMap(day => day.rows.map(row => row.teacherKey)))];
  for (const teacher of teachers) for (const day of days) {
    if (!day.rows.some(row => row.teacherKey === teacher)) warn(warnings, 'MISSING_DAY_TEACHER', day.name, null,
      `Thiếu giáo viên ${teacher} trong sheet ngày; không giả định người này rảnh.`);
  }
  const notes = [];
  const candidates = [];
  for (const name of workbook.SheetNames.filter(name => ![...sources.values()].includes(name))) {
    // Explicitly archived worksheets must never be used as the current summary.
    if (/CŨ|OLD|BACKUP|LƯU/i.test(key(name))) { notes.push(`Giữ nguyên sheet ${name}, không dùng bảng cũ để đối chiếu.`); continue; }
    try {
      const layout = summaryLayout(workbook.Sheets[name]);
      if (layout) candidates.push({ name, layout });
      else notes.push(`Giữ nguyên sheet ${name}; chưa nhận diện được bảng tổng hợp trong sheet này.`);
    } catch { notes.push(`Không đọc bảng phụ ${name}; vẫn kiểm tra các sheet lịch.`); }
  }
  let summary = [];
  if (candidates.length === 1) {
    const { name, layout } = candidates[0];
    const summaryWarnings = [];
    try { summary = parseSummary(workbook.Sheets[name], days, summaryWarnings, name, layout); warnings.push(...summaryWarnings); }
    catch (error) { notes.push(`Bỏ qua bảng tổng hợp ${name}: ${error.message}`); }
  } else notes.push(candidates.length ? 'Có nhiều bảng tổng hợp; chỉ kiểm tra lịch từng ngày, không cập nhật các bảng phụ.' : 'Không có bảng tổng hợp phù hợp. Số tiết được tự đếm từ lịch từng ngày.');
  if (days.some(d => d.totalColumn === null)) notes.push('Một số sheet không có cột tổng rõ ràng. Web tự đếm tiết và không thêm cột vào file gốc.');
  return { schemaVersion: 1, days, summary, warnings, notes,
    stats: { days: days.length, teachers: teachers.length, occupiedSlots: days.reduce((sum, day) => sum + day.actualTotal, 0) } };
}

/** Inject SheetJS in browser or Node; keep original bytes for lossless export in a later step. */
export function readExcelBytes(bytes, XLSX, fileName = '') {
  if (fileName && !/\.xlsx$/i.test(fileName)) throw new ParseError('Vui lòng chọn file Excel có đuôi .xlsx.');
  if (!(bytes instanceof ArrayBuffer) && !(bytes instanceof Uint8Array)) throw new ParseError('Dữ liệu file Excel không hợp lệ.');
  if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new ParseError('File phải có dữ liệu và không vượt quá 20 MB.');
  if (!XLSX?.read) throw new ParseError('Chưa tải được thư viện đọc Excel SheetJS.');
  try {
    const originalBytes = bytes instanceof ArrayBuffer ? bytes.slice(0) : new Uint8Array(bytes);
    // SheetJS attaches internal cursor fields to its input. Keep the export source untouched.
    const workbook = XLSX.read(originalBytes.slice(0), { type: 'array', cellStyles: true, cellFormula: true, cellNF: true, sheetStubs: true });
    return { fileName, originalBytes, workbook, data: parseWorkbook(workbook) };
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError('Không đọc được file Excel. File có thể bị hỏng, có mật khẩu hoặc không đúng định dạng .xlsx.', { cause: error });
  }
}

export async function readExcelFile(file, XLSX) {
  try {
    if (!file || !/\.xlsx$/i.test(file.name)) throw new ParseError('Vui lòng chọn file Excel có đuôi .xlsx.');
    if (file.size > 20 * 1024 * 1024) throw new ParseError('File không được vượt quá 20 MB.');
    return readExcelBytes(await file.arrayBuffer(), XLSX, file.name);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError('Không thể mở file đã chọn. Vui lòng chọn lại file Excel.');
  }
}

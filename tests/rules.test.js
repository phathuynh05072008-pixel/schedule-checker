import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_NAMES, parseClass, parseWorkbook } from '../src/parser.js';
import { checkClassConflicts, checkTeacherDailyLimits, checkClassSessionLimits, checkClassLessonGaps, runRules } from '../src/rules.js';

function day(name, schedules) {
  return { name, rows: schedules.map((values, index) => ({
    teacherName: `GV ${index + 1}`, teacherKey: `GV ${index + 1}`, subject: 'Môn thử', row: index + 9,
    actualTotal: 999,
    lessons: values.map((raw, slot) => ({ ...parseClass(raw),
      session: slot < 4 ? 'Sáng' : 'Chiều', period: slot < 4 ? slot + 1 : slot - 3,
      column: slot + 2, row: index + 9, cell: `${String.fromCharCode(67 + slot)}${index + 9}`,
    })),
  })) };
}

test('conflicts include all teachers and exact cells after activity normalization', () => {
  const data = day('THỨ HAI', [['HĐTN 2B'], ['2b'], ['TNXH 2B']]);
  const [error] = checkClassConflicts(data);
  assert.equal(error.severity, 'critical');
  assert.equal(error.className, '2B');
  assert.deepEqual(error.lessons.map(l => l.cell), ['C9', 'C10', 'C11']);
  assert.equal(checkClassConflicts(data).length, 1);
});

test('distinct periods, sessions and days do not conflict; unknown classes are not guessed', () => {
  const data = { days: [day('THỨ HAI', [['2B', '', '', '', '2B'], ['', '', 'II']]),
    day('THỨ BA', [['2B']])] };
  assert.deepEqual(runRules(data), []);
});

test('daily limits count occupied cells including unknowns and ignore cached totals', () => {
  for (const [index, limit] of [6, 7, 4, 7, 6].entries()) {
    const values = Array.from({ length: limit }, () => '1A');
    assert.deepEqual(checkTeacherDailyLimits(day(DAY_NAMES[index], [values])), []);
    assert.deepEqual(checkTeacherDailyLimits(day(DAY_NAMES[index], [[]])), []);
    const [error] = checkTeacherDailyLimits(day(DAY_NAMES[index], [[...values, 'II']]));
    assert.equal(error.actual, limit + 1);
    assert.equal(error.limit, limit);
    assert.equal(error.excessLessons.length, 1);
    assert.equal(error.excessLessons[0].raw, 'II');
  }
});

test('all five morning limits and all five afternoon limits count across teachers', () => {
  for (const [index, limit] of [1, 3, 2, 3, 2].entries()) {
    const morning = Array(4).fill(''); morning.fill('1A', 0, limit);
    const valid = day(DAY_NAMES[index], [[...morning, '1A', '1A']]);
    assert.deepEqual(checkClassSessionLimits(valid), []);
    const invalid = day(DAY_NAMES[index], [[...morning, '1A', '1A'], ['CN 1A', '', '', '', 'ĐĐ1A']]);
    const errors = checkClassSessionLimits(invalid);
    assert.deepEqual(errors.map(e => [e.session, e.actual, e.limit]), [['Sáng', limit + 1, limit], ['Chiều', 3, 2]]);
    assert.equal(errors[0].lessons.length, limit + 1);
  }
});

test('two or three lessons must be consecutive per teacher and session, including empty gaps', () => {
  for (const values of [['1A', '2A', '1A'], ['1A', '2A', '1A', '1A'], ['1A', '', '1A']]) {
    const [issue] = checkClassLessonGaps(day('THỨ BA', [values]));
    assert.equal(issue.className, '1A'); assert.equal(issue.actual, 1); assert.equal(issue.teacherName, 'GV 1');
  }
  for (const values of [['1A', '1A', '2A'], ['2A', '1A', '1A', '1A'], ['1A', '', '', '', '1A']])
    assert.deepEqual(checkClassLessonGaps(day('THỨ BA', [values])), []);
  assert.deepEqual(checkClassLessonGaps(day('THỨ BA', [['1A'], ['', '', '1A']])), []);
});

test('engine is pure, deterministic, extensible and emits distinct ids', () => {
  const data = { days: [day('THỨ HAI', [Array(7).fill('1A'), ['1A']])] };
  const freeze = value => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); };
  freeze(data);
  const errors = runRules(data);
  assert.deepEqual(runRules(data), errors);
  assert.equal(new Set(errors.map(e => e.id)).size, errors.length);
  assert.equal(errors.length, 4);
  assert.deepEqual(runRules(data, [() => [{ rule: 'EXTRA' }]]), [{ rule: 'EXTRA' }]);
  assert.deepEqual(runRules(data, []), []);
});

test('unsupported days fail explicitly instead of silently passing daily limits', () => {
  assert.throws(() => checkTeacherDailyLimits(day('THỨ BẢY', [[]])), /Chưa có giới hạn/);
});

test('independent reference uses the new morning limits and excludes assembly', { skip: !process.env.TKB_REFERENCE_JSON }, () => {
  const data = parseWorkbook(JSON.parse(readFileSync(process.env.TKB_REFERENCE_JSON, 'utf8')));
  const errors = runRules(data);
  assert.equal(errors.length, 15);
  assert.ok(errors.every(e => e.rule === 'CLASS_SESSION_LIMIT'));
  const afternoon = errors.find(e => e.day === 'THỨ NĂM' && e.session === 'Chiều');
  assert.equal(afternoon.className, '2H');
  assert.deepEqual(afternoon.lessons.map(l => l.cell), ['G32', 'H12', 'I9']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_NAMES, parseClass } from '../parser.js';
import { runRules } from '../rules.js';
import { applyMove, applyPlan, buildPlan, suggestMoves, refreshTotals } from '../solver.js';

function fixture() {
  return refreshTotals({ days: DAY_NAMES.map(name => ({ name, rows: ['An', 'Bình'].map((teacherName, index) => ({
    teacherName, teacherKey: teacherName, subject: 'Môn', row: index + 9,
    lessons: Array.from({ length: name === 'THỨ TƯ' ? 4 : 7 }, (_, i) => ({
      ...parseClass(''), column: i + 2, row: index + 9, cell: `${String.fromCharCode(67 + i)}${index + 9}`,
      session: i < 4 ? 'Sáng' : 'Chiều', period: i < 4 ? i + 1 : i - 3,
    })),
  })) })) });
}
const put = (data, d, r, s, text) => Object.assign(data.days[d].rows[r].lessons[s], parseClass(text));
const move = (from, to, raw = '1A') => ({ teacherKey: 'An', raw, from, to });

test('suggestions prefer the same session, retain activity text and never mutate input', () => {
  const data = fixture(); put(data, 0, 0, 0, 'HĐTN 1A'); put(data, 0, 1, 0, '1A');
  const before = structuredClone(data);
  const suggestions = suggestMoves(data, runRules(data)[0]);
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].to.day, 'THỨ HAI');
  assert.equal(suggestions[0].to.session, 'Sáng');
  assert.equal(suggestions[0].raw, 'HĐTN 1A');
  for (const suggestion of suggestions) assert.equal(runRules(applyMove(data, suggestion)).length, 0);
  assert.deepEqual(data, before);
});

test('rejects stale, occupied, unknown, missing-teacher and non-improving moves', () => {
  const data = fixture(); put(data, 0, 0, 0, '1A'); put(data, 0, 1, 0, '1A');
  const from = { day: 'THỨ HAI', cell: 'C9' };
  assert.throws(() => applyMove(data, move(from, from)), /không còn trống/);
  assert.throws(() => applyMove(data, move(from, { day: 'THỨ HAI', cell: 'D9' }, '2B')), /đã cũ/);
  put(data, 0, 1, 1, 'II');
  assert.throws(() => applyMove(data, move(from, { day: 'THỨ HAI', cell: 'D9' })), /chưa rõ lớp/);
  data.days[1].rows.shift();
  assert.throws(() => applyMove(data, move(from, { day: 'THỨ BA', cell: 'C9' })), /đã cũ/);
  put(data, 0, 1, 0, '');
  assert.throws(() => applyMove(data, move(from, { day: 'THỨ HAI', cell: 'E9' })), /không giảm lỗi/);
});

test('a move may not replace a source violation with a new destination violation', () => {
  const data = fixture();
  for (const r of [0, 1]) put(data, 0, r, 0, '1A');
  put(data, 1, 1, 0, '1A');
  assert.throws(() => applyMove(data, move({ day: 'THỨ HAI', cell: 'C9' }, { day: 'THỨ BA', cell: 'C9' })), /phát sinh lỗi mới/);
});

test('batch plans are sequentially valid, conserve teacher lesson multisets and reduce all possible errors', () => {
  const data = fixture();
  for (const r of [0, 1]) for (const s of [0, 1, 2]) put(data, 0, r, s, '1A');
  const count = input => input.days.flatMap(d => d.rows.flatMap(r => r.lessons.filter(l => l.kind !== 'empty').map(l => `${r.teacherKey}:${l.raw}`))).sort();
  const plan = buildPlan(data);
  assert.ok(plan.moves.length > 1);
  const next = applyPlan(data, plan.moves);
  assert.equal(runRules(next).length, 0);
  assert.deepEqual(count(next), count(data));
});

test('no candidates when every teacher slot is occupied, no unknown lessons are moved', () => {
  const data = fixture();
  for (const day of data.days) for (const row of day.rows) for (const slot of row.lessons) Object.assign(slot, parseClass('II'));
  const plan = buildPlan(data);
  assert.deepEqual(plan.moves, []);
  assert.ok(plan.remaining > 0);
});

test('assembly stays fixed, is not counted, and Monday first period is never a destination', () => {
  const data = fixture();
  Object.assign(data.days[0].rows[0].lessons[0], parseClass('CC phân hiệu'), { kind: 'assembly' });
  refreshTotals(data);
  assert.equal(data.days[0].rows[0].actualTotal, 0);
  put(data, 1, 0, 0, '1A'); put(data, 1, 1, 0, '1A');
  assert.throws(() => applyMove(data, move({ day: 'THỨ HAI', cell: 'C9' }, { day: 'THỨ BA', cell: 'D9' }, 'CC phân hiệu')));
  assert.throws(() => applyMove(data, { teacherKey: 'Bình', raw: '1A', from: { day: 'THỨ BA', cell: 'C10' }, to: { day: 'THỨ HAI', cell: 'C10' } }));
  const next = applyPlan(data, buildPlan(data).moves);
  assert.equal(next.days[0].rows[0].lessons[0].raw, 'CC phân hiệu');
  assert.equal(next.days[0].rows[0].actualTotal, 0);
});

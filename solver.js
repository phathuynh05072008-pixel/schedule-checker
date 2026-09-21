import { parseClass, isTeachingLesson, isAssemblySlot } from "./parser.js";
import { runRules, DAILY_LIMITS, SESSION_LIMITS } from "./rules.js";

const weight = (errors) =>
  errors.reduce((sum, error) => sum + error.actual - error.limit, 0);

function locate(data, location, teacherKey) {
  const day = data.days.find((d) => d.name === location.day);
  const teacher = day?.rows.find((r) => r.teacherKey === teacherKey);
  return {
    day,
    teacher,
    lesson: teacher?.lessons.find((l) => l.cell === location.cell),
  };
}

export function refreshTotals(data) {
  for (const day of data.days) {
    for (const row of day.rows)
      row.actualTotal = row.lessons.filter(isTeachingLesson).length;
    day.actualTotal = day.rows.reduce((sum, row) => sum + row.actualTotal, 0);
  }
  return data;
}

// Each move must strictly improve the schedule without introducing or worsening a rule violation.
export function applyMove(data, move) {
  const next = structuredClone(data);
  const source = locate(next, move.from, move.teacherKey);
  const target = locate(next, move.to, move.teacherKey);
  if (
    !source.lesson?.className ||
    source.lesson.raw !== move.raw ||
    target.lesson?.kind !== "empty" ||
    isAssemblySlot(move.to.day, target.lesson)
  ) {
    throw new Error(
      "Phương án đã cũ hoặc ô đích không còn trống. Hãy tìm phương án lại.",
    );
  }
  const uncertain = target.day.rows.some((row) =>
    row.lessons.some(
      (l) =>
        l.session === target.lesson.session &&
        l.period === target.lesson.period &&
        l.kind === "unrecognized",
    ),
  );
  if (uncertain)
    throw new Error(
      "Ô đích có dữ liệu chưa rõ lớp ở cùng tiết, cần kiểm tra thủ công.",
    );
  Object.assign(source.lesson, parseClass(""));
  Object.assign(target.lesson, parseClass(move.raw));
  refreshTotals(next);
  const before = runRules(data);
  const after = runRules(next);
  const previous = new Map(before.map((e) => [e.id, e.actual - e.limit]));
  if (
    weight(after) >= weight(before) ||
    after.some(
      (e) => !previous.has(e.id) || e.actual - e.limit > previous.get(e.id),
    )
  ) {
    throw new Error("Phương án không giảm lỗi hoặc làm phát sinh lỗi mới.");
  }
  return next;
}

export function applyPlan(data, moves) {
  return moves.reduce((next, move) => applyMove(next, move), data);
}

export function suggestMoves(data, issue, maximum = 3) {
  const current = runRules(data).find((e) => e.id === issue.id);
  if (!current) return [];
  const candidates = [];
  for (const source of current.lessons.filter((l) => l.className)) {
    for (const day of data.days) {
      const teacher = day.rows.find(
        (row) => row.teacherKey === source.teacherKey,
      );
      if (!teacher) continue;
      for (const target of teacher.lessons.filter((l) => l.kind === "empty")) {
        if (isAssemblySlot(day.name, target)) continue;
        if (day.name !== current.day && teacher.lessons.filter(isTeachingLesson).length >= DAILY_LIMITS[day.name]) continue;
        const sameSession = day.name === current.day && target.session === source.session;
        const inSession = day.rows.flatMap(row => row.lessons).filter(l => l.session === target.session);
        if (inSession.some(l => l.period === target.period && (l.className === source.className || l.kind === 'unrecognized'))) continue;
        if (!sameSession && inSession.filter(l => l.className === source.className).length >= SESSION_LIMITS[target.session]) continue;
        candidates.push({
          teacherKey: source.teacherKey,
          teacherName: source.teacherName,
          className: source.className,
          raw: source.raw,
          from: {
            day: current.day,
            cell: source.cell,
            session: source.session,
            period: source.period,
          },
          to: {
            day: day.name,
            cell: target.cell,
            session: target.session,
            period: target.period,
          },
          priority:
            day.name === current.day
              ? source.session === target.session
                ? 0
                : 1
              : 2,
        });
      }
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  const results = [];
  const beforeWeight = weight(runRules(data));
  for (const candidate of candidates) {
    try {
      const next = applyMove(data, candidate);
      const remaining = runRules(next).find((e) => e.id === current.id);
      if (remaining && remaining.actual >= current.actual) continue;
      candidate.improvement = beforeWeight - weight(runRules(next));
      candidate.dayDistance = Math.abs(data.days.findIndex(d => d.name === candidate.to.day) - data.days.findIndex(d => d.name === candidate.from.day));
      candidate.periodDistance = Math.abs((candidate.to.period + (candidate.to.session === 'Chiều' ? 4 : 0)) - (candidate.from.period + (candidate.from.session === 'Chiều' ? 4 : 0)));
      results.push(candidate);
    } catch {
      /* Occupied class slots and rule limits eliminate this candidate. */
    }
  }
  results.sort((a, b) => b.improvement - a.improvement || a.priority - b.priority || a.dayDistance - b.dayDistance || a.periodDistance - b.periodDistance);
  return results.slice(0, maximum);
}

export function buildPlan(data, maxMoves = 100) {
  let current = data;
  const moves = [];
  for (let step = 0; step < maxMoves; step++) {
    const issues = runRules(current);
    let chosen;
    for (const issue of issues) {
      chosen = suggestMoves(current, issue, 1)[0];
      if (chosen) break;
    }
    if (!chosen) break;
    current = applyMove(current, chosen);
    moves.push(chosen);
  }
  return { moves, remaining: runRules(current).length };
}

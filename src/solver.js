import { parseClass, isTeachingLesson, isAssemblySlot } from "./parser.js";
import { runRules, DAILY_LIMITS, classSessionLimit } from "./rules.js";

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
function changeLessons(data, move) {
  const source = locate(data, move.from, move.teacherKey);
  const target = locate(data, move.to, move.teacherKey);
  const swap = move.type === 'swap';
  if (
    source.lesson?.kind !== 'lesson' ||
    source.lesson.raw !== move.raw ||
    (swap ? target.lesson?.kind !== 'lesson' || target.lesson.raw !== move.swapRaw : target.lesson?.kind !== "empty") ||
    source.lesson === target.lesson ||
    isAssemblySlot(move.to.day, target.lesson)
  ) {
    throw new Error(
      "Phương án đã cũ hoặc ô đích không còn trống. Hãy tìm phương án lại.",
    );
  }
  if (source.teacher.subject && target.teacher.subject && source.teacher.subject !== target.teacher.subject)
    throw new Error('Không chuyển tiết sang dòng có môn dạy khác.');
  const uncertainAt = (location) => location.day.rows.some((row) =>
    row.lessons.some(
      (l) =>
        l.session === location.lesson.session &&
        l.period === location.lesson.period &&
        l.kind === "unrecognized",
    ),
  );
  if (uncertainAt(target) || (swap && (isAssemblySlot(move.from.day, source.lesson) || uncertainAt(source))))
    throw new Error(
      "Ô đích có dữ liệu chưa rõ lớp ở cùng tiết, cần kiểm tra thủ công.",
    );
  Object.assign(source.lesson, parseClass(swap ? move.swapRaw : ""));
  Object.assign(target.lesson, parseClass(move.raw));
}

function improves(before, after) {
  const previous = new Map(before.map((e) => [e.id, e.actual - e.limit]));
  return weight(after) < weight(before) && !after.some(
    (e) => !previous.has(e.id) || e.actual - e.limit > previous.get(e.id));
}

export function applyMove(data, move) {
  const next = structuredClone(data);
  changeLessons(next, move);
  refreshTotals(next);
  const before = runRules(data);
  const after = runRules(next);
  if (!improves(before, after)) {
    throw new Error("Phương án không giảm lỗi hoặc làm phát sinh lỗi mới.");
  }
  return next;
}

export function applyPlan(data, moves) {
  return moves.reduce((next, move) => applyMove(next, move), data);
}

export function suggestMoves(data, issue, maximum = 3) {
  const before = runRules(data);
  const current = before.find((e) => e.id === issue.id);
  if (!current) return [];
  const candidates = [];
  for (const source of current.lessons.filter((l) => l.className)) {
    for (const day of data.days) {
      const teacher = day.rows.find(
        (row) => row.teacherKey === source.teacherKey,
      );
      if (!teacher || (source.subject && teacher.subject && source.subject !== teacher.subject)) continue;
      for (const target of teacher.lessons.filter((l) => l.kind === "empty" || (l.kind === 'lesson' && l.className !== source.className))) {
        if (isAssemblySlot(day.name, target)) continue;
        const swap = target.kind === 'lesson';
        if (!swap && day.name !== current.day && teacher.lessons.filter(isTeachingLesson).length >= DAILY_LIMITS[day.name]) continue;
        const sameSession = day.name === current.day && target.session === source.session;
        const inSession = day.rows.flatMap(row => row.lessons).filter(l => l.session === target.session);
        if (inSession.some(l => l.period === target.period && (l.className === source.className || l.kind === 'unrecognized'))) continue;
        if (!sameSession && inSession.filter(l => l.className === source.className).length >= classSessionLimit(day.name, target.session)) continue;
        candidates.push({
          ...(swap ? { type: 'swap', swapRaw: target.raw } : {}),
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
  // Clone once per search; evaluate only the days touched by each candidate.
  const scratch = structuredClone(data);
  for (const candidate of candidates) {
    const source = locate(scratch, candidate.from, candidate.teacherKey).lesson;
    const target = locate(scratch, candidate.to, candidate.teacherKey).lesson;
    const sourceSnapshot = { ...source }, targetSnapshot = { ...target };
    try {
      changeLessons(scratch, candidate);
      const days = new Set([candidate.from.day, candidate.to.day]);
      const prior = before.filter(e => days.has(e.day));
      const after = runRules({ days: scratch.days.filter(d => days.has(d.name)) });
      if (!improves(prior, after)) continue;
      const remaining = after.find((e) => e.id === current.id);
      if (remaining && remaining.actual >= current.actual) continue;
      candidate.improvement = weight(prior) - weight(after);
      candidate.dayDistance = Math.abs(data.days.findIndex(d => d.name === candidate.to.day) - data.days.findIndex(d => d.name === candidate.from.day));
      candidate.periodDistance = Math.abs((candidate.to.period + (candidate.to.session === 'Chiều' ? 4 : 0)) - (candidate.from.period + (candidate.from.session === 'Chiều' ? 4 : 0)));
      results.push(candidate);
    } catch {
      /* Occupied class slots and rule limits eliminate this candidate. */
    } finally {
      Object.assign(source, sourceSnapshot); Object.assign(target, targetSnapshot);
    }
  }
  results.sort((a, b) => b.improvement - a.improvement || Number(a.type === 'swap') - Number(b.type === 'swap') || a.priority - b.priority || a.dayDistance - b.dayDistance || a.periodDistance - b.periodDistance);
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
  const remainingIssues = runRules(current);
  return { moves, remaining: remainingIssues.length, remainingIssues };
}

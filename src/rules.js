/** Pure rules over parser.js data. Never change lessons or trust cached totals. */
import { isTeachingLesson } from './parser.js';
export const DAILY_LIMITS = Object.freeze({
  'THỨ HAI': 6, 'THỨ BA': 7, 'THỨ TƯ': 4, 'THỨ NĂM': 7, 'THỨ SÁU': 6,
});
export const MORNING_LIMITS = Object.freeze({
  'THỨ HAI': 1, 'THỨ BA': 3, 'THỨ TƯ': 2, 'THỨ NĂM': 3, 'THỨ SÁU': 2,
});
export const AFTERNOON_LIMIT = 2;

// Shared by validation and every solver destination check.
export function classSessionLimit(day, session) {
  if (!(day in MORNING_LIMITS)) throw new Error(`Chưa có giới hạn số tiết cho ${day}.`);
  if (session === 'Sáng') return MORNING_LIMITS[day];
  if (session === 'Chiều') return AFTERNOON_LIMIT;
  throw new Error(`Chưa có giới hạn số tiết cho buổi ${session}.`);
}

function entries(day) {
  return day.rows.flatMap(teacher => teacher.lessons
    .filter(isTeachingLesson)
    .map(lesson => ({
      sheet: day.name, teacherName: teacher.teacherName, teacherKey: teacher.teacherKey,
      subject: teacher.subject, ...lesson,
    })));
}

function group(items, key) {
  const groups = new Map();
  for (const item of items) {
    const id = JSON.stringify(key(item));
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  return [...groups.values()];
}

function violation(rule, day, identity, fields) {
  return { id: JSON.stringify([rule, day.name, ...identity]), rule,
    severity: rule === 'CLASS_CONFLICT' ? 'critical' : 'error', day: day.name,
    session: null, period: null, className: null, teacherName: null, ...fields };
}

export function checkClassConflicts(day) {
  return group(entries(day).filter(item => item.className),
    item => [item.session, item.period, item.className])
    .filter(items => new Set(items.map(item => item.teacherKey)).size > 1)
    .map(items => {
      const { session, period, className } = items[0];
      return violation('CLASS_CONFLICT', day, [session, period, className], {
        session, period, className, actual: items.length, limit: 1, lessons: items,
        message: `${day.name}, ${session}, tiết ${period}: lớp ${className} trùng lịch giữa ${items.map(item => item.teacherName).join(', ')}.`,
        suggestion: 'Chuyển một tiết sang ô trống mà giáo viên và lớp đều rảnh, trong giới hạn ngày và buổi.',
      });
    });
}

export function checkTeacherDailyLimits(day) {
  const limit = DAILY_LIMITS[day.name];
  if (limit === undefined) throw new Error(`Chưa có giới hạn số tiết cho ${day.name}.`);
  return group(entries(day), item => [item.teacherKey])
    .filter(items => items.length > limit)
    .map(items => {
      const lessons = [...items].sort((a, b) => a.column - b.column);
      const { teacherKey, teacherName, subject } = lessons[0];
      return violation('TEACHER_DAILY_LIMIT', day, [teacherKey], {
        teacherKey, teacherName, subject, actual: lessons.length, limit, lessons,
        // Last occupied slots are illustrative excess slots, not an automatic edit choice.
        excessLessons: lessons.slice(limit),
        message: `${day.name}: ${teacherName} dạy ${lessons.length} tiết, vượt giới hạn ${limit} tiết/ngày.`,
        suggestion: `Chuyển ${lessons.length - limit} tiết sang ngày khác còn chỗ hợp lệ. Các ô dư được liệt kê theo thứ tự tiết, không bắt buộc phải chuyển đúng các ô này.`,
      });
    });
}

export function checkClassSessionLimits(day) {
  return group(entries(day).filter(item => item.className), item => [item.session, item.className])
    .flatMap(items => {
      const { session, className } = items[0];
      const limit = classSessionLimit(day.name, session);
      if (items.length <= limit) return [];
      return [violation('CLASS_SESSION_LIMIT', day, [session, className], {
        session, className, actual: items.length, limit,
        lessons: [...items].sort((a, b) => a.period - b.period || a.row - b.row),
        message: `${day.name}, ${session}: lớp ${className} có ${items.length} tiết, vượt giới hạn ${limit} tiết/buổi.`,
        suggestion: `Chuyển ${items.length - limit} tiết sang buổi khác hoặc ngày khác còn chỗ hợp lệ.`,
      })];
    });
}

export function checkClassLessonGaps(day) {
  return group(entries(day).filter(item => item.className),
    item => [item.teacherKey, item.session, item.className]).flatMap(items => {
    if (items.length < 2) return [];
    const lessons = [...items].sort((a, b) => a.period - b.period);
    const actual = lessons.at(-1).period - lessons[0].period + 1 - lessons.length;
    if (actual <= 0) return [];
    const { teacherKey, teacherName, session, className } = lessons[0];
    return [violation('CLASS_LESSON_GAPS', day, [teacherKey, session, className], {
      teacherKey, teacherName, session, className, actual, limit: 0, lessons,
      message: `${day.name}, ${session}: ${teacherName} dạy lớp ${className} ở tiết ${lessons.map(l => l.period).join(', ')} không liền nhau.`,
      suggestion: 'Xếp các tiết cùng lớp của giáo viên liền nhau trong buổi; không xen lớp khác hoặc tiết trống.',
    })];
  });
}

export const RULES = Object.freeze([checkClassConflicts, checkTeacherDailyLimits, checkClassSessionLimits, checkClassLessonGaps]);

export function runRules(data, rules = RULES) {
  return data.days.flatMap(day => rules.flatMap(rule => rule(day)));
}

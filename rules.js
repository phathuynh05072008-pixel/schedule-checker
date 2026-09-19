/** Pure rules over parser.js data. Never change lessons or trust cached totals. */
import { isTeachingLesson } from './parser.js';
export const DAILY_LIMITS = Object.freeze({
  'THỨ HAI': 6, 'THỨ BA': 7, 'THỨ TƯ': 4, 'THỨ NĂM': 7, 'THỨ SÁU': 6,
});
export const SESSION_LIMITS = Object.freeze({ 'Sáng': 3, 'Chiều': 2 });

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
      const limit = SESSION_LIMITS[session];
      if (limit === undefined) throw new Error(`Chưa có giới hạn số tiết cho buổi ${session}.`);
      if (items.length <= limit) return [];
      return [violation('CLASS_SESSION_LIMIT', day, [session, className], {
        session, className, actual: items.length, limit,
        lessons: [...items].sort((a, b) => a.period - b.period || a.row - b.row),
        message: `${day.name}, ${session}: lớp ${className} có ${items.length} tiết, vượt giới hạn ${limit} tiết/buổi.`,
        suggestion: `Chuyển ${items.length - limit} tiết sang buổi khác hoặc ngày khác còn chỗ hợp lệ.`,
      })];
    });
}

export const RULES = Object.freeze([checkClassConflicts, checkTeacherDailyLimits, checkClassSessionLimits]);

export function runRules(data, rules = RULES) {
  return data.days.flatMap(day => rules.flatMap(rule => rule(day)));
}

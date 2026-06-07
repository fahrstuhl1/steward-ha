const INTERVAL_DAYS   = { daily:1, weekly:7, biweekly:14, monthly:30, quarterly:90 };
const INTERVAL_LABELS = { daily:'Daily', weekly:'Weekly', biweekly:'Every 2 weeks', monthly:'Monthly', quarterly:'Quarterly' };

function getIntervalMs(task) {
  if (task.intervalCustomDays) return Number(task.intervalCustomDays) * 86400000;
  return (INTERVAL_DAYS[task.interval] || 7) * 86400000;
}

function getScheduledDueAt(task) {
  if (task.dueDate) {
    return new Date(task.dueDate + 'T' + (task.dueTime || '00:00') + ':00').getTime();
  }
  const intervalMs = getIntervalMs(task);
  const timeStr    = task.dueTime || '00:00';
  if (task.scheduleMode !== 'flexible') {
    const anchorDate = task.startDate
      || (task.createdAt ? task.createdAt.slice(0, 10) : null)
      || new Date().toISOString().slice(0, 10);
    let dueAt = new Date(anchorDate + 'T' + timeStr + ':00').getTime();
    const after = task.lastCompleted ? new Date(task.lastCompleted).getTime() : dueAt - 1;
    while (dueAt <= after) dueAt += intervalMs;
    return dueAt;
  }
  const base = task.lastCompleted
    ? new Date(new Date(task.lastCompleted).getTime() + intervalMs)
    : new Date((task.startDate || new Date().toISOString().slice(0, 10)) + 'T' + timeStr + ':00');
  if (task.dueTime) { const [h,m]=task.dueTime.split(':').map(Number); base.setHours(h,m,0,0); }
  return base.getTime();
}

function getDueAt(task) {
  if (task.nextDueAt && task.scheduleMode !== 'flexible') {
    return new Date(task.nextDueAt).getTime();
  }
  return getScheduledDueAt(task);
}

function getNotifyAt(task, timezone) {
  const dueAt = getDueAt(task);
  let base = dueAt - (task.notifyOffset != null ? Number(task.notifyOffset) : 0) * 60000;
  if (task.notifyTimeWeekday || task.notifyTimeWeekend) {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(new Date(dueAt));
    const isWeekend = dayName === 'Sat' || dayName === 'Sun';
    const timeStr = isWeekend ? task.notifyTimeWeekend : task.notifyTimeWeekday;
    if (timeStr) {
      const d = new Date(dueAt);
      const [h, m] = timeStr.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      base = d.getTime();
    }
  }
  if (task.snoozedUntil) {
    const snoozeEnd = new Date(task.snoozedUntil).getTime();
    if (snoozeEnd > Date.now()) return Math.max(base, snoozeEnd);
  }
  return base;
}

const GRACE_MS = 3600000; // 1 hour grace before a task turns red

function calendarDateStr(ms, timezone) {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
}

function timeOfDayStr(ms, timezone) {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(ms));
}

function isDue(task, timezone) {
  const now = Date.now();
  const dueAt = getDueAt(task);
  if (task.dueDate) {
    if (task.lastCompleted && new Date(task.lastCompleted).getTime() >= dueAt) return false;
  }
  return now >= dueAt + GRACE_MS;
}

function isSoon(task, timezone) {
  if (isDue(task, timezone)) return false;
  const now = Date.now();
  const dueAt = getDueAt(task);
  // Within grace period (past due time but not yet red) → still yellow
  if (now >= dueAt) return true;
  // Due today (same calendar day in the configured timezone) → yellow
  return calendarDateStr(now, timezone) === calendarDateStr(dueAt, timezone);
}

function nextDueDate(task, timezone) {
  const dueAt   = getDueAt(task);
  const now     = Date.now();
  const tod     = timeOfDayStr(dueAt, timezone);
  const timeStr = tod !== '00:00' ? ` at ${tod}` : '';
  if (task.dueDate) {
    if (task.lastCompleted && new Date(task.lastCompleted).getTime() >= dueAt) return 'Done';
    const diff = Math.ceil((dueAt - now) / 86400000);
    if (diff <= 0)  return `Due now${timeStr}`;
    if (diff === 1) return `Tomorrow${timeStr}`;
    return `${new Date(dueAt).toLocaleDateString('en-GB')}${timeStr}`;
  }
  if (now >= dueAt)           return `Due now${timeStr}`;
  const sameDay = calendarDateStr(now, timezone) === calendarDateStr(dueAt, timezone);
  if (sameDay)                return `Today${timeStr}`;
  const diff = Math.ceil((dueAt - now) / 86400000);
  if (diff === 1)             return `Tomorrow${timeStr}`;
  return `In ${diff} days${timeStr}`;
}

function nextDueSerialized(task, timezone) {
  const dueAt = getDueAt(task);
  const now   = Date.now();
  const tod   = timeOfDayStr(dueAt, timezone);
  const time  = tod !== '00:00' ? tod : null;
  if (task.dueDate) {
    if (task.lastCompleted && new Date(task.lastCompleted).getTime() >= dueAt)
      return { key: 'due.done' };
    const diff = Math.ceil((dueAt - now) / 86400000);
    if (diff <= 0)  return { key: 'due.now',      time };
    if (diff === 1) return { key: 'due.tomorrow',  time };
    return { key: 'due.date', date: new Date(dueAt).toLocaleDateString('en-GB'), time };
  }
  if (now >= dueAt)           return { key: 'due.now',     time };
  const sameDay = calendarDateStr(now, timezone) === calendarDateStr(dueAt, timezone);
  if (sameDay)                return { key: 'due.today',   time };
  const diff = Math.ceil((dueAt - now) / 86400000);
  if (diff === 1)             return { key: 'due.tomorrow', time };
  return { key: 'due.in_days', days: diff, time };
}

module.exports = { INTERVAL_DAYS, INTERVAL_LABELS, getIntervalMs, getScheduledDueAt, getDueAt, getNotifyAt, isDue, isSoon, nextDueDate, nextDueSerialized };

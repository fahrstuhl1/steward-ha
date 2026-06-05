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

function getNotifyAt(task) {
  const base = getDueAt(task) - (task.notifyOffset != null ? Number(task.notifyOffset) : 0) * 60000;
  if (task.snoozedUntil) {
    const snoozeEnd = new Date(task.snoozedUntil).getTime();
    if (snoozeEnd > Date.now()) return Math.max(base, snoozeEnd);
  }
  return base;
}

function isDue(task) {
  const now = Date.now();
  if (task.dueDate) {
    const dueAt = getDueAt(task);
    if (task.lastCompleted && new Date(task.lastCompleted).getTime() >= dueAt) return false;
    return now >= dueAt;
  }
  return now >= getDueAt(task);
}

function isSoon(task) {
  if (isDue(task)) return false;
  return (getDueAt(task) - Date.now()) <= 12 * 3600000;
}

function nextDueDate(task) {
  const dueAt   = getDueAt(task);
  const now     = Date.now();
  const timeStr = task.dueTime ? ` at ${task.dueTime}` : '';
  if (task.dueDate) {
    if (task.lastCompleted && new Date(task.lastCompleted).getTime() >= dueAt) return 'Done';
    const diff = Math.ceil((dueAt - now) / 86400000);
    if (diff <= 0)  return `Due now${timeStr}`;
    if (diff === 1) return `Tomorrow${timeStr}`;
    return `${new Date(dueAt).toLocaleDateString('en-GB')}${timeStr}`;
  }
  if (now >= dueAt)           return `Due now${timeStr}`;
  const msLeft = dueAt - now;
  if (msLeft <= 12 * 3600000) return `Today${timeStr}`;
  const diff = Math.ceil(msLeft / 86400000);
  if (diff === 1)             return `Tomorrow${timeStr}`;
  return `In ${diff} days${timeStr}`;
}

function nextDueSerialized(task) {
  const dueAt = getDueAt(task);
  const now   = Date.now();
  const time  = task.dueTime || null;
  if (task.dueDate) {
    if (task.lastCompleted && new Date(task.lastCompleted).getTime() >= dueAt)
      return { key: 'due.done' };
    const diff = Math.ceil((dueAt - now) / 86400000);
    if (diff <= 0)  return { key: 'due.now',      time };
    if (diff === 1) return { key: 'due.tomorrow',  time };
    return { key: 'due.date', date: new Date(dueAt).toLocaleDateString('en-GB'), time };
  }
  if (now >= dueAt)           return { key: 'due.now',     time };
  const msLeft = dueAt - now;
  if (msLeft <= 12 * 3600000) return { key: 'due.today',   time };
  const diff = Math.ceil(msLeft / 86400000);
  if (diff === 1)             return { key: 'due.tomorrow', time };
  return { key: 'due.in_days', days: diff, time };
}

module.exports = { INTERVAL_DAYS, INTERVAL_LABELS, getIntervalMs, getScheduledDueAt, getDueAt, getNotifyAt, isDue, isSoon, nextDueDate, nextDueSerialized };

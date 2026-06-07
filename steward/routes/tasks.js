const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const { readData, writeData, isOnVacation } = require('../lib/data');
const { INTERVAL_LABELS, getScheduledDueAt, getIntervalMs, getDueAt, isDue, isSoon, nextDueDate, nextDueSerialized } = require('../lib/time');
const { pendingTimers, scheduleNotification, fireNotification, notifyOthersOnCompletion } = require('../lib/notifications');
const { updateHaSensors } = require('../lib/ha');

const quickPage = (icon, text) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;background:#1a1d27;color:#dde1f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;}h1{font-size:3.5rem;margin:0 0 8px;}p{color:#7c819a;font-size:1rem;}</style></head><body><div><h1>${icon}</h1><p>${text}</p></div></body></html>`;

router.get('/', (req, res) => {
  const data   = readData();
  const onVacation = isOnVacation(data.settings);
  if (onVacation) {
    res.setHeader('X-Vacation-Active', 'true');
    res.setHeader('X-Vacation-To', data.settings.vacationTo);
  }
  const tz = data.settings.timezone || null;
  res.json(data.tasks.map(t => ({
    ...t,
    isDue:        onVacation ? false : isDue(t, tz),
    isSoon:       onVacation ? false : isSoon(t, tz),
    nextDue:      nextDueDate(t, tz),
    nextDueData:  nextDueSerialized(t, tz),
    dueAtMs:      getDueAt(t),
    intervalLabel: INTERVAL_LABELS[t.interval]
  })));
});

router.post('/', (req, res) => {
  const data = readData();
  const task = {
    id:                 uuidv4(),
    name:               req.body.name,
    assignee:           req.body.assignee           || 'alle',
    room:               req.body.room               || 'general',
    interval:           req.body.interval           || 'weekly',
    intervalCustomDays: req.body.intervalCustomDays ? Number(req.body.intervalCustomDays) : null,
    scheduleMode:       req.body.scheduleMode       || 'strict',
    priority:           req.body.priority           || 'normal',
    createdAt:          new Date().toISOString(),
    nextDueAt:          null,
    startDate:          req.body.startDate          || null,
    dueDate:            req.body.dueDate            || null,
    dueTime:            req.body.dueTime            || null,
    notifyOffset:       req.body.notifyOffset != null ? Number(req.body.notifyOffset) : 0,
    notifyTimeWeekday:  req.body.notifyTimeWeekday  || null,
    notifyTimeWeekend:  req.body.notifyTimeWeekend  || null,
    subtasks:           Array.isArray(req.body.subtasks) ? req.body.subtasks : [],
    snoozedUntil: null, lastComment: null,
    lastCompleted: null, completedBy: null, lastNotified: null,
    notify: req.body.notify !== false
  };
  data.tasks.push(task); writeData(data); scheduleNotification(task); updateHaSensors();
  res.json(task);
});

router.put('/:id', (req, res) => {
  const data = readData();
  const idx  = data.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.tasks[idx] = { ...data.tasks[idx], ...req.body, id: req.params.id };
  writeData(data); scheduleNotification(data.tasks[idx]);
  res.json(data.tasks[idx]);
});

router.delete('/:id', (req, res) => {
  const data = readData();
  if (pendingTimers[req.params.id]) { clearTimeout(pendingTimers[req.params.id]); delete pendingTimers[req.params.id]; }
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  writeData(data); res.json({ success: true });
});

router.post('/:id/complete', (req, res) => {
  const data   = readData();
  const task   = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const userId = req.body.userId || req.body.person || 'unknown';
  const points = task.priority === 'high' ? 3 : task.priority === 'low' ? 1 : 2;
  if (task.scheduleMode !== 'flexible' && !task.dueDate) {
    const currentDueAt = getScheduledDueAt(task);
    const intervalMs   = getIntervalMs(task);
    let nextDue = currentDueAt + intervalMs;
    while (nextDue <= Date.now()) nextDue += intervalMs;
    task.nextDueAt = new Date(nextDue).toISOString();
  } else { task.nextDueAt = null; }
  task.lastCompleted = new Date().toISOString();
  task.completedBy   = userId;
  task.lastComment   = req.body.comment || null;
  task.lastNotified  = null;
  task.snoozedUntil  = null;
  if (data.settings.gamificationEnabled !== false) {
    if (!data.completions) data.completions = [];
    data.completions.push({ id: uuidv4(), taskId: task.id, taskName: task.name, userId, points, date: task.lastCompleted, comment: task.lastComment, photo: req.body.photo || null });
  }
  notifyOthersOnCompletion(data, task, userId);
  if (task.dueDate) {
    if (!data.archive) data.archive = [];
    data.archive.push({ id: uuidv4(), name: task.name, room: task.room, assignee: task.assignee, priority: task.priority || 'normal', dueDate: task.dueDate, dueTime: task.dueTime, completedBy: userId, archivedAt: task.lastCompleted, comment: task.lastComment, photo: req.body.photo || null });
    data.tasks = data.tasks.filter(t => t.id !== task.id);
    writeData(data); updateHaSensors();
    return res.json({ success: true, archived: true });
  }
  writeData(data); scheduleNotification(task); updateHaSensors();
  res.json({ success: true, task });
});

router.post('/:id/reset', async (req, res) => {
  const data = readData();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  task.lastCompleted = null; task.completedBy = null; task.lastNotified = null; task.snoozedUntil = null; task.nextDueAt = null;
  await writeData(data);
  fireNotification(task.id);
  updateHaSensors();
  res.json({ success: true, task });
});

router.post('/:id/skip', (req, res) => {
  const data = readData();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (task.dueDate) {
    data.tasks = data.tasks.filter(t => t.id !== task.id);
    writeData(data); updateHaSensors();
    return res.json({ success: true });
  }
  const currentDueAt = getDueAt(task);
  const intervalMs   = getIntervalMs(task);
  let nextDue = currentDueAt + intervalMs;
  while (nextDue <= Date.now()) nextDue += intervalMs;
  task.nextDueAt     = new Date(nextDue).toISOString();
  task.lastNotified  = null;
  task.snoozedUntil  = null;
  writeData(data); scheduleNotification(task); updateHaSensors();
  res.json({ success: true, task });
});

router.post('/:id/snooze', (req, res) => {
  const data = readData();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const minutes = Number(req.body.minutes) || (Number(req.body.hours) || 2) * 60;
  task.snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString();
  writeData(data); scheduleNotification(task);
  console.log(`[Snooze] "${task.name}" snoozed for ${minutes} min`);
  res.json({ success: true, snoozedUntil: task.snoozedUntil });
});

router.post('/:id/unsnooze', (req, res) => {
  const data = readData();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  task.snoozedUntil = null;
  writeData(data); scheduleNotification(task);
  console.log(`[Snooze] "${task.name}" snooze cancelled`);
  res.json({ success: true });
});

router.get('/quick-complete/:taskId/:userId', (req, res) => {
  const data   = readData();
  const task   = data.tasks.find(t => t.id === req.params.taskId);
  if (!task) return res.status(404).send(quickPage('❓', 'Task not found'));
  const userId = req.params.userId;
  const points = task.priority === 'high' ? 3 : task.priority === 'low' ? 1 : 2;
  if (task.scheduleMode !== 'flexible' && !task.dueDate) {
    const intervalMs = getIntervalMs(task);
    let nextDue = getScheduledDueAt(task) + intervalMs;
    while (nextDue <= Date.now()) nextDue += intervalMs;
    task.nextDueAt = new Date(nextDue).toISOString();
  } else { task.nextDueAt = null; }
  task.lastCompleted = new Date().toISOString();
  task.completedBy   = userId;
  task.lastNotified  = null;
  task.snoozedUntil  = null;
  if (data.settings.gamificationEnabled !== false) {
    if (!data.completions) data.completions = [];
    data.completions.push({ id: uuidv4(), taskId: task.id, taskName: task.name, userId, points, date: task.lastCompleted, comment: null });
  }
  notifyOthersOnCompletion(data, task, userId);
  writeData(data); scheduleNotification(task); updateHaSensors();
  const user = (data.settings.users || []).find(u => u.id === req.params.userId);
  res.send(quickPage('✓', `"${task.name}"<br>marked as done${user ? ' by ' + user.name : ''}`));
});

router.get('/quick-snooze/:taskId/:hours', (req, res) => {
  const data  = readData();
  const task  = data.tasks.find(t => t.id === req.params.taskId);
  if (!task) return res.status(404).send(quickPage('❓', 'Task not found'));
  const hours = Number(req.params.hours) || 2;
  task.snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
  writeData(data); scheduleNotification(task);
  res.send(quickPage('⏰', `"${task.name}"<br>snoozed for ${hours}h`));
});

router.post('/:id/subtasks/:subId/toggle', (req, res) => {
  const data = readData();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const sub  = (task.subtasks || []).find(s => s.id === req.params.subId);
  if (!sub)  return res.status(404).json({ error: 'Subtask not found' });
  sub.done = !sub.done;
  writeData(data);
  res.json({ success: true, done: sub.done });
});

module.exports = router;

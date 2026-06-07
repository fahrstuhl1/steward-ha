const nodemailer = require('nodemailer');
const { readData, writeData } = require('./data');
const { getDueAt, getNotifyAt } = require('./time');

const pendingTimers = {};

// Guards against the timer-based fireNotification() and the cron fallback
// racing each other and both sending a notification for the same task.
const notifying = new Set();
function tryLockNotify(taskId) {
  if (notifying.has(taskId)) return false;
  notifying.add(taskId);
  return true;
}
function unlockNotify(taskId) { notifying.delete(taskId); }


function getUser(data, userId) {
  return (data.settings.users || []).find(u => u.id === userId);
}

async function sendHaNotify(data, userId, title, message, taskId = null) {
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return;
  const user = getUser(data, userId);
  if (!user?.haService) { console.log(`[HA] No service for ${userId}`); return; }
  let service = user.haService;
  if (service.startsWith('notify.')) service = service.slice('notify.'.length);

  const notifData = {};
  if (taskId) {
    const safeId = taskId.replace(/-/g, '');
    notifData.actions = [
      { action: `HPLAN_COMPLETE_${safeId}`, title: '✓ Done' },
      { action: `HPLAN_SNOOZE_${safeId}`,   title: '⏰ 2h Snooze' }
    ];
  }
  const payload = JSON.stringify({ title, message, ...(Object.keys(notifData).length ? { data: notifData } : {}) });
  const url     = new URL(`/api/services/notify/${service}`, haUrl);
  const lib     = url.protocol === 'https:' ? require('https') : require('http');
  return new Promise((resolve) => {
    const req = lib.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname, method: 'POST',
      headers: { 'Authorization': `Bearer ${haToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      rejectUnauthorized: false
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        console.log(`[HA] ${userId} → ${res.statusCode}${res.statusCode !== 200 ? ' | ' + body : ''}`);
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', e => { console.error(`[HA] ${e.message}`); resolve({ statusCode: 0, body: e.message }); });
    req.write(payload); req.end();
  });
}

async function sendEmail(data, userId, subject, text) {
  const { gmailUser, gmailAppPassword } = data.settings;
  if (!gmailUser || !gmailAppPassword) throw new Error('Gmail not configured');
  const user = getUser(data, userId);
  if (!user?.email) throw new Error(`No email for ${userId}`);
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailAppPassword } });
  await t.sendMail({ from: `"Steward 🏠" <${gmailUser}>`, to: user.email, subject: `Steward: ${subject}`, text });
}

function notifyOthersOnCompletion(data, task, userId) {
  if (data.settings.completionNotify === false) return;
  const allUsers = data.settings.users || [];
  const completer = allUsers.find(u => u.id === userId);
  const completerName = completer ? completer.name : userId;
  const others = allUsers.filter(u => u.id !== userId);
  if (!others.length) return;
  const msg = `${completerName} completed "${task.name}" ✓`;
  for (const other of others) {
    sendHaNotify(data, other.id, '✅ Task done', msg).catch(() => {});
    sendEmail(data, other.id, task.name, msg).catch(() => {});
  }
}

async function fireNotification(taskId) {
  if (!tryLockNotify(taskId)) return;
  try {
    const data = readData();
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) return;
    const cycleStart = task.lastCompleted ? new Date(task.lastCompleted) : new Date(0);
    if (task.lastNotified && new Date(task.lastNotified) > cycleStart) return;
    const allUsers = data.settings.users || [];
    const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
    const timeStr  = task.dueTime ? ` at ${task.dueTime}` : '';
    const soon     = task.notifyOffset && task.notifyOffset > 0;
    const msg      = `"${task.name}" is${soon ? ' almost' : ''} due${timeStr}`;
    console.log(`[Notify] ${msg}`);
    for (const userId of targets) {
      await sendHaNotify(data, userId, '🏠 Task due', msg, task.id);
      try { await sendEmail(data, userId, task.name, msg); } catch(e) { if (data.settings.gmailUser) console.error(`[Notify] email ${userId}: ${e.message}`); }
    }
    task.lastNotified = new Date().toISOString();
    writeData(data);
  } finally {
    unlockNotify(taskId);
  }
}

function scheduleNotification(task) {
  if (task.notify === false) return;
  if (pendingTimers[task.id]) { clearTimeout(pendingTimers[task.id]); delete pendingTimers[task.id]; }
  const notifyAt = getNotifyAt(task, readData().settings.timezone);
  const delay    = notifyAt - Date.now();
  if (delay <= 0) {
    pendingTimers[task.id] = setTimeout(() => fireNotification(task.id), 500);
    return;
  }
  const MAX_SAFE_TIMEOUT = 20 * 24 * 3600000;
  if (delay > MAX_SAFE_TIMEOUT) {
    console.log(`[Schedule] "${task.name}" in ${Math.round(delay/86400000)} days — cron will handle`);
    return;
  }
  console.log(`[Schedule] "${task.name}" in ${Math.round(delay / 60000)} min`);
  pendingTimers[task.id] = setTimeout(() => fireNotification(task.id), delay);
}

function restoreTimers() {
  const data = readData();
  let n = 0;
  for (const task of data.tasks) {
    if (task.notify === false) continue;
    if (getNotifyAt(task) > Date.now()) { scheduleNotification(task); n++; }
  }
  if (n) console.log(`[Schedule] ${n} timers restored`);
}

module.exports = { pendingTimers, tryLockNotify, unlockNotify, getUser, sendHaNotify, sendEmail, notifyOthersOnCompletion, fireNotification, scheduleNotification, restoreTimers };

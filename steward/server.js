const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const nodemailer = require('nodemailer');
const cron     = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const https    = require('https');
const http     = require('http');

const app       = express();
const PORT      = 3000;
const DATA_FILE = process.env.DATA_FILE || '/data/data.json';

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Data ─────────────────────────────────────────────────────────────────────
function readData() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return migrateData(data);
}

// Write queue: prevents concurrent writes (cron + API request)
let writeQueue = Promise.resolve();

function atomicWrite(data) {
  const payload = { ...data };
  if (payload.completions && payload.completions.length > 2000) {
    payload.completions = payload.completions.slice(-2000);
  }
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function writeData(data) {
  writeQueue = writeQueue
    .then(() => atomicWrite(data))
    .catch(e => console.error('[Write] Error:', e.message));
  return writeQueue;
}

// ─── HA Options ───────────────────────────────────────────────────────────────
function applyHaOptions() {
  const OPTIONS_FILE = '/data/options.json';
  if (!fs.existsSync(OPTIONS_FILE)) return;
  try {
    const opts = JSON.parse(fs.readFileSync(OPTIONS_FILE, 'utf8'));
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let changed = false;
    if (opts.ha_url        && !data.settings.haUrl)          { data.settings.haUrl          = opts.ha_url;         changed = true; }
    if (opts.ha_token       && !data.settings.haToken)         { data.settings.haToken         = opts.ha_token;        changed = true; }
    if (opts.webhook_secret && !data.settings.webhookSecret)   { data.settings.webhookSecret   = opts.webhook_secret;  changed = true; }
    if (changed) { atomicWrite(data); console.log('[Config] HA options applied ✓'); }
  } catch(e) { console.error('[Config] Error reading options.json:', e.message); }
}

// ─── Migration ────────────────────────────────────────────────────────────────
function migrateData(data) {
  let changed = false;

  // Legacy single email/haService fields → users array
  if (!data.settings.users) {
    const legacyUsers = [];
    if (data.settings.emailMax || data.settings.haServiceMax) {
      legacyUsers.push({ id: 'user1', name: 'User 1', email: data.settings.emailMax || '', haService: data.settings.haServiceMax || '', color: '#5b9cf6' });
    }
    if (data.settings.emailFranzi || data.settings.haServiceFranzi) {
      legacyUsers.push({ id: 'user2', name: 'User 2', email: data.settings.emailFranzi || '', haService: data.settings.haServiceFranzi || '', color: '#f472b6' });
    }
    data.settings.users = legacyUsers;
    for (const t of data.tasks) {
      if (t.assignee === 'Max'    || t.assignee === 'max')    { t.assignee = 'user1'; changed = true; }
      if (t.assignee === 'Franzi' || t.assignee === 'franzi') { t.assignee = 'user2'; changed = true; }
      if (t.assignee === 'beide')                             { t.assignee = 'alle';  changed = true; }
    }
    changed = true;
  }

  if (!data.settings.timezone) {
    data.settings.timezone = 'UTC';
    changed = true;
  }

  if (changed) atomicWrite(data);
  return data;
}

// ─── Intervals ────────────────────────────────────────────────────────────────
const INTERVAL_DAYS   = { daily:1, weekly:7, biweekly:14, monthly:30, quarterly:90 };
const INTERVAL_LABELS = { daily:'Daily', weekly:'Weekly', biweekly:'Every 2 weeks', monthly:'Monthly', quarterly:'Quarterly' };

function getScheduledDueAt(task, timezone = 'UTC') {
  const offset = getTimezoneOffset(timezone);
  if (task.dueDate) {
    return new Date(task.dueDate + 'T' + (task.dueTime || '00:00') + ':00').getTime() + offset;
  }
  const intervalMs = getIntervalMs(task);
  const timeStr    = task.dueTime || '00:00';
  if (task.scheduleMode !== 'flexible') {
    const anchorDate = task.startDate
      || (task.createdAt ? task.createdAt.slice(0, 10) : null)
      || new Date().toISOString().slice(0, 10);
    let dueAt = new Date(anchorDate + 'T' + timeStr + ':00').getTime() + offset;
    const after = task.lastCompleted ? new Date(task.lastCompleted).getTime() : dueAt - 1;
    while (dueAt <= after) dueAt += intervalMs;
    return dueAt;
  }
  const base = task.lastCompleted
    ? new Date(new Date(task.lastCompleted).getTime() + intervalMs)
    : new Date((task.startDate || new Date().toISOString().slice(0, 10)) + 'T' + timeStr + ':00');
  if (task.dueTime) { const [h,m]=task.dueTime.split(':').map(Number); base.setHours(h,m,0,0); }
  return base.getTime() + offset;
}

function getDueAt(task, timezone = 'UTC') {
  if (task.nextDueAt && task.scheduleMode !== 'flexible') {
    return new Date(task.nextDueAt).getTime();
  }
  return getScheduledDueAt(task, timezone);
}

function getIntervalMs(task) {
  if (task.intervalCustomDays) return Number(task.intervalCustomDays) * 86400000;
  return (INTERVAL_DAYS[task.interval] || 7) * 86400000;
}

function getNotifyAt(task, timezone = 'UTC') {
  const base = getDueAt(task, timezone) - (task.notifyOffset != null ? Number(task.notifyOffset) : 0) * 60000;
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

// ─── HA Sensor Entities ───────────────────────────────────────────────────────
async function setHaState(data, entityId, state, attributes) {
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return;
  const payload = JSON.stringify({ state: String(state), attributes });
  const url = new URL(`/api/states/${entityId}`, haUrl);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise(resolve => {
    const req = lib.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname, method: 'POST',
      headers: { 'Authorization': `Bearer ${haToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      rejectUnauthorized: false
    }, res => { res.resume(); resolve(); });
    req.on('error', () => resolve());
    req.write(payload); req.end();
  });
}

async function updateHaSensors() {
  const data  = readData();
  const tasks = data.tasks;
  const users = data.settings.users || [];
  await setHaState(data, 'sensor.steward_due',      tasks.filter(t => isDue(t)).length,  { friendly_name: 'Steward Due',      icon: 'mdi:clipboard-list' });
  await setHaState(data, 'sensor.steward_due_soon', tasks.filter(t => isSoon(t)).length, { friendly_name: 'Steward Due Soon',  icon: 'mdi:clock-alert-outline' });
  for (const user of users) {
    const ut = tasks.filter(t => t.assignee === user.id || t.assignee === 'alle');
    await setHaState(data, `sensor.steward_${user.id}_due`, ut.filter(t => isDue(t)).length, {
      friendly_name: `Steward ${user.name} Due`, icon: 'mdi:account-check'
    });
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────
const pendingTimers = {};

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
  const lib     = url.protocol === 'https:' ? https : http;
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

async function fireNotification(taskId) {
  const data = readData();
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return;
  const timezone = data.settings.timezone || 'UTC';
  const cycleStart = task.lastCompleted ? new Date(task.lastCompleted) : new Date(0);
  if (task.lastNotified && new Date(task.lastNotified) > cycleStart) return;
  const allUsers = data.settings.users || [];
  const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
  const timeStr  = task.dueTime ? ` at ${task.dueTime}` : '';
  const soon     = task.notifyOffset && task.notifyOffset > 0;
  const msg      = `"${task.name}" is${soon ? ' almost' : ''} due${timeStr}`;
  console.log(`[Notify] ${msg}`);
  for (const userId of targets) {
    if (task.notifications.ha)    await sendHaNotify(data, userId, '🏠 Task due', msg, task.id);
    if (task.notifications.email) { try { await sendEmail(data, userId, task.name, msg); } catch(e) { console.error(e.message); } }
  }
  task.lastNotified = new Date().toISOString();
  writeData(data);
}

function scheduleNotification(task, timezone = 'UTC') {
  if (!task.notifications.email && !task.notifications.ha) return;
  if (pendingTimers[task.id]) { clearTimeout(pendingTimers[task.id]); delete pendingTimers[task.id]; }
  const notifyAt = getNotifyAt(task, timezone);
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
  const timezone = data.settings.timezone || 'UTC';
  let n = 0;
  for (const task of data.tasks) {
    if (!task.notifications.email && !task.notifications.ha) continue;
    if (getNotifyAt(task, timezone) > Date.now()) { scheduleNotification(task, timezone); n++; }
  }
  if (n) console.log(`[Schedule] ${n} timers restored`);
}

// ─── HA States ────────────────────────────────────────────────────────────────
function fetchHaStates(data, timeoutMs = 10000) {
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return Promise.resolve(null);
  const url = new URL('/api/states', haUrl);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise(resolve => {
    const req = lib.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname, method: 'GET',
      headers: { 'Authorization': `Bearer ${haToken}` },
      rejectUnauthorized: false,
      timeout: timeoutMs
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function fetchHaConfig(data, timeoutMs = 10000) {
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return Promise.resolve(null);
  const url = new URL('/api/config', haUrl);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise(resolve => {
    const req = lib.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname, method: 'GET',
      headers: { 'Authorization': `Bearer ${haToken}` },
      rejectUnauthorized: false,
      timeout: timeoutMs
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const config = JSON.parse(body);
          resolve(config.time_zone || null);
        } catch(e) {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function getTimezoneOffset(timezone = 'UTC') {
  try {
    const now = new Date();
    const serverTz = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(now);
    const userTz = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(now);

    const serverTime = new Date(serverTz.replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6Z')).getTime();
    const userTime = new Date(userTz.replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6Z')).getTime();

    return userTime - serverTime;
  } catch(e) {
    console.warn(`[Timezone] Failed to calculate offset for ${timezone}:`, e.message);
    return 0;
  }
}

async function syncHaTimezone() {
  const data = readData();
  if (!data.settings.timezone || data.settings.timezone === 'auto') {
    const tz = await fetchHaConfig(data);
    if (tz) {
      data.settings.timezone = tz;
      writeData(data);
      console.log(`[Timezone] Auto-synced from HA: ${tz}`);
    }
  }
}

// ─── HA Triggers ──────────────────────────────────────────────────────────────
async function checkHaTriggers() {
  const data     = readData();
  const triggers = data.settings.haTriggers || [];
  if (!triggers.length) return;

  const states = await fetchHaStates(data);
  if (!states) return;

  const stateMap = {};
  states.forEach(s => stateMap[s.entity_id] = s);

  let changed = false;
  for (const trigger of triggers) {
    if (!trigger.entityId || !trigger.toState || !trigger.enabled) continue;
    const entity = stateMap[trigger.entityId];
    if (!entity) continue;
    const current = entity.state;

    if (current === trigger.toState && trigger.lastState !== trigger.toState) {
      const task = {
        id:                 uuidv4(),
        name:               trigger.taskName || entity.attributes.friendly_name || trigger.entityId,
        assignee:           trigger.assignee || 'alle',
        room:               trigger.room     || 'general',
        interval:           'once',
        intervalCustomDays: null,
        scheduleMode:       'strict',
        priority:           'normal',
        createdAt:          new Date().toISOString(),
        startDate:          null, dueDate: null, nextDueAt: null,
        dueTime:            trigger.dueTime  || null,
        notifyOffset:       trigger.notifyOffset != null ? Number(trigger.notifyOffset) : 0,
        snoozedUntil:       null, lastComment: null,
        lastCompleted:      null, completedBy: null, lastNotified: null,
        notifications:      trigger.notifications || { email: false, ha: true }
      };
      data.tasks.push(task);
      console.log(`[HA Trigger] "${task.name}" fired by ${trigger.entityId} → ${current}`);
      changed = true;
      const allUsers = data.settings.users || [];
      const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
      const timeStr  = task.dueTime ? ` at ${task.dueTime}` : '';
      const msg      = `"${task.name}" is due${timeStr}`;
      for (const userId of targets) {
        if (task.notifications.ha)    await sendHaNotify(data, userId, '🏠 New task', msg);
        if (task.notifications.email) { try { await sendEmail(data, userId, task.name, msg); } catch(e) {} }
      }
      task.lastNotified = new Date().toISOString();
    }
    if (trigger.lastState !== current) { trigger.lastState = current; changed = true; }
  }
  if (changed) writeData(data);
}

// ─── Cron: 15min fallback + 24h repeat ───────────────────────────────────────
cron.schedule('*/15 * * * *', async () => {
  const data = readData();
  const timezone = data.settings.timezone || 'UTC';
  let changed = false;
  const now = Date.now();

  for (const task of data.tasks) {
    if (!task.notifications.email && !task.notifications.ha) continue;
    if (task.snoozedUntil && new Date(task.snoozedUntil).getTime() > now) continue;

    const cycleStart      = task.lastCompleted ? new Date(task.lastCompleted).getTime() : 0;
    const alreadyNotified = task.lastNotified && new Date(task.lastNotified).getTime() > cycleStart;

    const notifyAt = getNotifyAt(task, timezone);
    const delayUntilNotify = notifyAt - now;

    if (!alreadyNotified && delayUntilNotify <= 0 && delayUntilNotify > -10 * 60000) {
      const allUsers = data.settings.users || [];
      const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
      const timeStr  = task.dueTime ? ` at ${task.dueTime}` : '';
      const soon     = task.notifyOffset && task.notifyOffset > 0;
      const msg      = `"${task.name}" is${soon ? ' almost' : ''} due${timeStr}`;
      for (const userId of targets) {
        if (task.notifications.ha)    await sendHaNotify(data, userId, '🏠 Task due', msg, task.id);
        if (task.notifications.email) { try { await sendEmail(data, userId, task.name, msg); } catch(e) {} }
      }
      task.lastNotified = new Date().toISOString();
      changed = true;

    } else if (alreadyNotified && isDue(task)) {
      const hoursSince = (now - new Date(task.lastNotified).getTime()) / 3600000;
      if (hoursSince >= 24) {
        const allUsers = data.settings.users || [];
        const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
        const timeStr  = task.dueTime ? ` at ${task.dueTime}` : '';
        const msg      = `⚠️ Still pending: "${task.name}"${timeStr}`;
        console.log(`[Notify] Repeat: ${msg}`);
        for (const userId of targets) {
          if (task.notifications.ha)    await sendHaNotify(data, userId, '🏠 Reminder', msg, task.id);
          if (task.notifications.email) { try { await sendEmail(data, userId, task.name, msg); } catch(e) {} }
        }
        task.lastNotified = new Date().toISOString();
        changed = true;
      }
    }
  }
  if (changed) writeData(data);
});

// ─── API: Tasks ───────────────────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const data = readData();
  res.json(data.tasks.map(t => ({
    ...t,
    isDue: isDue(t), isSoon: isSoon(t), nextDue: nextDueDate(t),
    dueAtMs: getDueAt(t),
    intervalLabel: INTERVAL_LABELS[t.interval]
  })));
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const data   = readData();
  const task   = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const userId = req.body.userId || req.body.person || 'unknown';
  const points = task.priority === 'high' ? 3 : task.priority === 'low' ? 1 : 2;
  if (task.scheduleMode !== 'flexible' && !task.dueDate) {
    const currentDueAt = getScheduledDueAt(task);
    const intervalMs   = getIntervalMs(task);
    let   nextDue      = currentDueAt + intervalMs;
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
    data.completions.push({ id: uuidv4(), taskId: task.id, taskName: task.name, userId, points, date: task.lastCompleted, comment: task.lastComment });
  }
  if (task.dueDate) {
    if (!data.archive) data.archive = [];
    data.archive.push({ id: uuidv4(), name: task.name, room: task.room, assignee: task.assignee, priority: task.priority || 'normal', dueDate: task.dueDate, dueTime: task.dueTime, completedBy: userId, archivedAt: task.lastCompleted, comment: task.lastComment });
    data.tasks = data.tasks.filter(t => t.id !== task.id);
    writeData(data); updateHaSensors();
    return res.json({ success: true, archived: true });
  }
  writeData(data); scheduleNotification(task, data.settings.timezone || 'UTC'); updateHaSensors();
  res.json({ success: true, task });
});

app.post('/api/tasks/:id/reset', async (req, res) => {
  const data = readData();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  task.lastCompleted = null; task.completedBy = null; task.lastNotified = null; task.snoozedUntil = null; task.nextDueAt = null;
  await writeData(data);
  fireNotification(task.id);
  updateHaSensors();
  res.json({ success: true, task });
});

app.post('/api/tasks/:id/snooze', (req, res) => {
  const data = readData();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const hours = Number(req.body.hours) || 2;
  task.snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
  writeData(data); scheduleNotification(task, data.settings.timezone || 'UTC');
  console.log(`[Snooze] "${task.name}" snoozed for ${hours}h`);
  res.json({ success: true, snoozedUntil: task.snoozedUntil });
});

app.post('/api/tasks', (req, res) => {
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
    snoozedUntil:       null, lastComment: null,
    lastCompleted:      null, completedBy: null, lastNotified: null,
    notifications:      req.body.notifications || { email: false, ha: true }
  };
  data.tasks.push(task); writeData(data); scheduleNotification(task, data.settings.timezone || 'UTC'); updateHaSensors();
  res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const data = readData();
  const idx  = data.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.tasks[idx] = { ...data.tasks[idx], ...req.body, id: req.params.id };
  writeData(data); scheduleNotification(data.tasks[idx]);
  res.json(data.tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const data = readData();
  if (pendingTimers[req.params.id]) { clearTimeout(pendingTimers[req.params.id]); delete pendingTimers[req.params.id]; }
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  writeData(data); res.json({ success: true });
});

// ─── API: Settings ────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const data = readData();
  const s = { ...data.settings };
  s.gmailAppPassword = s.gmailAppPassword ? '***' : '';
  s.haToken          = s.haToken          ? '***' : '';
  s.archiveDays      = s.archiveDays      ?? 180;
  s.planningDays     = s.planningDays     ?? 7;
  res.json(s);
});

app.post('/api/theme', (req, res) => {
  const data = readData();
  data.settings.theme = req.body.theme === 'light' ? 'light' : 'dark';
  writeData(data);
  res.json({ success: true, theme: data.settings.theme });
});

app.post('/api/settings', (req, res) => {
  const data = readData();
  const { gmailAppPassword, haToken, ...rest } = req.body;
  if (rest.users) {
    const newIds = new Set(rest.users.map(u => u.id));
    newIds.add('alle');
    for (const t of data.tasks) {
      if (t.assignee !== 'alle' && !newIds.has(t.assignee)) {
        console.log(`[Settings] Task "${t.name}": assignee "${t.assignee}" removed → "alle"`);
        t.assignee = 'alle';
      }
    }
  }
  data.settings = { ...data.settings, ...rest };
  if (gmailAppPassword && gmailAppPassword !== '***') data.settings.gmailAppPassword = gmailAppPassword;
  if (haToken          && haToken          !== '***') data.settings.haToken          = haToken;
  writeData(data);
  startHaEventSubscription();
  res.json({ success: true });
});

app.get('/api/sync-timezone', async (req, res) => {
  await syncHaTimezone();
  const data = readData();
  res.json({ timezone: data.settings.timezone || 'UTC' });
});

// ─── Cron: Archive cleanup daily at 03:00 ────────────────────────────────────
cron.schedule('0 3 * * *', () => {
  const data = readData();
  if (!data.archive?.length) return;
  const archiveDays = data.settings.archiveDays ?? 180;
  const cutoff = Date.now() - archiveDays * 86400000;
  const before = data.archive.length;
  data.archive = data.archive.filter(e => new Date(e.archivedAt).getTime() > cutoff);
  if (data.archive.length !== before) {
    console.log(`[Archive] Removed ${before - data.archive.length} entries (>${archiveDays}d)`);
    writeData(data);
  }
});

// ─── Export / Import ──────────────────────────────────────────────────────────
app.get('/api/export', (req, res) => {
  const data     = readData();
  const filename = `steward-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

app.post('/api/import', async (req, res) => {
  const imported = req.body;
  if (!Array.isArray(imported?.tasks) || typeof imported?.settings !== 'object') {
    return res.status(400).json({ error: 'Invalid backup — missing tasks or settings' });
  }
  const data = migrateData(imported);
  await writeData(data);
  Object.keys(pendingTimers).forEach(id => { clearTimeout(pendingTimers[id]); delete pendingTimers[id]; });
  restoreTimers();
  updateHaSensors();
  startHaEventSubscription();
  console.log(`[Import] ${data.tasks.length} tasks, ${(data.completions||[]).length} completions restored`);
  res.json({ success: true, tasks: data.tasks.length, completions: (data.completions||[]).length });
});

app.get('/api/archive', (req, res) => {
  const data = readData();
  const archive = (data.archive || []).sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
  res.json(archive);
});

// ─── Cron: HA triggers every minute ──────────────────────────────────────────
cron.schedule('* * * * *', async () => { await checkHaTriggers(); });

// ─── Cron: HA sensors every 5 minutes ────────────────────────────────────────
cron.schedule('*/5 * * * *', async () => { await updateHaSensors(); });

// ─── API: HA Entities ─────────────────────────────────────────────────────────
app.get('/api/ha-entities', (req, res) => {
  const data = readData();
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return res.status(400).json({ error: 'HA not configured' });
  fetchHaStates(data).then(states => {
    if (!states) return res.status(500).json({ error: 'HA unreachable' });
    const filter = (req.query.q || '').toLowerCase();
    const entities = states
      .filter(s => !filter || s.entity_id.includes(filter) || (s.attributes.friendly_name||'').toLowerCase().includes(filter))
      .map(s => ({ entityId: s.entity_id, friendlyName: s.attributes.friendly_name || s.entity_id, state: s.state, domain: s.entity_id.split('.')[0] }))
      .sort((a,b) => a.entityId.localeCompare(b.entityId));
    res.json(entities);
  });
});

// ─── API: HA Persons ──────────────────────────────────────────────────────────
app.get('/api/ha-persons', (req, res) => {
  const data = readData();
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return res.status(400).json({ error: 'HA not configured' });
  const url = new URL('/api/states', haUrl);
  const lib = url.protocol === 'https:' ? https : http;
  const reqHa = lib.request({
    hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname, method: 'GET',
    headers: { 'Authorization': `Bearer ${haToken}` },
    rejectUnauthorized: false
  }, response => {
    let body = '';
    response.on('data', c => body += c);
    response.on('end', () => {
      try {
        const states  = JSON.parse(body);
        const persons = states
          .filter(s => s.entity_id.startsWith('person.'))
          .map(s => ({ id: s.entity_id.replace('person.', '').toLowerCase().replace(/[^a-z0-9]/g, '_'), name: s.attributes.friendly_name || s.entity_id.replace('person.', ''), entityId: s.entity_id }));
        res.json(persons);
      } catch(e) { res.status(500).json({ error: e.message }); }
    });
  });
  reqHa.on('error', e => res.status(500).json({ error: e.message }));
  reqHa.end();
});

// ─── API: Tests ───────────────────────────────────────────────────────────────
app.post('/api/test-email', async (req, res) => {
  try { await sendEmail(readData(), req.body.userId, 'Test', 'Email is working! 🎉'); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/test-ha', async (req, res) => {
  const data = readData();
  if (!data.settings.haUrl || !data.settings.haToken) return res.status(400).json({ error: 'HA not configured' });
  const result = await sendHaNotify(data, req.body.userId, '🏠 Steward Test', 'HA push is working!');
  if (result && result.statusCode && result.statusCode !== 200) {
    return res.status(500).json({ error: `HA responded with ${result.statusCode}: ${result.body}` });
  }
  res.json({ success: true });
});

// ─── Quick Actions (Notification Buttons) ────────────────────────────────────
const quickPage = (icon, text) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;background:#1a1d27;color:#dde1f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;}h1{font-size:3.5rem;margin:0 0 8px;}p{color:#7c819a;font-size:1rem;}</style></head><body><div><h1>${icon}</h1><p>${text}</p></div></body></html>`;

app.get('/api/quick-complete/:taskId/:userId', (req, res) => {
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
  writeData(data); scheduleNotification(task, data.settings.timezone || 'UTC'); updateHaSensors();
  const user = getUser(data, req.params.userId);
  res.send(quickPage('✓', `"${task.name}"<br>marked as done${user ? ' by ' + user.name : ''}`));
});

app.get('/api/quick-snooze/:taskId/:hours', (req, res) => {
  const data  = readData();
  const task  = data.tasks.find(t => t.id === req.params.taskId);
  if (!task) return res.status(404).send(quickPage('❓', 'Task not found'));
  const hours = Number(req.params.hours) || 2;
  task.snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
  writeData(data); scheduleNotification(task, data.settings.timezone || 'UTC');
  res.send(quickPage('⏰', `"${task.name}"<br>snoozed for ${hours}h`));
});

// ─── Achievements ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id:'first_task',  icon:'🎯', title:'First Task',       desc:'First task completed',                 check:(uc)=>uc.length>=1 },
  { id:'tasks_10',    icon:'✅', title:'Diligent',          desc:'10 tasks completed',                   check:(uc)=>uc.length>=10 },
  { id:'tasks_50',    icon:'💪', title:'Persistent',        desc:'50 tasks completed',                   check:(uc)=>uc.length>=50 },
  { id:'tasks_100',   icon:'🏆', title:'Household Pro',     desc:'100 tasks completed',                  check:(uc)=>uc.length>=100 },
  { id:'streak_3',    icon:'🔥', title:'3-Day Streak',      desc:'3 consecutive days',                   check:(uc,s)=>s>=3 },
  { id:'streak_7',    icon:'🔥', title:'One Week',          desc:'7-day streak',                         check:(uc,s)=>s>=7 },
  { id:'streak_30',   icon:'🔥', title:'Month Streak',      desc:'30-day streak',                        check:(uc,s)=>s>=30 },
  { id:'points_100',  icon:'⭐', title:'100 Points',        desc:'100 points collected',                 check:(uc)=>uc.reduce((s,c)=>s+c.points,0)>=100 },
  { id:'points_500',  icon:'⭐', title:'500 Points',        desc:'500 points collected',                 check:(uc)=>uc.reduce((s,c)=>s+c.points,0)>=500 },
  { id:'points_1000', icon:'🌟', title:'1000 Points',       desc:'1000 points collected',                check:(uc)=>uc.reduce((s,c)=>s+c.points,0)>=1000 },
  { id:'high_10',     icon:'🎖️', title:'Priority Hunter',  desc:'10 high-priority tasks',               check:(uc)=>uc.filter(c=>c.points===3).length>=10 },
  { id:'speed_day',   icon:'⚡', title:'Turbo Day',         desc:'5 tasks in one day',                   check:(uc)=>{ const d={}; uc.forEach(c=>{const k=c.date.slice(0,10);d[k]=(d[k]||0)+1;}); return Object.values(d).some(v=>v>=5); }},
  { id:'variety',     icon:'🗺️', title:'Explorer',         desc:'Tasks in 5+ different rooms',          check:(uc,s,tasks)=>{ const rooms=new Set(tasks.filter(t=>uc.some(c=>c.taskId===t.id)).map(t=>t.room||'general')); return rooms.size>=5; }},
];

function calcAchievements(uc, streak, tasks) {
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(uc, streak, tasks) }));
}

// ─── API: Stats / Points ──────────────────────────────────────────────────────
function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcStreak(completions) {
  if (!completions.length) return 0;
  const days = new Set(completions.map(c => localDateStr(new Date(c.date))));
  let streak = 0;
  const d = new Date();
  if (!days.has(localDateStr(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDateStr(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

app.get('/api/stats', (req, res) => {
  const data        = readData();
  const completions = data.completions || [];
  const users       = data.settings.users || [];
  const now         = new Date();

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const stats = users.map(user => {
    const uc           = completions.filter(c => c.userId === user.id);
    const pointsWeek   = uc.filter(c => new Date(c.date) >= weekStart).reduce((s,c) => s + c.points, 0);
    const pointsMonth  = uc.filter(c => new Date(c.date) >= monthStart).reduce((s,c) => s + c.points, 0);
    const pointsTotal  = uc.reduce((s,c) => s + c.points, 0);
    const streak       = calcStreak(uc);
    const achievements = calcAchievements(uc, streak, data.tasks);
    return { userId: user.id, name: user.name, color: user.color, pointsWeek, pointsMonth, pointsTotal, streak, tasksDone: uc.length, achievements };
  });

  const recent = [...completions].reverse().slice(0, 30).map(c => ({
    ...c, userName: users.find(u => u.id === c.userId)?.name || c.userId
  }));

  res.json({ stats, recent, gamificationEnabled: data.settings.gamificationEnabled !== false });
});

// ─── Webhook: create task from HA automation ──────────────────────────────────
app.post('/api/webhook/create-task', (req, res) => {
  const data   = readData();
  const secret = data.settings.webhookSecret;
  if (secret && req.body.secret !== secret) return res.status(401).json({ error: 'Invalid secret' });
  const { name, assignee, room, interval, startDate, dueDate, dueTime, notifyOffset, notifications } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Required field "name" missing' });
  const task = {
    id:                 uuidv4(), name: name.trim(),
    assignee:           assignee     || 'alle',
    room:               room         || 'general',
    interval:           interval     || 'once',
    intervalCustomDays: null, scheduleMode: 'strict', priority: 'normal',
    createdAt:          new Date().toISOString(), nextDueAt: null,
    startDate:          startDate    || null, dueDate: dueDate || null, dueTime: dueTime || null,
    notifyOffset:       notifyOffset != null ? Number(notifyOffset) : 0,
    snoozedUntil:       null, lastComment: null,
    lastCompleted:      null, completedBy: null, lastNotified: null,
    notifications:      notifications || { email: false, ha: true }
  };
  data.tasks.push(task); writeData(data); scheduleNotification(task, data.settings.timezone || 'UTC');
  console.log(`[Webhook] Task created: "${task.name}" → ${task.assignee}`);
  res.json({ success: true, task });
});

// ─── HA Event Stream (notification action buttons) ───────────────────────────
let haEventReq       = null;
let haEventRetryTime = null;
let haEventRetryMs   = 10000;

function stopHaEventSubscription() {
  if (haEventRetryTime) { clearTimeout(haEventRetryTime); haEventRetryTime = null; }
  if (haEventReq)       { try { haEventReq.destroy(); } catch(e){} haEventReq = null; }
}

function startHaEventSubscription() {
  stopHaEventSubscription();
  const data = readData();
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return;

  const url = new URL('/api/stream?restrict=mobile_app_notification_action', haUrl);
  const lib = url.protocol === 'https:' ? https : http;

  const req = lib.request({
    hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search, method: 'GET',
    headers: { 'Authorization': `Bearer ${haToken}`, 'Accept': 'text/event-stream' },
    rejectUnauthorized: false
  }, res => {
    haEventReq     = res;
    haEventRetryMs = 10000;
    console.log('[HA Events] Connected ✓');
    let buf = '';
    res.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.event_type === 'mobile_app_notification_action') handleNotificationAction(evt.data);
        } catch(e) {}
      }
    });
    res.on('end',   () => { console.log('[HA Events] Stream ended'); scheduleHaReconnect(); });
    res.on('error', () => scheduleHaReconnect());
  });
  req.on('error', e => {
    console.log(`[HA Events] ${e.message} — retry in ${haEventRetryMs / 1000}s`);
    scheduleHaReconnect();
  });
  haEventReq = req;
  req.end();
}

function scheduleHaReconnect() {
  haEventReq = null;
  haEventRetryTime = setTimeout(() => {
    haEventRetryMs = Math.min(haEventRetryMs * 2, 300000);
    startHaEventSubscription();
  }, haEventRetryMs);
}

function handleNotificationAction(eventData) {
  const action = eventData?.action;
  if (!action?.startsWith('HPLAN_')) return;

  const data   = readData();
  const safeId = action.replace(/^HPLAN_(COMPLETE|SNOOZE)_/, '');
  const task   = data.tasks.find(t => t.id.replace(/-/g, '') === safeId);
  if (!task) { console.log(`[HA Action] Task not found: ${safeId}`); return; }

  if (action.startsWith('HPLAN_COMPLETE_')) {
    const allUsers = data.settings.users || [];
    const userId   = task.assignee === 'alle' ? (allUsers[0]?.id || 'unknown') : task.assignee;
    const points   = task.priority === 'high' ? 3 : task.priority === 'low' ? 1 : 2;
    if (task.scheduleMode !== 'flexible' && !task.dueDate) {
      let nextDue = getScheduledDueAt(task) + getIntervalMs(task);
      while (nextDue <= Date.now()) nextDue += getIntervalMs(task);
      task.nextDueAt = new Date(nextDue).toISOString();
    } else { task.nextDueAt = null; }
    task.lastCompleted = new Date().toISOString();
    task.completedBy   = userId;
    task.lastComment   = null;
    task.lastNotified  = null;
    task.snoozedUntil  = null;
    if (data.settings.gamificationEnabled !== false) {
      if (!data.completions) data.completions = [];
      data.completions.push({ id: uuidv4(), taskId: task.id, taskName: task.name, userId, points, date: task.lastCompleted, comment: null });
    }
    if (task.dueDate) {
      if (!data.archive) data.archive = [];
      data.archive.push({ id: uuidv4(), name: task.name, room: task.room, assignee: task.assignee, priority: task.priority || 'normal', dueDate: task.dueDate, dueTime: task.dueTime, completedBy: userId, archivedAt: task.lastCompleted, comment: null });
      data.tasks = data.tasks.filter(t => t.id !== task.id);
    }
    writeData(data);
    if (!task.dueDate) scheduleNotification(task, data.settings.timezone || 'UTC');
    updateHaSensors();
    console.log(`[HA Action] Completed "${task.name}" by ${userId}`);

  } else if (action.startsWith('HPLAN_SNOOZE_')) {
    task.snoozedUntil = new Date(Date.now() + 2 * 3600000).toISOString();
    writeData(data);
    scheduleNotification(task, data.settings.timezone || 'UTC');
    console.log(`[HA Action] Snoozed "${task.name}" for 2h`);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
applyHaOptions();
app.listen(PORT, () => {
  console.log(`🏠 Steward running on port ${PORT}`);
  syncHaTimezone();
  restoreTimers();
  updateHaSensors();
  startHaEventSubscription();
});

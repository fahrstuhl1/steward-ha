const https = require('https');
const http  = require('http');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData, isOnVacation } = require('./data');
const { getScheduledDueAt, getIntervalMs, isDue, isSoon, nextDueDate } = require('./time');
const { sendHaNotify, sendEmail, scheduleNotification, notifyOthersOnCompletion } = require('./notifications');
const { lang: i18nLang, t: i18nT } = require('./i18n');

function request(haUrl, haToken, options, body = null) {
  const url = new URL(options.path, haUrl);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise(resolve => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: options.method || 'GET',
      headers: { 'Authorization': `Bearer ${haToken}`, ...options.headers },
      rejectUnauthorized: false,
      timeout: options.timeout || undefined
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, res }));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error',   () => resolve(null));
    if (body) req.write(body);
    req.end();
  });
}

async function setHaState(data, entityId, state, attributes) {
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return;
  const payload = JSON.stringify({ state: String(state), attributes });
  await request(haUrl, haToken, {
    path: `/api/states/${entityId}`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, payload);
}

function taskAttrs(list, tz) {
  return list.map(t => ({ name: t.name, room: t.room || 'general', assignee: t.assignee, priority: t.priority || 'normal', due: nextDueDate(t, tz) }));
}

async function updateHaSensors() {
  const data  = readData();
  const tasks = data.tasks;
  const users = data.settings.users || [];
  const rooms = data.settings.rooms || [];
  const tz    = data.settings.timezone || null;

  const onVacation = isOnVacation(data.settings);

  const dueTasks  = onVacation ? [] : tasks.filter(t => isDue(t, tz));
  const soonTasks = onVacation ? [] : tasks.filter(t => !isDue(t, tz) && isSoon(t, tz));

  await setHaState(data, 'sensor.steward_due',      dueTasks.length,  { friendly_name: 'Steward Due',      icon: 'mdi:clipboard-list',       tasks: taskAttrs(dueTasks,  tz) });
  await setHaState(data, 'sensor.steward_due_soon', soonTasks.length, { friendly_name: 'Steward Due Soon', icon: 'mdi:clock-alert-outline',  tasks: taskAttrs(soonTasks, tz) });

  for (const user of users) {
    const userDue = onVacation ? [] : tasks.filter(t => (t.assignee === user.id || t.assignee === 'alle') && isDue(t, tz));
    await setHaState(data, `sensor.steward_${user.id}_due`, userDue.length, {
      friendly_name: `Steward ${user.name} Due`, icon: 'mdi:account-check', tasks: taskAttrs(userDue, tz)
    });
  }

  for (const room of rooms) {
    const roomDue = onVacation ? [] : tasks.filter(t => (t.room || 'general') === room.id && isDue(t, tz));
    await setHaState(data, `sensor.steward_${room.id}_due`, roomDue.length, {
      friendly_name: `Steward ${room.name || room.id} Due`, icon: room.icon || 'mdi:door', tasks: taskAttrs(roomDue, tz)
    });
  }
}

async function fetchHaStates(data, timeoutMs = 10000) {
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return null;
  const result = await request(haUrl, haToken, { path: '/api/states', timeout: timeoutMs });
  if (!result) return null;
  try { return JSON.parse(result.body); } catch(e) { return null; }
}

async function fetchHaConfig(data, timeoutMs = 10000) {
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return null;
  const result = await request(haUrl, haToken, { path: '/api/config', timeout: timeoutMs });
  if (!result) return null;
  try { return JSON.parse(result.body); } catch(e) { return null; }
}

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
    const entity  = stateMap[trigger.entityId];
    if (!entity) continue;
    const current = entity.state;

    if (current === trigger.toState && trigger.lastState !== trigger.toState) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const task = {
        id: uuidv4(),
        name:               trigger.taskName || entity.attributes.friendly_name || trigger.entityId,
        assignee:           trigger.assignee || 'alle',
        room:               trigger.room     || 'general',
        interval:           'once', intervalCustomDays: null, scheduleMode: 'strict', priority: 'normal',
        createdAt:          new Date().toISOString(),
        startDate: null, dueDate: todayStr, nextDueAt: null,
        dueTime:            trigger.dueTime  || null,
        notifyOffset:       trigger.notifyOffset != null ? Number(trigger.notifyOffset) : 0,
        snoozedUntil: null, lastComment: null, lastCompleted: null, completedBy: null, lastNotified: null,
        notify:             trigger.notify !== false
      };
      data.tasks.push(task);
      console.log(`[HA Trigger] "${task.name}" fired by ${trigger.entityId} → ${current}`);
      changed = true;
      const allUsers = data.settings.users || [];
      const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
      const language = i18nLang(data);
      const msg      = i18nT(language, 'notify.task_due_msg', {
        name: task.name, soon: '',
        time: task.dueTime ? i18nT(language, 'notify.at', { time: task.dueTime }) : ''
      });
      const title    = i18nT(language, 'notify.new_task_title');
      for (const userId of targets) {
        await sendHaNotify(data, userId, title, msg);
        try { await sendEmail(data, userId, task.name, msg); } catch(e) {}
      }
      task.lastNotified = new Date().toISOString();
    }
    if (trigger.lastState !== current) { trigger.lastState = current; changed = true; }
  }
  if (changed) writeData(data);
}

// ─── HA Event Stream ──────────────────────────────────────────────────────────
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
    notifyOthersOnCompletion(data, task, userId);
    if (task.dueDate) {
      if (!data.archive) data.archive = [];
      data.archive.push({ id: uuidv4(), name: task.name, room: task.room, assignee: task.assignee, priority: task.priority || 'normal', dueDate: task.dueDate, dueTime: task.dueTime, completedBy: userId, archivedAt: task.lastCompleted, comment: null });
      data.tasks = data.tasks.filter(t => t.id !== task.id);
    }
    writeData(data);
    if (!task.dueDate) scheduleNotification(task);
    updateHaSensors();
    console.log(`[HA Action] Completed "${task.name}" by ${userId}`);

  } else if (action.startsWith('HPLAN_SNOOZE_')) {
    task.snoozedUntil = new Date(Date.now() + 2 * 3600000).toISOString();
    writeData(data);
    scheduleNotification(task);
    console.log(`[HA Action] Snoozed "${task.name}" for 2h`);
  }
}

module.exports = { setHaState, updateHaSensors, fetchHaStates, fetchHaConfig, checkHaTriggers, startHaEventSubscription, stopHaEventSubscription };

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const { readData, writeData, migrateData } = require('../lib/data');
const { pendingTimers, restoreTimers } = require('../lib/notifications');
const { updateHaSensors, fetchHaStates, fetchHaConfig, startHaEventSubscription } = require('../lib/ha');

router.get('/settings', (req, res) => {
  const data = readData();
  const s = { ...data.settings };
  s.gmailAppPassword = s.gmailAppPassword ? '***' : '';
  s.haToken          = s.haToken          ? '***' : '';
  s.archiveDays      = s.archiveDays      ?? 180;
  s.planningDays     = s.planningDays     ?? 7;
  res.json(s);
});

router.post('/theme', (req, res) => {
  const data = readData();
  data.settings.theme = req.body.theme === 'light' ? 'light' : 'dark';
  writeData(data);
  res.json({ success: true, theme: data.settings.theme });
});

router.post('/settings', (req, res) => {
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

router.get('/export', (req, res) => {
  const data     = readData();
  const filename = `steward-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

router.post('/import', async (req, res) => {
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

router.get('/archive', (req, res) => {
  const data = readData();
  const archive = (data.archive || []).sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
  res.json(archive);
});

router.post('/webhook/create-task', (req, res) => {
  const data   = readData();
  const secret = data.settings.webhookSecret;
  if (secret && req.body.secret !== secret) return res.status(401).json({ error: 'Invalid secret' });
  const { name, assignee, room, interval, startDate, dueDate, dueTime, notifyOffset, notify } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Required field "name" missing' });
  const task = {
    id: uuidv4(), name: name.trim(),
    assignee: assignee || 'alle', room: room || 'general',
    interval: interval || 'once', intervalCustomDays: null, scheduleMode: 'strict', priority: 'normal',
    createdAt: new Date().toISOString(), nextDueAt: null,
    startDate: startDate || null, dueDate: dueDate || null, dueTime: dueTime || null,
    notifyOffset: notifyOffset != null ? Number(notifyOffset) : 0,
    subtasks: [],
    snoozedUntil: null, lastComment: null, lastCompleted: null, completedBy: null, lastNotified: null,
    notify: notify !== false
  };
  data.tasks.push(task); writeData(data);
  const { scheduleNotification } = require('../lib/notifications');
  scheduleNotification(task);
  console.log(`[Webhook] Task created: "${task.name}" → ${task.assignee}`);
  res.json({ success: true, task });
});

router.post('/test-email', async (req, res) => {
  const { sendEmail } = require('../lib/notifications');
  try { await sendEmail(readData(), req.body.userId, 'Test', 'Email is working! 🎉'); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/test-ha', async (req, res) => {
  const data = readData();
  if (!data.settings.haUrl || !data.settings.haToken) return res.status(400).json({ error: 'HA not configured' });
  const { sendHaNotify } = require('../lib/notifications');
  const result = await sendHaNotify(data, req.body.userId, '🏠 Steward Test', 'HA push is working!');
  if (result && result.statusCode && result.statusCode !== 200) {
    return res.status(500).json({ error: `HA responded with ${result.statusCode}: ${result.body}` });
  }
  res.json({ success: true });
});

router.get('/sync-timezone', async (req, res) => {
  const data   = readData();
  const config = await fetchHaConfig(data);
  if (!config) return res.status(500).json({ error: 'HA unreachable or not configured' });
  if (!config.time_zone) return res.status(500).json({ error: 'No timezone in HA config' });
  res.json({ timezone: config.time_zone });
});

router.get('/ha-entities', (req, res) => {
  const data = readData();
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return res.status(400).json({ error: 'HA not configured' });
  fetchHaStates(data).then(states => {
    if (!states) return res.status(500).json({ error: 'HA unreachable' });
    const filter   = (req.query.q || '').toLowerCase();
    const entities = states
      .filter(s => !filter || s.entity_id.includes(filter) || (s.attributes.friendly_name||'').toLowerCase().includes(filter))
      .map(s => ({ entityId: s.entity_id, friendlyName: s.attributes.friendly_name || s.entity_id, state: s.state, domain: s.entity_id.split('.')[0] }))
      .sort((a,b) => a.entityId.localeCompare(b.entityId));
    res.json(entities);
  });
});

router.get('/ha-persons', (req, res) => {
  const data = readData();
  const { haUrl, haToken } = data.settings;
  if (!haUrl || !haToken) return res.status(400).json({ error: 'HA not configured' });
  fetchHaStates(data).then(states => {
    if (!states) return res.status(500).json({ error: 'HA unreachable' });
    const persons = states
      .filter(s => s.entity_id.startsWith('person.'))
      .map(s => ({ id: s.entity_id.replace('person.', '').toLowerCase().replace(/[^a-z0-9]/g, '_'), name: s.attributes.friendly_name || s.entity_id.replace('person.', ''), entityId: s.entity_id }));
    res.json(persons);
  });
});

module.exports = router;

const fs   = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE || '/data/data.json';

function readData() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return migrateData(data);
}

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

function applyHaOptions() {
  const OPTIONS_FILE = '/data/options.json';
  if (!fs.existsSync(OPTIONS_FILE)) return;
  try {
    const opts = JSON.parse(fs.readFileSync(OPTIONS_FILE, 'utf8'));
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let changed = false;
    if (opts.ha_url        && !data.settings.haUrl)        { data.settings.haUrl          = opts.ha_url;         changed = true; }
    if (opts.ha_token      && !data.settings.haToken)      { data.settings.haToken         = opts.ha_token;        changed = true; }
    if (opts.webhook_secret && !data.settings.webhookSecret) { data.settings.webhookSecret = opts.webhook_secret;  changed = true; }
    if (changed) { atomicWrite(data); console.log('[Config] HA options applied ✓'); }
  } catch(e) { console.error('[Config] Error reading options.json:', e.message); }
}

function migrateData(data) {
  let changed = false;

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

  for (const task of data.tasks) {
    if (task.notifications !== undefined && task.notify === undefined) {
      task.notify = !!(task.notifications.ha || task.notifications.email);
      delete task.notifications;
      changed = true;
    }
  }

  if (changed) atomicWrite(data);
  return data;
}

function isOnVacation(settings) {
  const vacFrom = settings.vacationFrom ? new Date(settings.vacationFrom)              : null;
  const vacTo   = settings.vacationTo   ? new Date(settings.vacationTo + 'T23:59:59') : null;
  return !!(vacFrom && vacTo && new Date() >= vacFrom && new Date() <= vacTo);
}

module.exports = { DATA_FILE, readData, writeData, atomicWrite, migrateData, applyHaOptions, isOnVacation };

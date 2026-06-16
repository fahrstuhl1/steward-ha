const cron = require('node-cron');
const { readData, writeData, isOnVacation } = require('./lib/data');
const { getDueAt, getNotifyAt, isDue, timeOfDayStr } = require('./lib/time');
const { sendHaNotify, sendEmail, tryLockNotify, unlockNotify } = require('./lib/notifications');
const { updateHaSensors, checkHaTriggers } = require('./lib/ha');
const { lang, t } = require('./lib/i18n');

// 15-minute fallback: send missed notifications + 24h repeat for still-pending tasks
cron.schedule('*/15 * * * *', async () => {
  const data = readData();
  if (isOnVacation(data.settings)) return;

  let changed = false;
  const now = Date.now();

  for (const task of data.tasks) {
    if (task.notify === false) continue;
    if (task.snoozedUntil && new Date(task.snoozedUntil).getTime() > now) continue;

    const cycleStart      = task.lastCompleted ? new Date(task.lastCompleted).getTime() : 0;
    const alreadyNotified = task.lastNotified && new Date(task.lastNotified).getTime() > cycleStart;

    if (!alreadyNotified && getNotifyAt(task, data.settings.timezone || null) <= now) {
      if (!tryLockNotify(task.id)) continue;
      try {
        const allUsers = data.settings.users || [];
        const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
        const language = lang(data);
        const tod      = timeOfDayStr(getDueAt(task), data.settings.timezone);
        const soon     = task.notifyOffset && task.notifyOffset > 0;
        const msg      = t(language, 'notify.task_due_msg', {
          name: task.name,
          soon: soon ? t(language, 'notify.almost') : '',
          time: tod !== '00:00' ? t(language, 'notify.at', { time: tod }) : ''
        });
        const title    = t(language, 'notify.task_due_title');
        for (const userId of targets) {
          await sendHaNotify(data, userId, title, msg, task.id);
          try { await sendEmail(data, userId, task.name, msg); } catch(e) {}
        }
        task.lastNotified = new Date().toISOString();
        changed = true;
      } finally {
        unlockNotify(task.id);
      }

    } else if (alreadyNotified && isDue(task, data.settings.timezone || null)) {
      const hoursSince = (now - new Date(task.lastNotified).getTime()) / 3600000;
      if (hoursSince >= (data.settings.repeatNotifyHours ?? 24)) {
        if (!tryLockNotify(task.id)) continue;
        try {
          const allUsers = data.settings.users || [];
          const targets  = task.assignee === 'alle' ? allUsers.map(u => u.id) : [task.assignee];
          const language = lang(data);
          const tod      = timeOfDayStr(getDueAt(task), data.settings.timezone);
          const msg      = t(language, 'notify.task_pending_msg', {
            name: task.name,
            time: tod !== '00:00' ? t(language, 'notify.at', { time: tod }) : ''
          });
          const title    = t(language, 'notify.task_pending_title');
          console.log(`[Notify] Repeat: ${msg}`);
          for (const userId of targets) {
            await sendHaNotify(data, userId, title, msg, task.id);
            try { await sendEmail(data, userId, task.name, msg); } catch(e) {}
          }
          task.lastNotified = new Date().toISOString();
          changed = true;
        } finally {
          unlockNotify(task.id);
        }
      }
    }
  }
  if (changed) writeData(data);
});

// Daily archive cleanup at 03:00
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

// HA trigger check every minute
cron.schedule('* * * * *', async () => { await checkHaTriggers(); });

// HA sensor update every 5 minutes
cron.schedule('*/5 * * * *', async () => { await updateHaSensors(); });

// Weekly summary: Monday 07:00 UTC
cron.schedule('0 7 * * 1', async () => {
  const data = readData();
  if (!data.settings.weeklySummaryEnabled) return;
  const oneWeekAgo = Date.now() - 7 * 86400000;
  const recent = (data.completions || []).filter(c => new Date(c.date).getTime() > oneWeekAgo);
  if (!recent.length) return;
  const allUsers = data.settings.users || [];
  const language = lang(data);
  const lines    = recent.map(c => {
    const u = allUsers.find(u => u.id === c.userId);
    return `• ${c.taskName} (${u ? u.name : c.userId})`;
  });
  const header = recent.length === 1
    ? t(language, 'notify.weekly_one')
    : t(language, 'notify.weekly_many', { count: recent.length });
  const msg   = header + '\n' + lines.slice(0, 15).join('\n');
  const title = t(language, 'notify.weekly_title');
  console.log('[WeeklySummary]', msg);
  for (const user of allUsers) {
    if (user.haService) {
      try { await sendHaNotify(data, user.id, title, msg, null); } catch(e) {}
    }
    if (user.email && data.settings.gmailUser) {
      try { await sendEmail(data, user.id, 'Steward Weekly Summary', msg); } catch(e) {}
    }
  }
});

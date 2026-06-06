const cron = require('node-cron');
const { readData, writeData, isOnVacation } = require('./lib/data');
const { getNotifyAt, isDue } = require('./lib/time');
const { sendHaNotify, sendEmail } = require('./lib/notifications');
const { updateHaSensors, checkHaTriggers } = require('./lib/ha');

// 15-minute fallback: send missed notifications + 24h repeat for still-pending tasks
cron.schedule('*/15 * * * *', async () => {
  const data = readData();
  if (isOnVacation(data.settings)) return;

  let changed = false;
  const now = Date.now();

  for (const task of data.tasks) {
    if (!task.notifications.email && !task.notifications.ha) continue;
    if (task.snoozedUntil && new Date(task.snoozedUntil).getTime() > now) continue;

    const cycleStart      = task.lastCompleted ? new Date(task.lastCompleted).getTime() : 0;
    const alreadyNotified = task.lastNotified && new Date(task.lastNotified).getTime() > cycleStart;

    if (!alreadyNotified && getNotifyAt(task) <= now) {
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
  const lines    = recent.map(c => {
    const u = allUsers.find(u => u.id === c.userId);
    return `• ${c.taskName} (${u ? u.name : c.userId})`;
  });
  const msg = `Weekly summary: ${recent.length} task${recent.length !== 1 ? 's' : ''} completed\n` + lines.slice(0, 15).join('\n');
  console.log('[WeeklySummary]', msg);
  for (const user of allUsers) {
    if (user.haService) {
      try { await sendHaNotify(data, user.id, '📋 Weekly Summary', msg, null); } catch(e) {}
    }
    if (user.email && data.settings.gmailUser) {
      try { await sendEmail(data, user.id, 'Steward Weekly Summary', msg); } catch(e) {}
    }
  }
});

const express = require('express');
const router  = express.Router();
const { readData }    = require('../lib/data');
const { getDueAt, getIntervalMs } = require('../lib/time');

function escIcal(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldLine(line) {
  const LIMIT = 75;
  if (Buffer.byteLength(line, 'utf8') <= LIMIT) return line;
  const parts = [];
  while (Buffer.byteLength(line, 'utf8') > LIMIT) {
    let i = LIMIT;
    while (i > 1 && Buffer.byteLength(line.slice(0, i), 'utf8') > LIMIT) i--;
    parts.push(line.slice(0, i));
    line = ' ' + line.slice(i);
  }
  parts.push(line);
  return parts.join('\r\n');
}

function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

function dateStr(ms, tz) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }).replace(/-/g, '');
}

function makeEvent(task, dueAtMs, summary, description, tz) {
  const uid   = `${task.id}-${dueAtMs}@steward`;
  const stamp = utcStamp(Date.now());
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ];

  if (task.dueTime) {
    lines.push(`DTSTART:${utcStamp(dueAtMs)}`);
    lines.push(`DTEND:${utcStamp(dueAtMs + 3600000)}`);
  } else {
    const d = dateStr(dueAtMs, tz);
    const tomorrow = dateStr(dueAtMs + 86400000, tz);
    lines.push(`DTSTART;VALUE=DATE:${d}`);
    lines.push(`DTEND;VALUE=DATE:${tomorrow}`);
  }

  lines.push(`SUMMARY:${escIcal(summary)}`);
  if (description) lines.push(`DESCRIPTION:${escIcal(description)}`);

  const priority = task.priority === 'high' ? 1 : task.priority === 'low' ? 9 : 5;
  lines.push(`PRIORITY:${priority}`);
  lines.push('END:VEVENT');
  return lines;
}

router.get('/calendar.ics', (req, res) => {
  let data;
  try {
    data = readData();
  } catch (e) {
    return res.status(503).send('Service Unavailable');
  }

  const tasks = data.tasks;
  const users = data.settings.users || [];
  const rooms = data.settings.rooms || [];
  const tz    = data.settings.timezone || 'UTC';

  // Respect vacation mode — suppress all events during vacation window
  const nowDate  = new Date();
  const vacFrom  = data.settings.vacationFrom ? new Date(data.settings.vacationFrom) : null;
  const vacTo    = data.settings.vacationTo   ? new Date(data.settings.vacationTo + 'T23:59:59') : null;
  const onVacation = vacFrom && vacTo && nowDate >= vacFrom && nowDate <= vacTo;

  const HORIZON_MS = 90 * 24 * 3600000;
  const now     = Date.now();
  const horizon = now + HORIZON_MS;
  const events  = [];

  if (!onVacation) {
    for (const task of tasks) {
      const user = users.find(u => u.id === task.assignee);
      const room = rooms.find(r => r.id === (task.room || 'general'));
      const assigneeName = user ? user.name : task.assignee === 'alle' ? 'Alle' : task.assignee;
      const roomName     = room ? `${room.icon || ''} ${room.name}`.trim() : task.room;
      const description  = [roomName, assigneeName].filter(Boolean).join(' · ');

      if (task.dueDate) {
        const dueAt = getDueAt(task);
        if (task.lastCompleted && new Date(task.lastCompleted).getTime() >= dueAt) continue;
        if (dueAt >= now - 86400000 && dueAt <= horizon) {
          events.push(...makeEvent(task, dueAt, task.name, description, tz));
        }
        continue;
      }

      // Skip one-time tasks that somehow lack a dueDate — no valid interval to expand
      if (task.interval === 'once') continue;

      // Recurring: expand occurrences within the horizon
      const intervalMs = getIntervalMs(task);
      if (!intervalMs) continue; // guard against zero/NaN interval

      let occ = getDueAt(task);
      // Rewind to first occurrence at or after (now - 1 day) so we don't emit stale past events
      if (occ < now - 86400000) {
        const steps = Math.floor((now - 86400000 - occ) / intervalMs);
        occ += (steps + 1) * intervalMs;
      }
      let count = 0;
      while (occ <= horizon && count < 52) {
        events.push(...makeEvent(task, occ, task.name, description, tz));
        occ += intervalMs;
        count++;
      }
    }
  }

  const calLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Steward//Task Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Steward Tasks',
    'X-WR-CALDESC:Household tasks from Steward',
    `X-WR-TIMEZONE:${tz}`,
    ...events,
    'END:VCALENDAR',
  ].map(foldLine).join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="steward.ics"');
  res.send(calLines);
});

module.exports = router;

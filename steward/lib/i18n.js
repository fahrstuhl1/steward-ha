// Backend i18n for HA push notifications, action buttons and emails.
// Mirrors public/i18n.js but stays separate since the server has no DOM/locale.
const STRINGS = {
  en: {
    'notify.task_due_title':  '🏠 Task due',
    'notify.task_due_msg':    '"{name}" is{soon} due{time}',
    'notify.task_done_title': '✅ Task done',
    'notify.task_done_msg':   '{user} completed "{name}" ✓',
    'notify.new_task_title':  '🏠 New task',
    'notify.action_done':     '✓ Done',
    'notify.action_snooze':   '⏰ 2h Snooze',
    'notify.almost':          ' almost',
    'notify.at':              ' at {time}',
    'notify.test_subject':    'Test',
    'notify.test_email_body': 'Email is working! 🎉',
    'notify.test_ha_title':   '🏠 Steward Test',
    'notify.test_ha_body':    'HA push is working!',
    'notify.task_pending_title': '🏠 Reminder',
    'notify.task_pending_msg':   '⚠️ Still pending: "{name}"{time}',
    'notify.weekly_title':       '📋 Weekly Summary',
    'notify.weekly_one':         'Weekly summary: 1 task completed',
    'notify.weekly_many':        'Weekly summary: {count} tasks completed'
  },
  de: {
    'notify.task_due_title':  '🏠 Aufgabe fällig',
    'notify.task_due_msg':    '"{name}" ist{soon} fällig{time}',
    'notify.task_done_title': '✅ Aufgabe erledigt',
    'notify.task_done_msg':   '{user} hat "{name}" erledigt ✓',
    'notify.new_task_title':  '🏠 Neue Aufgabe',
    'notify.action_done':     '✓ Erledigt',
    'notify.action_snooze':   '⏰ 2 Std. später',
    'notify.almost':          ' bald',
    'notify.at':              ' um {time}',
    'notify.test_subject':    'Test',
    'notify.test_email_body': 'E-Mail funktioniert! 🎉',
    'notify.test_ha_title':   '🏠 Steward Test',
    'notify.test_ha_body':    'HA-Push funktioniert!',
    'notify.task_pending_title': '🏠 Erinnerung',
    'notify.task_pending_msg':   '⚠️ Noch offen: „{name}"{time}',
    'notify.weekly_title':       '📋 Wochenbericht',
    'notify.weekly_one':         '1 Aufgabe diese Woche erledigt',
    'notify.weekly_many':        '{count} Aufgaben diese Woche erledigt'
  }
};

function lang(data) {
  return STRINGS[data?.settings?.language] ? data.settings.language : 'en';
}

function t(language, key, vars = {}) {
  let str = (STRINGS[language] || STRINGS.en)[key] || STRINGS.en[key] || key;
  for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
  return str;
}

module.exports = { lang, t };

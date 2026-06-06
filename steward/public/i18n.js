/* Steward i18n — add new languages by extending I18N with the language code as key */
const I18N = {
  en: {
    'due.now': 'Due now', 'due.tomorrow': 'Tomorrow', 'due.today': 'Today',
    'due.in_days': 'In {days} days', 'due.done': 'Done', 'due.at': 'at',
    'state.waiting': 'Waiting',
    'interval.daily': 'Daily', 'interval.weekly': 'Weekly', 'interval.biweekly': 'Every 2 weeks',
    'interval.monthly': 'Monthly', 'interval.quarterly': 'Quarterly',
    'interval.once': '📅 Once', 'interval.custom': 'Every {days}d',
    'header.new': '＋ New', 'header.due_count': '{n} due', 'header.done_count': '{n} done',
    'theme.to_light': 'Light mode', 'theme.to_dark': 'Dark mode',
    'menu.search': 'Search', 'menu.calendar': 'Calendar', 'menu.planning': 'Planning',
    'menu.archive': 'Archive', 'menu.settings': 'Settings',
    'view.back': '← Tasks', 'view.planning_title': 'Next {days} days',
    'search.placeholder': 'Search tasks…',
    'pull.release': '↓ Release to refresh', 'pull.refreshing': '↑ Refreshing…',
    'undo.completed': '"{name}" completed', 'undo.btn': 'Undo',
    'tasks.show_future': 'Show future tasks', 'tasks.hide_future': 'Hide tasks', 'tasks.show_waiting_count': 'Show waiting ({n}) & future',
    'section.due_count': '{n} due',
    'empty.all_done': 'All tasks done ✓',
    'empty.no_planning': 'No tasks in the next {days} days 🎉',
    'empty.archive_loading': 'Loading archive…', 'empty.archive_empty': 'Archive is empty 📦',
    'empty.no_stats': 'No points yet 🏠', 'empty.no_completions': 'No completions yet',
    'archive.count': '{n} archived tasks',
    'snooze.hint': '⏰ Snoozed until {time}',
    'notify.hint_min': '({n}min before)', 'notify.hint_hour': '({n}h before)',
    'modal.new_task': 'New Task', 'modal.edit_task': 'Edit Task',
    'label.name': 'Name', 'label.room': 'Room', 'label.assigned_to': 'Assigned to',
    'label.type': 'Type', 'label.interval': 'Interval',
    'label.custom_days': 'Custom interval (days)', 'label.date': 'Date',
    'label.priority': 'Priority', 'label.schedule_mode': 'Schedule mode',
    'label.start_date': 'Start date', 'label.start_date_sub': 'first due date, optional',
    'label.time': 'Time', 'label.time_sub': 'optional', 'label.notify': 'Notify',
    'due_type.recurring': '🔁 Recurring', 'due_type.once': '📅 One-time',
    'chip.daily': 'Daily', 'chip.weekly': 'Weekly', 'chip.biweekly': '2 weeks',
    'chip.monthly': 'Monthly', 'chip.quarterly': 'Quarterly', 'chip.custom': 'Custom…',
    'priority.high': '🔴 High', 'priority.normal': '⚪ Normal', 'priority.low': '🔵 Low',
    'schedule.strict': 'Strict — next due date stays on track',
    'schedule.flexible': 'Flexible — interval starts from completion',
    'notify_offset.0': 'At due time', 'notify_offset.5': '5 minutes before',
    'notify_offset.15': '15 minutes before', 'notify_offset.30': '30 minutes before',
    'notify_offset.60': '1 hour before', 'notify_offset.120': '2 hours before',
    'notify_offset.1440': '1 day before',
    'more_options.show': 'More options', 'more_options.hide': 'Fewer options',
    'placeholder.task_name': 'e.g. Change bed linen', 'placeholder.custom_days': 'e.g. 10',
    'btn.cancel': 'Cancel', 'btn.save': 'Save', 'btn.close': 'Close', 'btn.skip': 'Skip',
    'comment.title': 'Task completed ✓',
    'label.completed_by': 'Completed by', 'label.comment': 'Comment', 'label.comment_sub': 'optional',
    'placeholder.comment': 'e.g. Only half done, fridge still missing…',
    'settings.title': 'Settings', 'settings.archive': 'Archive & Planning',
    'settings.gamif': 'Gamification', 'settings.members': 'Users', 'settings.rooms': 'Rooms',
    'settings.backup': 'Backup & Restore', 'settings.language': 'Language',
    'label.archive_days': 'Archive retention (days)', 'label.planning_days': 'Planning horizon (days)',
    'label.gamif': 'Enable points system',
    'desc.gamif': 'Points, leaderboard, achievements and streaks',
    'placeholder.room_name': 'Room name',
    'btn.export': '⬇ Export backup', 'btn.import': '⬆ Import backup',
    'stats.this_week': 'This week', 'stats.this_month': 'This month', 'stats.all_time': 'All time',
    'stats.tasks_done': '{n} tasks completed total', 'stats.streak': '🔥 {n}-day streak',
    'stats.points': 'points', 'stats.achievements': 'Achievements — {name}', 'stats.recent': 'Recent completions',
    'ach.first_task.title': 'First Task',    'ach.first_task.desc': 'First task completed',
    'ach.tasks_10.title': 'Diligent',        'ach.tasks_10.desc': '10 tasks completed',
    'ach.tasks_50.title': 'Persistent',      'ach.tasks_50.desc': '50 tasks completed',
    'ach.tasks_100.title': 'Household Pro',  'ach.tasks_100.desc': '100 tasks completed',
    'ach.streak_3.title': '3-Day Streak',    'ach.streak_3.desc': '3 consecutive days',
    'ach.streak_7.title': 'One Week',        'ach.streak_7.desc': '7-day streak',
    'ach.streak_30.title': 'Month Streak',   'ach.streak_30.desc': '30-day streak',
    'ach.points_100.title': '100 Points',    'ach.points_100.desc': '100 points collected',
    'ach.points_500.title': '500 Points',    'ach.points_500.desc': '500 points collected',
    'ach.points_1000.title': '1000 Points',  'ach.points_1000.desc': '1000 points collected',
    'ach.high_10.title': 'Priority Hunter',  'ach.high_10.desc': '10 high-priority tasks',
    'ach.speed_day.title': 'Turbo Day',      'ach.speed_day.desc': '5 tasks in one day',
    'ach.variety.title': 'Explorer',         'ach.variety.desc': 'Tasks in 5+ different rooms',
    'cal.days': ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    'confirm.delete_task': 'Delete task?',
    'confirm.import': 'Import this backup?\n\n{n} tasks found.\n\nThis will replace all current tasks.',
    'alert.no_name': 'Please enter a name.',
    'alert.invalid_json': 'Invalid JSON file.',
    'alert.import_failed': 'Import failed: {error}',
    'alert.import_success': 'Import successful — {tasks} tasks and {completions} completions restored.',
    'tab.all': 'All',
  },

  de: {
    'due.now': 'Jetzt fällig', 'due.tomorrow': 'Morgen', 'due.today': 'Heute',
    'due.in_days': 'In {days} Tagen', 'due.done': 'Erledigt', 'due.at': 'um',
    'state.waiting': 'Wartend',
    'interval.daily': 'Täglich', 'interval.weekly': 'Wöchentlich', 'interval.biweekly': 'Alle 2 Wochen',
    'interval.monthly': 'Monatlich', 'interval.quarterly': 'Vierteljährlich',
    'interval.once': '📅 Einmalig', 'interval.custom': 'Alle {days} Tage',
    'header.new': '＋ Neu', 'header.due_count': '{n} fällig', 'header.done_count': '{n} erledigt',
    'theme.to_light': 'Helles Design', 'theme.to_dark': 'Dunkles Design',
    'menu.search': 'Suche', 'menu.calendar': 'Kalender', 'menu.planning': 'Planung',
    'menu.archive': 'Archiv', 'menu.settings': 'Einstellungen',
    'view.back': '← Aufgaben', 'view.planning_title': 'Nächste {days} Tage',
    'search.placeholder': 'Aufgaben suchen…',
    'pull.release': '↓ Loslassen zum Aktualisieren', 'pull.refreshing': '↑ Aktualisiere…',
    'undo.completed': '"{name}" erledigt', 'undo.btn': 'Rückgängig',
    'tasks.show_future': 'Zukünftige anzeigen', 'tasks.hide_future': 'Ausblenden', 'tasks.show_waiting_count': 'Wartend ({n}) & Zukünftige anzeigen',
    'section.due_count': '{n} fällig',
    'empty.all_done': 'Alle Aufgaben erledigt ✓',
    'empty.no_planning': 'Keine Aufgaben in den nächsten {days} Tagen 🎉',
    'empty.archive_loading': 'Lade Archiv…', 'empty.archive_empty': 'Archiv ist leer 📦',
    'empty.no_stats': 'Noch keine Punkte 🏠', 'empty.no_completions': 'Noch keine Erledigungen',
    'archive.count': '{n} archivierte Aufgaben',
    'snooze.hint': '⏰ Später erinnert um {time}',
    'notify.hint_min': '({n} Min. vorher)', 'notify.hint_hour': '({n}h vorher)',
    'modal.new_task': 'Neue Aufgabe', 'modal.edit_task': 'Aufgabe bearbeiten',
    'label.name': 'Name', 'label.room': 'Raum', 'label.assigned_to': 'Zugewiesen an',
    'label.type': 'Typ', 'label.interval': 'Intervall',
    'label.custom_days': 'Eigenes Intervall (Tage)', 'label.date': 'Datum',
    'label.priority': 'Priorität', 'label.schedule_mode': 'Wiederholung',
    'label.start_date': 'Startdatum', 'label.start_date_sub': 'erster Fälligkeitstermin, optional',
    'label.time': 'Uhrzeit', 'label.time_sub': 'optional', 'label.notify': 'Erinnern',
    'due_type.recurring': '🔁 Wiederkehrend', 'due_type.once': '📅 Einmalig',
    'chip.daily': 'Täglich', 'chip.weekly': 'Wöchentlich', 'chip.biweekly': '2 Wochen',
    'chip.monthly': 'Monatlich', 'chip.quarterly': 'Vierteljährlich', 'chip.custom': 'Eigenes…',
    'priority.high': '🔴 Hoch', 'priority.normal': '⚪ Normal', 'priority.low': '🔵 Niedrig',
    'schedule.strict': 'Fest — nächstes Datum bleibt im Takt',
    'schedule.flexible': 'Flexibel — Intervall startet ab Erledigung',
    'notify_offset.0': 'Zum Fälligkeitstermin', 'notify_offset.5': '5 Minuten vorher',
    'notify_offset.15': '15 Minuten vorher', 'notify_offset.30': '30 Minuten vorher',
    'notify_offset.60': '1 Stunde vorher', 'notify_offset.120': '2 Stunden vorher',
    'notify_offset.1440': '1 Tag vorher',
    'more_options.show': 'Weitere Optionen', 'more_options.hide': 'Weniger Optionen',
    'placeholder.task_name': 'z.B. Bettwäsche wechseln', 'placeholder.custom_days': 'z.B. 10',
    'btn.cancel': 'Abbrechen', 'btn.save': 'Speichern', 'btn.close': 'Schließen', 'btn.skip': 'Überspringen',
    'comment.title': 'Aufgabe erledigt ✓',
    'label.completed_by': 'Erledigt von', 'label.comment': 'Kommentar', 'label.comment_sub': 'optional',
    'placeholder.comment': 'z.B. Nur halb fertig, Kühlschrank fehlt noch…',
    'settings.title': 'Einstellungen', 'settings.archive': 'Archiv & Planung',
    'settings.gamif': 'Gamification', 'settings.members': 'Benutzer', 'settings.rooms': 'Räume',
    'settings.backup': 'Backup & Wiederherstellung', 'settings.language': 'Sprache',
    'label.archive_days': 'Archivdauer (Tage)', 'label.planning_days': 'Planungszeitraum (Tage)',
    'label.gamif': 'Punktesystem aktivieren',
    'desc.gamif': 'Punkte, Rangliste, Erfolge und Serien',
    'placeholder.room_name': 'Raumname',
    'btn.export': '⬇ Backup exportieren', 'btn.import': '⬆ Backup importieren',
    'stats.this_week': 'Diese Woche', 'stats.this_month': 'Diesen Monat', 'stats.all_time': 'Gesamt',
    'stats.tasks_done': '{n} Aufgaben erledigt', 'stats.streak': '🔥 {n}-Tage-Serie',
    'stats.points': 'Punkte', 'stats.achievements': 'Erfolge — {name}', 'stats.recent': 'Zuletzt erledigt',
    'ach.first_task.title': 'Erste Aufgabe',    'ach.first_task.desc': 'Erste Aufgabe erledigt',
    'ach.tasks_10.title': 'Fleißig',            'ach.tasks_10.desc': '10 Aufgaben erledigt',
    'ach.tasks_50.title': 'Beharrlich',         'ach.tasks_50.desc': '50 Aufgaben erledigt',
    'ach.tasks_100.title': 'Haushaltspro',      'ach.tasks_100.desc': '100 Aufgaben erledigt',
    'ach.streak_3.title': '3-Tage-Serie',       'ach.streak_3.desc': '3 Tage in Folge',
    'ach.streak_7.title': 'Eine Woche',         'ach.streak_7.desc': '7-Tage-Serie',
    'ach.streak_30.title': 'Monats-Serie',      'ach.streak_30.desc': '30-Tage-Serie',
    'ach.points_100.title': '100 Punkte',       'ach.points_100.desc': '100 Punkte gesammelt',
    'ach.points_500.title': '500 Punkte',       'ach.points_500.desc': '500 Punkte gesammelt',
    'ach.points_1000.title': '1000 Punkte',     'ach.points_1000.desc': '1000 Punkte gesammelt',
    'ach.high_10.title': 'Prioritätenjäger',    'ach.high_10.desc': '10 Aufgaben mit hoher Priorität',
    'ach.speed_day.title': 'Turbotag',          'ach.speed_day.desc': '5 Aufgaben an einem Tag',
    'ach.variety.title': 'Entdecker',           'ach.variety.desc': 'Aufgaben in 5+ verschiedenen Räumen',
    'cal.days': ['Mo','Di','Mi','Do','Fr','Sa','So'],
    'confirm.delete_task': 'Aufgabe löschen?',
    'confirm.import': 'Dieses Backup importieren?\n\n{n} Aufgaben gefunden.\n\nDies ersetzt alle aktuellen Aufgaben.',
    'alert.no_name': 'Bitte einen Namen eingeben.',
    'alert.invalid_json': 'Ungültige JSON-Datei.',
    'alert.import_failed': 'Import fehlgeschlagen: {error}',
    'alert.import_success': 'Import erfolgreich — {tasks} Aufgaben und {completions} Erledigungen wiederhergestellt.',
    'tab.all': 'Alle',
  },
};

let _lang = 'en';

function L(key, vars) {
  const dict = I18N[_lang] || I18N.en;
  let str = key in dict ? dict[key] : (key in I18N.en ? I18N.en[key] : key);
  if (vars && typeof str === 'string') {
    Object.keys(vars).forEach(k => { str = str.split('{' + k + '}').join(String(vars[k])); });
  }
  return str;
}

function setLang(lang) {
  _lang = I18N[lang] ? lang : 'en';
  document.documentElement.lang = _lang;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = L(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = L(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = L(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = L(el.dataset.i18nTitle);
  });
}

function browserLang() {
  return (navigator.language || '').startsWith('de') ? 'de' : 'en';
}

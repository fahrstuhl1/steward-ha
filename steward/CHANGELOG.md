# Changelog

## 1.6.2
### Improvements
- **UI-Lesbarkeit**: Person-Tabs als Pills statt Full-Width-Balken; Tab-Zeile bei Single-User ohne Gamification ausgeblendet
- **Raumfilter**: Aktiver Tab jetzt mit blauem Akzent statt neutralem Grau
- **„Wartend anzeigen"-Button**: Mehr Padding, sichtbarer Hintergrund und Border, blauer Hover-Effekt
- **Section-Header**: Etwas fetter und heller (text2 statt text3)
- **Task-Schrift**: 0.88 → 0.93 rem für bessere Lesbarkeit
- **Badges und Meta-Text**: Leicht vergrößert (+0.02 rem, +1px Padding)
- **Wartend-Platzhalter**: Kursiv entfernt

---

## 1.6.1
### Bug Fixes
- **NLP Quick-Add**: Einmalige Aufgaben (Datum erkannt) wurden mit `interval:'weekly'` statt `interval:'once'` gespeichert
- **NLP-Tags**: Inline `border-color` hatte keinen Effekt — `.nlp-tag` hatte kein `border`-Basisstyle; auf `border: 1.5px solid transparent` gesetzt
- **NLP-Parser**: Nutzer- und Rausnamen wurden ohne Escaping als RegExp-Muster verwendet — `esc()`-Helper ergänzt (verhindert ReDoS bei Sonderzeichen in Namen)
- **Wöchentliche Zusammenfassung**: `data.settings.notifications?.ha` war immer `undefined` (falsy) — fix auf `user.haService` für HA-Push je Nutzer
- **`showNotification`**: Funktion wurde aufgerufen, aber nie definiert — Auto-Dismiss-Toast hinzugefügt
- **`/api/sync-timezone`**: Route fehlte komplett — `fetchHaConfig` in `ha.js` ergänzt und Route in `settings.js` registriert
- **HA-Sensoren im Urlaub**: `updateHaSensors` ignorierte Urlaubsmodus — Sensoren zeigten weiterhin Live-Zählungen; Urlaubs-Guard ergänzt (alle Sensoren auf 0 während Urlaub)
- **HA-Trigger Einmalaufgaben**: `checkHaTriggers` erstellte Aufgaben mit `interval:'once'` und `dueDate:null` — Aufgaben wurden nach Erledigung nicht archiviert sondern neu eingeplant; `dueDate: todayStr` ergänzt
- **Abschluss-Animation**: `checkPulse` CSS-Animation-Klasse wurde im JS nie gesetzt und wäre durch DOM-Re-Render verloren gegangen — durch body-level `spawnPulseRing(x, y)` ersetzt
- **Urlaubsbanner**: `#vacationBannerSub` wurde nie befüllt — Banner zeigte kein Enddatum; `X-Vacation-To` Header ausgelesen und in `render()` eingetragen
- **`···`-Button Touch-Target**: Schaltfläche war ~18 px groß (Apple HIG-Minimum 44 px verfehlt) — auf `padding: 8px 10px; min-height: 36px` vergrößert
- **Benachrichtigungskanal-Label**: "Notification channel" war hart auf Englisch kodiert — i18n-Keys `label.notify_channel`, `desc.notify_ha`, `desc.notify_email` ergänzt
- **NLP-Eingabe**: Browser-Autocomplete und Autokorrektur im NLP-Eingabefeld wurden nicht unterdrückt — `autocomplete="off" autocorrect="off" spellcheck="false"` hinzugefügt

---

## 1.6.0
### Features
- **Touch-Target & Haptic**: Haken-Button auf 36 × 36 px vergrößert (bessere Treffbarkeit); Vibration beim Abschluss (`[50, 30, 50]` ms Pattern)
- **Abschluss-Animation**: Konfetti-Partikel und Pulsring erscheinen an der Position des Haken-Buttons wenn eine Aufgabe erledigt wird
- **Long-Press Kontext-Menü**: 500 ms Drücken auf den Info-Bereich einer Kachel öffnet das Kontext-Menü — gleicher Inhalt wie `···`-Button, Vibration als Feedback
- **Verbesserter Empty State**: Leere Aufgabenliste zeigt Icon, Titel und motivierenden Untertitel statt reinem Text
- **Foto bei Abschluss**: Im Kommentar-Modal kann ein Foto aufgenommen oder aus der Galerie gewählt werden; wird komprimiert (240 × 240 px, JPEG 65 %) und in der Abschluss-Historie gespeichert
- **Natürliche Sprache (Quick Add)**: `✨`-Button im Header öffnet ein Modal mit Freitexteingabe; Stichwörter für Intervall, Datum, Nutzer und Raum werden automatisch erkannt und als Tags angezeigt
- **Wöchentliche Zusammenfassung**: Optionaler Cron-Job jeden Montag 07:00 UTC sendet eine Zusammenfassung der erledigten Aufgaben der letzten Woche via HA-Push und/oder E-Mail; Ein/Aus per Einstellungs-Toggle
- **Urlaubs-Modus**: Zeitraum (Von / Bis) in den Einstellungen hinterlegen; während des Urlaubs werden Aufgaben nicht als fällig markiert, Benachrichtigungen werden pausiert und ein Banner am oberen Bildschirmrand wird eingeblendet

---

## 1.5.1
### Bug Fixes
- **Edit-Modal**: "Weitere Optionen" wurde beim Öffnen nicht zurückgesetzt — blieb im zuletzt hinterlassenen Zustand; wird nun immer eingeklappt geöffnet
- **Neu-Modal**: Wochentag- und Wochenend-Benachrichtigungszeiten wurden beim Öffnen nicht geleert
- **i18n**: Toter Key `confirm.delete_task` entfernt (Löschen nutzt seit 1.5.0 einen Undo-Toast statt `window.confirm`)

---

## 1.5.0
### Features
- **Drag-to-dismiss**: Modal-Handle ist jetzt funktional — nach unten wischen schließt Task-, Einstellungs- und Kommentar-Modal
- **Kontext-Menü**: Kacheln haben jetzt einen `···`-Button der ein Kontext-Menü öffnet (Bearbeiten, Zurückstellen, Termin überspringen, Duplizieren, Löschen) — kein visuelles Chaos mit 5 Buttons pro Kachel mehr
- **Undo für Löschen**: Löschen zeigt einen 5-Sekunden-Toast mit "Rückgängig"-Option statt sofort irreversibel zu löschen
- **Einstellungen mit Tabs**: Einstellungs-Modal in 4 Tabs aufgeteilt (Allgemein / Nutzer & Räume / HA / Backup) statt einem langen Scroll
- **Ladeindikator**: Speicher-Buttons (Aufgabe, Einstellungen) werden während des Speicherns deaktiviert und zeigen `…`; Haken-Button auf der Kachel wird während des Abschlusses deaktiviert; Zurückstellen/Überspringen sind gegen Doppel-Aufrufe abgesichert

---

## 1.4.3
### Improvements
- **Tap-to-edit**: Tippen auf den Aufgaben-Namen/-Info-Bereich öffnet direkt den Bearbeitungsmodus
- **Bearbeitungsmodal**: "Weitere Optionen" ist standardmäßig eingeklappt — saubere Ansicht beim Öffnen, bei Bedarf manuell erweiterbar

---

## 1.4.2
### Bug Fixes
- **Skip-Route**: `getScheduledDueAt` durch `getDueAt` ersetzt — aufeinanderfolgende Skips ohne zwischenzeitliche Erledigung rückten die Aufgabe nicht weiter vor (blieben beim ersten Skip-Datum stecken)
- **HA-Raum-Sensor**: Icon-Ternär war invertiert (`room.icon ? '' : 'mdi:door'` → `room.icon || 'mdi:door'`) — konfigurierte Icons wurden verworfen, ikonlose Räume korrekt
- **Lovelace-Karte**: XSS-Lücke — `title` aus der Karten-Konfiguration wurde ohne Escaping in `innerHTML` eingefügt; `_esc()` wird nun angewendet
- **Wochentag-Erkennung**: `new Date().getDay()` nutzte System-Timezone des Servers; `Intl.DateTimeFormat` mit konfigurierter App-Timezone wird nun für die Wochenend-Erkennung verwendet
- **Raum nur wartend**: Räume mit ausschließlich wartenden Aufgaben wurden bei `showDone=false` vollständig aus dem DOM entfernt, obwohl der Button sie im Zähler führte; Räume bleiben nun sichtbar mit einem Hinweis-Text
- **Legacy-Aufgaben**: `task.notifications?.ha` mit Optional-Chaining abgesichert — fehlende `notifications`-Felder (ältere Backups) führten zu `TypeError` beim Öffnen des Bearbeiten-Modals

---

## 1.4.1
### Improvements
- **HA sensor attributes**: `sensor.steward_due`, `sensor.steward_due_soon`, and all user sensors now carry a `tasks` attribute (name, room, assignee, priority, due) — usable in markdown cards, template conditions and automations without a custom card
- **Per-room sensors**: `sensor.steward_<room-id>_due` created automatically for every configured room

---

## 1.4.0
### Features
- **Duplicate task**: Copy button (⧉) on every task card opens the edit modal pre-filled — save creates a new task
- **Skip occurrence**: Skip button (⏩) on recurring tasks advances to the next scheduled occurrence without recording a completion or awarding points
- **Weekday-specific notification time**: Optional Mo–Fr and Sa–So time fields in "More options" — overrides the standard notify offset for that day type (e.g. notify at 08:00 on weekdays, 10:00 on weekends)
- **Lovelace card** (`steward-card.js`): Custom HA dashboard card showing due tasks; filterable by person/room — load via HA resource manager

### Improvements
- Settings: Timezone moved to its own row — no more cramped three-column layout

---

## 1.3.1
### Improvements
- **Waiting tasks hidden by default**: Completed recurring tasks no longer clutter the overview. They are now grouped with future tasks and revealed via the existing toggle button.
- Toggle button label dynamically shows the count of hidden waiting tasks, e.g. "Show waiting (5) & future" / "Wartend (5) & Zukünftige anzeigen"

---

## 1.3.0
### Features
- **Language support (EN/DE)**: Added full English/German translation system (`i18n.js`)
- Language toggle accessible via the 🌐 button in the hamburger menu; choice persists in localStorage
- Browser language auto-detected on first load (German browser → DE, everything else → EN)
- All UI strings translated: task cards, modals, settings, stats, achievements, intervals, confirmations
- Backend added `nextDueSerialized()` — structured due-date data for locale-aware date display in frontend

---

## 1.2.0
### Features
- **Timezone support**: Automatically fetch timezone from Home Assistant or manually configure
- Notifications and task schedules now respect user's timezone (fixes off-by-one issues in UTC± regions)
- New `/api/sync-timezone` endpoint to fetch timezone from HA
- Settings UI: timezone selector with common timezones and sync button

### Bug Fixes
- Prevent duplicate notifications from setTimeout/cron race condition

---

## 1.1.0
### Improvements
- Task modal: progressive disclosure — only name, room, assignee, type and interval visible by default
- Due type selector replaced with two-button toggle (🔁 Recurring / 📅 One-time)
- Interval dropdown replaced with horizontal chip selection
- Priority, schedule mode, time and notifications moved behind "More options" toggle
- Edit modal opens with all fields expanded automatically
---

## 1.0.1
### Improvements
- add :active scale feedback to cards, buttons and check-btn
- increase task-card padding and line-height for better readability

---

## 1.0 (Steward)
- **Release:** First official release under the name **Steward**.
- **Note:** This project is the direct continuation of "Haushaltsplan". Existing users, please refer to the installation instructions in the README regarding the name/slug change.
- Includes all proven features, stability improvements, and the entire feature set from the project's history.

---

## Legacy History (Haushaltsplan 1.0.0 - 1.11.0)

## 1.11.0
### Notes
- Browser Push notifications removed entirely — HA push via Companion App covers this use case fully.
### Improvements
- Removed `web-push` dependency from package.json.
- Removed VAPID key generation and storage.
- Removed push subscription management from Settings.
- Removed push-related API endpoints (`/api/vapid-public-key`, `/api/push-status`, `/api/push-subscribe`, `/api/test-push`).
- Notification guards now only check `ha` and `email` channels.

## 1.10.9
### Fixes
- Import and export fetch URLs had a leading `/` — broke under HA Ingress/nabu.casa (404).

## 1.10.8
### Fixes
- Import silently failed for large backup files — raised Express JSON body limit to 20mb.
- Import errors now show a proper error message instead of failing silently.

## 1.10.7
### Features
- New: **Backup & Restore** — export all data (tasks, settings, users, rooms, triggers, completions, archive) as a JSON file and import it into any Steward instance.
- Export available via Settings → Backup & Restore → Export backup.
- Import replaces all current data, runs migration automatically and restores all timers and sensors.

## 1.10.6
### Notes
- App renamed from **Haushaltsplan** to **Steward**.
- Add-on slug changed from `haushaltsplan` to `steward` — requires reinstall in HA.
- HA sensor entity IDs changed: `sensor.haushaltsplan_*` → `sensor.steward_*` — update any existing automations.
### Improvements
- Sensor entity IDs and friendly names updated to English (`sensor.steward_due`, `sensor.steward_due_soon`, `sensor.steward_<user>_due`).
- Email sender name and subject updated to Steward.
- Sidebar icon changed to `mdi:clipboard-list`.

---

## 1.10.5

### Features
- Recurring tasks now show a distinct **Waiting** state after completion — hourglass (⏳) icon and "Waiting · in X days" label instead of the green checkmark / strikethrough style
- Waiting tasks are always visible; the show/hide toggle now only affects future tasks that have never been completed

### Frontend
- New `.task-card.waiting` CSS class with neutral left border and adjusted opacity
- Check button shows ⏳ for waiting tasks, remains clickable to undo completion
- Toggle button label changed to "Show future tasks" / "Hide future tasks"
- Interval and snooze labels translated to English for consistency

---

## 1.10.4

### Fixes
- Notification action buttons (✓ Done / ⏰ Snooze) used URI type — Safari was opened without HA session, causing 404 on nabu.casa setups

### Features
- Add-on now subscribes to HA's SSE event stream and handles `HPLAN_COMPLETE_*` / `HPLAN_SNOOZE_*` actions internally — no addonUrl required, works with nabu.casa out of the box

### Improvements
- Event subscription auto-reconnects with exponential backoff (10s → 5min max) on HA restart or network loss
- Event subscription restarts automatically when HA settings (URL / token) are saved

---

## 1.10.3

### Fixes
- `pushStatusList` element missing from settings modal — push subscriptions could not be managed via UI
- `openEditModal` overwrote interval select twice — custom interval was lost when editing a task
- Points credited to `alle` when both view and task assignee were `alle` — now falls back to first user
- `quick-complete` endpoint ignored gamification toggle — completions were always recorded
- Selected calendar day used `today` CSS class instead of a distinct `selected` class
- Header badge counted all non-urgent tasks as "done" instead of only completed ones
- Removed unused `changed` variable in `saveSettings`
- Trigger- and webhook-created tasks were missing fields (`snoozedUntil`, `scheduleMode`, `priority`, `createdAt`, `nextDueAt`)
- `test-ha` endpoint always returned success regardless of HA response status code
- `migrateData` fallback contained hardcoded user names — replaced with neutral generics

---

## 1.10.2

### Fixes
- Snooze button returned 404 (missing leading `/` in fetch URL)
- Removed personal names from README and setup guide

---

## 1.10.1

### Frontend
- Header overflow on mobile — all secondary actions moved into a hamburger menu (☰) with labels
- Only ➕ New stays always visible in the header

---

## 1.10.0

### Features
- 📦 Archive view — completed one-time tasks are automatically archived, viewable for up to 180 days (configurable)
- 📋 Weekly planning view — shows all non-daily tasks due in the next N days, grouped by day (configurable, default 7)
- "All" tab hidden when only one user is configured
- Single-user setups automatically show that user's view on load

### Improvements
- Archive retention (days) and planning horizon (days) configurable in Settings

---

## 1.9.2

### Fixes
- `migrateData`, `applyHaOptions` and VAPID init now use atomic write (previously bypassed write queue)
- `reset` endpoint now awaits `writeData` before calling `fireNotification` (prevented stale read)
- `setTimeout` overflow for monthly/quarterly tasks (>24.8 days) — cron fallback used instead
- `fetchHaStates` now has a 10s timeout to prevent indefinite hangs on HA unavailability
- `checkHaTriggers` only writes to disk when state actually changes (was writing every minute)
- Streak calculation uses local date instead of UTC (prevented off-by-one in UTC+ timezones)

---

## 1.9.1

### Fixes
- Light mode — header now adapts to light background, improved contrast for badges, buttons and text

---

## 1.9.0

### Features
- Light/dark mode toggle (☀️/🌙 button in header), preference saved persistently
- Undo toast — 5-second window to undo completing a task
- Swipe gestures — swipe right to complete, swipe left to snooze (mobile)
- Pull-to-refresh — drag down from top to reload tasks (mobile)

### Fixes
- Atomic writes — data.json now written via temp file + rename, preventing corruption on crash
- Write queue — concurrent writes (cron + API) are now serialized, no more race conditions
- Completions capped at 2000 entries to prevent unbounded data.json growth

---

## 1.8.0

### Features
- 📅 Calendar view — monthly overview of all due dates, tap a day to see tasks
- 🔍 Real-time search — filter tasks by name or room
- 🏆 Achievements — 12 badges (streaks, points, volume, turbo day, explorer…)
- Gamification toggle in settings — points, leaderboard and achievements are optional

---

## 1.7.5

### Fixes
- Immediately due tasks no longer wait up to 15 minutes for the first notification

---

## 1.7.4

### Fixes
- Task edit/add modal broken due to orphaned `notifPush` JS reference

---

## 1.7.3

### Fixes
- Edit/delete buttons not reachable on touch devices (HA app) — now always visible

---

## 1.7.2

### Features
- "Completed by" selector in completion modal — tasks can be checked off on behalf of another person
- Points are awarded to the person who actually completed the task

---

## 1.7.1

### Features
- Custom interval — enter any number of days (e.g. every 10 days)

### Fixes
- Tasks completed before their due time no longer reappear as due after the due time passes
- `nextDueAt` is now explicitly stored on completion (current due time + interval)

### Notes
- Removed browser push notifications (replaced by HA push)

---

## 1.7.0

### Features
- Strict schedule (default) — next due date stays on track regardless of when completed
- Flexible rhythm (optional) — interval starts from actual completion time
- Repeat notification — sends another reminder after 24h if task is still not done

### Fixes
- Snooze correctly suppresses repeat notifications

---

## 1.6.0

### Features
- Points system — High=3, Normal=2, Low=1 point per completed task
- 🏆 Leaderboard tab with week/month/all-time view and streak display
- Points badge per user in header (current week points)
- Last 30 completions log with timestamp, user, points and comment
- All completions stored with timestamp in data.json

---

## 1.5.0

### Features
- Priorities (High/Normal/Low) — list sorted by priority, then due date
- Snooze — postpone task via in-app button or notification action button for 2h
- HA sensor entities — updated every 5 min
- Notification action buttons — "✓ Done" and "⏰ 2h Snooze" directly in HA push notification
- Comment on completion — optional popup, comment shown on task card
- Addon URL setting for external reachability of notification buttons (Nabu Casa etc.)

---

## 1.4.2

### Fixes
- "Soon due" tasks incorrectly displayed as completed
- Tapping checkmark on a "soon due" task triggered reset instead of complete

---

## 1.4.1

### Features
- HA configuration tab — HA URL, token and webhook secret configurable directly in HA
- Values from `/data/options.json` are automatically applied to app settings on startup

---

## 1.4.0

### Features
- HA trigger system — entity state changes automatically create tasks
- Load entities from HA with autocomplete
- Triggers configurable with task name, room, assignee, time and notifications
- Triggers check HA states every minute, fire only on state change

---

## 1.3.1

### Fixes
- Tasks of deleted users are automatically reassigned to "All"

---

## 1.3.0

### Features
- Dynamic users — unlimited users with name, email, HA service and color
- Import users from HA `person.*` entities
- Start date for recurring tasks (first due date freely selectable)
- User tabs in header dynamic and colored per user

### Improvements
- Existing data automatically migrated

---

## 1.2.1

### Fixes
- Merge conflict in config.yaml resolved

---

## 1.2.0

### Features
- Webhook endpoint `POST /api/webhook/create-task` for HA automations
- Optional secret protection for webhook via `settings.webhookSecret`

---

## 1.1.1

### Features
- "Due soon" — tasks due within ≤12h shown in yellow
- Color logic: red (overdue) → yellow (≤12h) → orange (tomorrow) → grey (later)

### Fixes
- Tasks with `dueTime` shown as immediately due even before the due time

---

## 1.1.0

### Features
- Fixed date for one-time tasks
- Due time (e.g. feed animals daily at 08:00)
- Configurable notification offset (e.g. 30 minutes before)

### Fixes
- HA notification 400 error — `notify.` prefix automatically stripped
- HA error response body now logged

---

## 1.0.5

### Improvements
- App icon added

---

## 1.0.4

### Fixes
- `run.sh` switched to plain `/bin/sh` (no bashio/with-contenv)
- `services.d` directory explicitly created

---

## 1.0.3

### Fixes
- s6-overlay service registration corrected
- Dockerfile CMD removed, HA init system now takes over correctly

---

## 1.0.2

### Fixes
- Fallback base image added to Dockerfile

---

## 1.0.1

### Fixes
- `build.yaml` with base images for aarch64/amd64 added
- Outdated architecture values removed from config.yaml

---

## 1.0.0

### Notes
- Initial release
- Task management with rooms, intervals and persons
- Notifications via Home Assistant Companion App and email
- Dark minimalist design
- Collapsible room groups
- HA Ingress integration

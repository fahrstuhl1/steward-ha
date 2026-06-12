# Changelog

## 1.6.20
### Improvements
- **Refreshed task card design**: Task cards now have a softer, rounded look with a colored accent bar indicating due status, more depth via hover shadows, and a chip-style "Due now" / "Due soon" label
- **Avatars on task cards**: Each task now shows a small colored initial avatar for the assigned person instead of a plain dot
- **Priority flags**: High and low priority tasks are now marked with 🔺 / 🔻 flags instead of colored dots
- **Smoother completion animation**: Completing a task now plays a collapse animation before the list refreshes, in addition to the existing confetti/pulse effect

## 1.6.19
### Fixes
- **Completions are now recorded for the History view even when Gamification is disabled**: completions used to be written to `data.completions` only while the points/leaderboard system was enabled, so the new completion History view (1.6.18) stayed empty for households that turned Gamification off. Recording is now decoupled from that toggle — points are still computed and stored in the background but the leaderboard UI remains hidden as before

## 1.6.18
### New Features
- **Completion history for recurring tasks**: New "History" entry in a task's "···" menu opens a modal listing all of its past completions (date, person, comment and photo) — previously this data was captured on every completion (`data.completions`) but had no UI for recurring tasks; only one-time tasks exposed it via the Archive

## 1.6.17
### Fixes
- **Add-on now exposes its web UI/API via a host port**: `config.yaml` now declares a port (default: 3456 → internal 3000) including a description, so Home Assistant shows the Network/port-mapping section in the add-on settings. This makes the access method documented in the README — `http://<ha-ip>:3456` (Lovelace card, sensors, webhook) — actually work; previously the add-on was reachable only via Ingress and the documented port was unreachable
- README updated: noted that the host port is configurable under the add-on's **Network** settings

## 1.6.16
### Fixes
- **Push notifications and action buttons now localized**: Titles, texts and action buttons (e.g. „✓ Done" / „⏰ 2h Snooze") of HA push notifications and emails now follow the language selected in the app (German/English) instead of being hardcoded to English — affects due-task reminders, notifications about completions by others, new tasks created from HA triggers, and the test notifications in settings
- The language selection is now also stored server-side (`Settings`), so the background service knows which language to use when sending notifications

## 1.6.15
### Improvements
- **New snooze dialog**: Instead of immediately giving the task a fixed 2-hour snooze, "Snooze" now opens a pop-up where the duration can be freely chosen in minutes, hours or days (including quick-select chips like "15 min", "1 hour", "1 day", "3 days")
- **Cancel snooze**: The same pop-up shows a "Snoozed until …" hint with the current status and offers a toggle to cancel the snooze directly — also reachable via the ⏰ hint on the task card
- **Snoozed tasks now actually disappear from the due list**: `isDue`/`isSoon` now take `snoozedUntil` into account — a task snoozed for a day no longer shows up in the overview, in the "···" menu as a "Snooze" option, or with a red/yellow status badge during that time, and reappears automatically once the snooze expires

## 1.6.14
### Improvements
- **NLP Quick-Add: more natural phrasings recognized**: The parser now understands significantly more everyday phrasings, including:
  - Conversational lead-ins like „I want to …" / „I'd like to …" / „Ich möchte …" are stripped before analysis
  - Relative day references „today" / „tomorrow" / „the day after tomorrow" / „heute" / „morgen" / „übermorgen" automatically set the matching due date as a one-time task (e.g. „I want to mop the bathroom tomorrow")
  - Weekday repetitions „every Friday", „on Mondays" etc. set a weekly interval starting on the next matching weekday
  - Times („at 5pm", „17:00", „5 o'clock") are recognized and adopted as the due time (e.g. „I want to wash the bathroom every Friday at 5pm")
  - „every day" / „every morning" / „every evening" / „jeden Tag" / „jeden Morgen" / „jeden Abend" are recognized as a daily interval
  - Name recognition for people/rooms now uses word boundaries, so e.g. a room called "Bath" no longer accidentally matches inside "Bathroom"

### Fixes
- **NLP: „the day after tomorrow …" was never recognized**: The word-boundary pattern (`\b`) didn't treat the non-ASCII initial letter „Ü" as a word character, so „übermorgen" never matched — now fixed with a Unicode-aware word boundary
- **NLP: „every morning" was incorrectly interpreted as „tomorrow"**: „air out the kitchen every morning" was recognized as „due tomorrow" instead of a recurring task — a new exclusion rule now distinguishes „every morning" (= daily) from „tomorrow" (= relative date)

## 1.6.13
### Fixes
- **NLP Quick-Add: „every other day" / „every N days"**: The parser didn't recognize phrasings like „every other day", „every 3 days" or „jeden zweiten Tag" / „alle 3 Tage" and fell back to the default "Weekly" interval — these are now correctly recognized as a custom interval (e.g. "Every 2 days")

---

## 1.6.12
### Improvements
- **Vacation mode activation**: The date range (from/to) is now only editable once vacation mode is enabled via the new toggle — prevents vacation mode from becoming active by accident due to dates that were already set

### Fixes
- **Wrong/missing time in due display**: The displayed time was derived from the `dueTime` field instead of the actually computed due timestamp — after changes to interval, time or schedule mode, the display (e.g. "Today" without a time) could diverge from the real due time
- **Duplicate due notifications**: The timer-based notifier and the 15-minute cron fallback could fire at the same time and both send a push notification for the same task — a new in-memory lock now prevents simultaneous sending
- **Wrong time in due notifications**: Push/email texts ("… is due at HH:MM") were also built from the static `dueTime` field instead of the actually computed due timestamp — affected the timer-based notifier as well as the cron fallback (initial and repeat reminders)
- **Cron fallback ignored the configured timezone**: The 15-minute fallback determined the notification time for `notifyTimeWeekday`/`notifyTimeWeekend` based on the server's timezone instead of the timezone configured in settings — could pick the wrong day type (weekday/weekend) near the day-change boundary

---

## 1.6.8
### New Features
- **Sub-tasks / checklists**: Tasks can now have a checklist of individual steps (in the "more options" area of the task dialog); progress is shown on the task card and individual steps can be checked off directly there
- **Notification on completion by others**: Optionally (on by default), all other household members are notified via push/email when someone completes a task — can be disabled in settings
- **Configurable repeat reminder**: The interval for repeated "still pending" reminders is now configurable in settings (still defaults to 24h) instead of hardcoded
- **Photo in archive**: Photos uploaded when completing a one-time task are now also shown in the archive view

### Fixes
- README version badge showed an outdated version number
- Replaced the legacy `notifications` structure in the webhook task endpoint with the current `notify` boolean model

---

## 1.6.7
### Improvements
- **Lovelace card: complete tasks directly** — new optional config field `complete_as: <userId>`; shows a ✓ button per task row that marks the task done without opening the Steward UI; falls back to `filter.person` when `complete_as` is not set

---

## 1.6.6
### Improvements
- **Single notification toggle**: Each task now has just one "Notify" toggle (on/off, default: on) instead of separate HA and email checkboxes — which channels are actually used is determined solely by the user's configuration
- **Migration**: Existing tasks with `notifications.ha/email` are automatically migrated to `notify: boolean` on startup
- **Calendar iCal URL**: Now also directly accessible from the calendar view (footer with copy button)
- **User cards**: User settings are now shown as readable cards instead of a cramped row
- **Settings reorganized**: General tab → timezone, vacation mode, gamification, weekly summary, archive; task modal → notification first, time fields only shown when notify is active

---

## 1.6.5
### New Features
- **iCal calendar feed** — new endpoint `GET /api/calendar.ics` returns all upcoming tasks as an RFC 5545 iCal feed; add it in HA under Settings → Integrations → Calendar (iCal)
- Tasks with a time appear as a timed event, tasks without a time as an all-day event
- Recurring tasks are expanded 90 days ahead (max. 52 occurrences)
- Priority is carried over as iCal PRIORITY (1/5/9)
- The URL is shown in settings (HA tab) and can be copied with one click

---

## 1.6.4
### Improvements
- **Due-status logic**: `isSoon` (yellow) now only applies when the task is due on the **same calendar day** — no more 12h-window bleed-over into the previous day
- **Grace period**: A task only turns red **1 hour after** its due time — between 09:00 and 10:00 it stays yellow
- **Timezone-aware**: Calendar-day comparison now uses the configured app timezone (instead of a fixed UTC boundary)
- **Consistent**: All call sites in the tasks route, HA sensors, cron and Lovelace card use the same logic

---

## 1.6.3
### Improvements
- **Waiting section**: Task names are now shown as chips instead of just a grey count text — room contents visible at a glance without expanding
- **"Show waiting" button**: Blue accent style (instead of neutral grey) — much more noticeable
- **Section dividers**: Thin line between room sections for better structure

---

## 1.6.2
### Improvements
- **UI readability**: Person tabs now shown as pills instead of full-width bars; tab row hidden for single-user setups without gamification
- **Room filter**: Active tab now uses a blue accent instead of neutral grey
- **"Show waiting" button**: More padding, visible background and border, blue hover effect
- **Section headers**: Slightly bolder and brighter (text2 instead of text3)
- **Task font size**: 0.88 → 0.93 rem for better readability
- **Badges and meta text**: Slightly enlarged (+0.02 rem, +1px padding)
- **Waiting placeholder**: Italic style removed

---

## 1.6.1
### Bug Fixes
- **NLP Quick-Add**: One-time tasks (date recognized) were saved with `interval:'weekly'` instead of `interval:'once'`
- **NLP tags**: Inline `border-color` had no effect — `.nlp-tag` had no base `border` style; set to `border: 1.5px solid transparent`
- **NLP parser**: User and room names were used as RegExp patterns without escaping — added an `esc()` helper (prevents ReDoS with special characters in names)
- **Weekly summary**: `data.settings.notifications?.ha` was always `undefined` (falsy) — fixed to use `user.haService` for per-user HA push
- **`showNotification`**: Function was called but never defined — added an auto-dismiss toast
- **`/api/sync-timezone`**: Route was missing entirely — added `fetchHaConfig` to `ha.js` and registered the route in `settings.js`
- **HA sensors during vacation**: `updateHaSensors` ignored vacation mode — sensors kept showing live counts; added a vacation guard (all sensors report 0 during vacation)
- **HA trigger one-time tasks**: `checkHaTriggers` created tasks with `interval:'once'` and `dueDate:null` — tasks were rescheduled instead of archived after completion; added `dueDate: todayStr`
- **Completion animation**: The `checkPulse` CSS animation class was never set in JS and would have been lost on DOM re-render — replaced with a body-level `spawnPulseRing(x, y)`
- **Vacation banner**: `#vacationBannerSub` was never populated — banner showed no end date; now reads the `X-Vacation-To` header and fills it in `render()`
- **`···` button touch target**: Button was ~18 px (missed the Apple HIG minimum of 44 px) — enlarged to `padding: 8px 10px; min-height: 36px`
- **Notification channel label**: "Notification channel" was hardcoded in English — added i18n keys `label.notify_channel`, `desc.notify_ha`, `desc.notify_email`
- **NLP input**: Browser autocomplete and autocorrect in the NLP input field were not suppressed — added `autocomplete="off" autocorrect="off" spellcheck="false"`

---

## 1.6.0
### Features
- **Touch target & haptics**: Check button enlarged to 36 × 36 px (easier to hit); vibration on completion (`[50, 30, 50]` ms pattern)
- **Completion animation**: Confetti particles and a pulse ring appear at the position of the check button when a task is completed
- **Long-press context menu**: 500 ms press on a card's info area opens the context menu — same content as the `···` button, with vibration feedback
- **Improved empty state**: Empty task list shows an icon, title and motivating subtitle instead of plain text
- **Photo on completion**: The comment modal lets you take a photo or pick one from the gallery; it's compressed (240 × 240 px, JPEG 65%) and stored in the completion history
- **Natural language (Quick Add)**: `✨` button in the header opens a modal with free-text input; keywords for interval, date, user and room are automatically recognized and shown as tags
- **Weekly summary**: Optional cron job every Monday at 07:00 UTC sends a summary of last week's completed tasks via HA push and/or email; toggle on/off in settings
- **Vacation mode**: Set a date range (from/to) in settings; during vacation, tasks aren't marked as due, notifications are paused and a banner is shown at the top of the screen

---

## 1.5.1
### Bug Fixes
- **Edit modal**: "More options" wasn't reset on open — stayed in its last state; now always opens collapsed
- **New modal**: Weekday and weekend notification times weren't cleared on open
- **i18n**: Removed dead key `confirm.delete_task` (deletion has used an undo toast instead of `window.confirm` since 1.5.0)

---

## 1.5.0
### Features
- **Drag-to-dismiss**: The modal handle is now functional — swiping down closes the task, settings and comment modals
- **Context menu**: Cards now have a `···` button that opens a context menu (edit, snooze, skip occurrence, duplicate, delete) — no more visual clutter with 5 buttons per card
- **Undo for delete**: Deleting now shows a 5-second toast with an "Undo" option instead of deleting immediately and irreversibly
- **Tabbed settings**: Settings modal split into 4 tabs (General / Users & Rooms / HA / Backup) instead of one long scroll
- **Loading indicator**: Save buttons (task, settings) are disabled while saving and show `…`; the check button on a card is disabled during completion; snooze/skip are guarded against double taps

---

## 1.4.3
### Improvements
- **Tap-to-edit**: Tapping a task's name/info area opens edit mode directly
- **Edit modal**: "More options" is collapsed by default — clean view on open, expandable manually when needed

---

## 1.4.2
### Bug Fixes
- **Skip route**: Replaced `getScheduledDueAt` with `getDueAt` — consecutive skips without a completion in between didn't advance the task (it stayed stuck at the first skip date)
- **HA room sensor**: Icon ternary was inverted (`room.icon ? '' : 'mdi:door'` → `room.icon || 'mdi:door'`) — configured icons were discarded, iconless rooms got the fallback correctly
- **Lovelace card**: XSS vulnerability — `title` from the card config was inserted into `innerHTML` without escaping; `_esc()` is now applied
- **Weekday detection**: `new Date().getDay()` used the server's system timezone; `Intl.DateTimeFormat` with the configured app timezone is now used for weekend detection
- **Room with only waiting tasks**: Rooms containing only waiting tasks were completely removed from the DOM when `showDone=false`, even though the toggle button counted them; rooms now stay visible with a hint text
- **Legacy tasks**: Guarded `task.notifications?.ha` with optional chaining — missing `notifications` fields (older backups) caused a `TypeError` when opening the edit modal

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

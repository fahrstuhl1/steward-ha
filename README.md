# 🏠 Steward — Home Assistant Add-on Repository
![Version](https://img.shields.io/badge/version-1.4.1-blue?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![HACS](https://img.shields.io/badge/HACS-Custom%20Repository-orange?style=flat-square)](https://hacs.xyz)

A Home Assistant add-on for managing household tasks together. Assign tasks to people, set priorities, due times and schedules, and get notified via the HA Companion App or email. An optional points system keeps household members motivated.

---

## Installation

1. **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add `https://github.com/fahrstuhl1/steward-ha`

---

## Configuration

Set these options in the add-on's **Configuration** tab:

| Option | Description | Required |
|---|---|---|
| `ha_url` | Your HA instance URL (e.g. `https://xxx.ui.nabu.casa`) | Yes |
| `ha_token` | Long-lived access token from HA | Yes |
| `webhook_secret` | Optional secret to protect the webhook endpoint | No |

Further configuration (users, rooms, HA triggers, addon URL) is done inside the app under **Settings**.

---

## Features

### Task Management
- Create tasks with name, room, assignee and interval
- Intervals: daily, weekly, biweekly, monthly, quarterly or **custom** (any number of days)
- One-time tasks with a fixed date and time
- **Start date** for recurring tasks (e.g. "starting next Friday, every 2 weeks")
- **Priorities**: High / Normal / Low — list sorted automatically by priority
- **Schedule mode**: Strict (next due date stays on track) or Flexible (interval starts from completion)
- Complete a task on behalf of another household member
- **Undo** — 5-second toast after completing a task to undo it
- **Waiting state** — completed recurring tasks are hidden by default; the toggle button shows their count (e.g. "Show waiting (3) & future") and reveals them on tap
- **Duplicate** — copy any task into the edit modal with one tap (⧉ button)
- **Skip occurrence** — advance a recurring task to its next scheduled date without recording a completion (⏩ button)

### Due Status Colors
| Color | Meaning |
|---|---|
| 🔴 Red | Overdue |
| 🟡 Yellow | Due within ≤ 12 hours |
| 🟠 Orange | Due tomorrow |
| Grey | Due later |

### Users
- Unlimited users with name, color, email and HA notify service
- Import users directly from HA `person.*` entities
- Tasks of deleted users are automatically reassigned to "All"

### HA Sensor Entities
All sensors carry a `tasks` attribute with the full task list — usable in standard HA cards and automations.

**Available sensors:**
| Entity | State | `tasks` attribute |
|---|---|---|
| `sensor.steward_due` | # overdue | all overdue tasks |
| `sensor.steward_due_soon` | # due soon | tasks due within 12h |
| `sensor.steward_<user-id>_due` | # overdue for user | overdue tasks for that user |
| `sensor.steward_<room-id>_due` | # overdue in room | overdue tasks in that room |

Each task in the `tasks` attribute has: `name`, `room`, `assignee`, `priority`, `due`.

**Markdown card example:**
```yaml
type: markdown
title: Due Tasks
content: >
  {% set tasks = state_attr('sensor.steward_due', 'tasks') %}
  {% if tasks %}
  {% for t in tasks %}
  - **{{ t.name }}** · {{ t.room }}
  {% endfor %}
  {% else %}
  All done ✓
  {% endif %}
```

**Automation condition example:**
```yaml
condition: template
value_template: >
  {{ state_attr('sensor.steward_due', 'tasks')
     | selectattr('room', 'eq', 'kitchen') | list | count > 0 }}
```

### Lovelace Card
For a styled card without templates, load `steward-card.js` as a resource:
**Settings → Dashboards → Resources** → add URL `http://<ha-ip>:3456/steward-card.js` (type: JavaScript module)

```yaml
type: custom:steward-task-card
url: http://<ha-ip>:3456
title: Tasks          # optional
filter:
  person: user1       # optional — assignee id
  room: kitchen       # optional — room id
```

### Notifications
- **Home Assistant** — push via HA Companion App with action buttons
- **Email** — via Gmail
- Configurable notification offset (e.g. 30 minutes before due)
- **Action buttons** in HA push notifications: "✓ Done" and "⏰ 2h Snooze" — handled via HA event stream, works with nabu.casa out of the box
- **Repeat notification** — sends another reminder after 24h if task is still not done

### Snooze
- Postpone a task for 2 hours via in-app button or notification action button
- Snooze suppresses repeat notifications

### Comment on Completion
- Optional popup when completing a task (skippable)
- Comment shown on the task card and stored in the history

### Points & Leaderboard *(optional)*
- Points per completed task: High = 3, Normal = 2, Low = 1
- **🏆 Leaderboard tab** with week / month / all-time view
- 🔥 Streak display (consecutive days with at least one completed task)
- Points badge per user in the header (current week points)
- Last 30 completions log with timestamp, user, points and comment
- **12 Achievements** (streaks, points milestones, turbo day, explorer…)
- Can be disabled entirely via the Gamification toggle in Settings

### HA Triggers (automatic tasks)
Create tasks from HA entity state changes — no HA automation configuration required:
- Select entity and target state (e.g. `sensor.dishwasher` → `finished`)
- Configure task name, room, assignee and notifications
- Server polls HA states every minute, fires on state change

### HA Sensor Entities
Automatically created sensors in HA (updated every 5 minutes):
- `sensor.steward_due` — total number of overdue tasks
- `sensor.steward_due_soon` — tasks due within ≤ 12h
- `sensor.steward_<user>_due` — overdue tasks per user

### Backup & Restore
- Export all data (tasks, settings, users, rooms, completions, archive) as a JSON file
- Import into any Steward instance — migration runs automatically

### Calendar & Search
- 📅 Monthly calendar view — tap a day to see tasks due on that date
- 🔍 Real-time search — filter tasks by name or room

### Display & UX
- Filter by user and room
- Collapsible room groups
- Light/dark mode toggle (☀️/🌙), preference saved persistently
- Swipe right to complete, swipe left to snooze (mobile)
- Pull-to-refresh (mobile)
- Back bar when viewing archive, calendar or planning — always clear which view is active

---

## Webhook API

Create tasks programmatically from HA automations:

`POST /api/webhook/create-task`

```json
{
  "secret": "optional",
  "name": "Empty dishwasher",
  "assignee": "user1",
  "room": "kitchen",
  "interval": "once",
  "dueDate": "2026-06-10",
  "dueTime": "18:00",
  "notifyOffset": 30,
  "notifications": { "ha": true, "email": false }
}
```

---

## Interface

The app is accessible via the **Steward** sidebar entry in Home Assistant (Ingress).

---

## Changelog

See [CHANGELOG.md](steward/CHANGELOG.md)

/**
 * Steward Task Card — custom Lovelace card for Home Assistant
 *
 * Installation:
 *   1. Add the JS resource to HA: Settings → Dashboards → Resources
 *      URL: /api/hassio_ingress/<addon-slug>/steward-card.js   (Ingress)
 *      or:  http://<ha-ip>:3456/steward-card.js                (direct)
 *      Type: JavaScript module
 *
 *   2. Add the card to a dashboard:
 *      type: custom:steward-task-card
 *      url: http://<ha-ip>:3456        # Steward base URL
 *      title: Tasks                    # optional
 *      filter:
 *        person: user1                 # optional — assignee id
 *        room: kitchen                 # optional — room id
 */

const CARD_TAG = 'steward-task-card';

const css = `
  :host { display: block; }
  .card-header { padding: 12px 16px 4px; font-size: 1rem; font-weight: 500; }
  .task-list { padding: 4px 16px 12px; }
  .task-row { display: flex; align-items: center; gap: 10px; padding: 7px 0;
    border-bottom: 1px solid var(--divider-color, rgba(255,255,255,0.08)); }
  .task-row:last-child { border-bottom: none; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot.due-now  { background: var(--error-color, #f87171); }
  .dot.due-soon { background: var(--warning-color, #facc15); }
  .task-name { flex: 1; font-size: 0.9rem; }
  .task-meta { font-size: 0.75rem; color: var(--secondary-text-color, #9ca3af); white-space: nowrap; }
  .empty { padding: 12px 16px; font-size: 0.88rem; color: var(--secondary-text-color, #9ca3af); }
  .error { padding: 12px 16px; font-size: 0.8rem; color: var(--error-color, #f87171); }
`;

class StewardTaskCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._interval = null;
  }

  setConfig(config) {
    if (!config.url) throw new Error('steward-task-card: "url" is required');
    this._config = config;
    this._render([]);
    this._fetch();
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(() => this._fetch(), 60000);
  }

  set hass(_) {}

  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
  }

  async _fetch() {
    const url = this._config.url.replace(/\/$/, '');
    try {
      const tasks = await fetch(`${url}/api/tasks`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      const { person, room } = this._config.filter || {};
      let due = tasks.filter(t => t.isDue || t.isSoon);
      if (person) due = due.filter(t => t.assignee === person || t.assignee === 'alle');
      if (room)   due = due.filter(t => t.room === room);
      this._render(due);
    } catch (e) {
      this.shadowRoot.querySelector('.task-list').innerHTML =
        `<div class="error">Cannot reach Steward: ${e.message}</div>`;
    }
  }

  _render(tasks) {
    const title = this._config?.title ?? 'Steward';
    this.shadowRoot.innerHTML = `
      <style>${css}</style>
      <ha-card>
        <div class="card-header">${_esc(title)}</div>
        <div class="task-list">${this._taskHtml(tasks)}</div>
      </ha-card>`;
  }

  _taskHtml(tasks) {
    if (!tasks.length) return '<div class="empty">All done ✓</div>';
    return tasks.map(t => {
      const dotClass = t.isDue ? 'due-now' : 'due-soon';
      const meta = t.nextDue || '';
      return `<div class="task-row">
        <span class="dot ${dotClass}"></span>
        <span class="task-name">${_esc(t.name)}</span>
        <span class="task-meta">${_esc(meta)}</span>
      </div>`;
    }).join('');
  }

  getCardSize() {
    const n = this.shadowRoot.querySelectorAll('.task-row').length;
    return Math.max(1, Math.ceil((n + 1) / 3));
  }

  static getStubConfig() {
    return { url: 'http://homeassistant.local:3456', title: 'Tasks', filter: {} };
  }
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, StewardTaskCard);
  console.info(`%c STEWARD-CARD %c loaded`, 'color:#fff;background:#5b9cf6;padding:2px 4px;border-radius:3px', '');
}

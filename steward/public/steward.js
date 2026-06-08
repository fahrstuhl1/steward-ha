let tasks=[], users=[], rooms=[], triggers=[], currentView='alle', currentGroup='alle';
let showDone=false, editingTaskId=null, collapsedRooms=new Set();
let pendingCompleteId=null, pendingCompleteUserId=null;
let statsData=null, statsPeriod='week';
let gamificationEnabled=true, searchOpen=false, calendarOpen=false;
let planningOpen=false, archiveOpen=false, planningDays=7;
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth(), calSelectedDay=null;
let vacationActive=false, vacationToDate=null, pendingPhoto=null, wasLongPress=false;
let addonBaseUrl = '';

const PRIORITY_ORDER = { high:0, normal:1, low:2 };

let menuOpen = false;
function toggleMenu() { menuOpen = !menuOpen; document.getElementById('menuDropdown').classList.toggle('open', menuOpen); }
function closeMenu() { menuOpen = false; document.getElementById('menuDropdown').classList.remove('open'); }
document.addEventListener('click', e => { if (menuOpen && !e.target.closest('.menu-wrap')) closeMenu(); });

let currentTheme = 'dark';
function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle('light', theme === 'light');
  const label = document.getElementById('themeMenuLabel');
  if (label) label.textContent = theme === 'light' ? L('theme.to_dark') : L('theme.to_light');
  const icon = document.querySelector('#themeMenuItem .menu-item-icon');
  if (icon) icon.textContent = theme === 'light' ? '🌙' : '☀️';
}
async function toggleTheme() {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  await fetch('api/theme', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({theme: next}) });
}

let undoTimeout = null, lastCompletedId = null;
function showUndoToast(taskName) {
  if (undoTimeout) clearTimeout(undoTimeout);
  document.getElementById('undoText').textContent = L('undo.completed', {name: taskName});
  document.getElementById('undoToast').classList.add('show');
  undoTimeout = setTimeout(hideUndoToast, 5000);
}
function hideUndoToast() { document.getElementById('undoToast').classList.remove('show'); undoTimeout = null; lastCompletedId = null; }
async function undoComplete() {
  hideUndoToast();
  if (!lastCompletedId) return;
  await fetch(`api/tasks/${lastCompletedId}/reset`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({userId:'undo'}) });
  lastCompletedId = null;
  await loadTasks();
}

let modalDragState = null;
function initModalDrag() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    const handle = overlay.querySelector('.modal-handle');
    if (!handle) return;
    handle.addEventListener('touchstart', e => {
      if (!overlay.classList.contains('open')) return;
      const modal = overlay.querySelector('.modal');
      modalDragState = { overlay, modal, startY: e.touches[0].clientY, height: modal.offsetHeight };
      modal.style.transition = 'none';
    }, {passive: true});
  });
  document.addEventListener('touchmove', e => {
    if (!modalDragState) return;
    const { modal, overlay, startY } = modalDragState;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    modal.style.transform = `translateY(${dy}px)`;
    overlay.style.background = `rgba(0,0,0,${Math.max(0, 0.55 * (1 - dy / (modalDragState.height * 0.55))).toFixed(2)})`;
  }, {passive: true});
  document.addEventListener('touchend', e => {
    if (!modalDragState) return;
    const { overlay, modal, startY } = modalDragState;
    const dy = e.changedTouches[0].clientY - startY;
    modal.style.transition = '';
    overlay.style.background = '';
    modal.style.transform = '';
    modalDragState = null;
    if (dy > 110) {
      if (overlay.id === 'taskModal') closeTaskModal();
      else if (overlay.id === 'settingsModal') closeSettings();
      else if (overlay.id === 'nlpModal') closeNlpModal();
      else submitComment(false);
    }
  }, {passive: true});
}

function btnLoading(btn, loading) {
  if (!btn) return;
  if (loading) { btn.disabled = true; btn.dataset.origHtml = btn.innerHTML; btn.innerHTML = '<span style="opacity:0.45">…</span>'; }
  else { btn.disabled = false; if (btn.dataset.origHtml !== undefined) { btn.innerHTML = btn.dataset.origHtml; delete btn.dataset.origHtml; } }
}

let swipeStartX=0, swipeStartY=0, swipeTaskId=null, swipeActive=false;
function initSwipe() {
  const container = document.getElementById('taskMain');
  container.addEventListener('touchstart', e => {
    const card = e.target.closest('[data-id]'); if (!card) return;
    swipeTaskId = card.dataset.id; swipeStartX = e.touches[0].clientX; swipeStartY = e.touches[0].clientY; swipeActive = true;
  }, {passive:true});
  container.addEventListener('touchmove', e => {
    if (!swipeActive || !swipeTaskId) return;
    const dx = e.touches[0].clientX - swipeStartX, dy = e.touches[0].clientY - swipeStartY;
    if (Math.abs(dy) > Math.abs(dx) + 10) { swipeActive = false; return; }
    const card = document.querySelector(`[data-id="${swipeTaskId}"]`);
    if (!card || Math.abs(dx) < 8) return;
    card.style.transform = `translateX(${dx * 0.45}px)`;
    card.style.background = dx > 0 ? 'rgba(74,222,128,0.18)' : 'rgba(251,146,60,0.18)';
  }, {passive:true});
  container.addEventListener('touchend', e => {
    if (!swipeActive || !swipeTaskId) return;
    const dx = e.changedTouches[0].clientX - swipeStartX, dy = e.changedTouches[0].clientY - swipeStartY;
    const card = document.querySelector(`[data-id="${swipeTaskId}"]`);
    if (card) { card.style.transform = ''; card.style.background = ''; }
    const id = swipeTaskId; swipeActive = false; swipeTaskId = null;
    if (Math.abs(dy) > 60 || Math.abs(dx) < 80) return;
    const task = tasks.find(t => t.id === id); if (!task) return;
    const isSnoozedNow = task.snoozedUntil && new Date(task.snoozedUntil) > new Date();
    if (dx > 0 && (task.isDue || task.isSoon)) toggleComplete(id);
    else if (dx < 0 && (task.isDue || task.isSoon || isSnoozedNow)) snoozeTask(id);
  }, {passive:true});
}

let pullStartY = 0, pulling = false, pullTriggered = false;
function initPullToRefresh() {
  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) { pullStartY = e.touches[0].clientY; pulling = true; pullTriggered = false; }
  }, {passive:true});
  document.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - pullStartY;
    if (dy > 10) {
      document.getElementById('pullIndicator').style.opacity = Math.min(1, (dy - 10) / 80);
      if (dy > 90 && !pullTriggered) { pullTriggered = true; document.getElementById('pullIndicator').textContent = L('pull.refreshing'); }
    }
  }, {passive:true});
  document.addEventListener('touchend', async e => {
    if (!pulling) return;
    const dy = e.changedTouches[0].clientY - pullStartY;
    const indicator = document.getElementById('pullIndicator');
    indicator.style.opacity = 0; indicator.textContent = L('pull.release');
    pulling = false;
    if (dy > 90) await loadTasks();
  }, {passive:true});
}

const USER_COLORS = ['#5b9cf6','#f472b6','#a78bfa','#34d399','#fb923c','#f87171','#60a5fa','#e879f9'];

function formatNextDue(d) {
  if (!d) return '';
  let str;
  if (d.key === 'due.date') str = d.date;
  else if (d.key === 'due.in_days') str = L('due.in_days', {days: d.days});
  else str = L(d.key);
  if (d.time) str += ' ' + L('due.at') + ' ' + d.time;
  return str;
}

function cycleLang() {
  const next = document.documentElement.lang === 'de' ? 'en' : 'de';
  setLang(next);
  localStorage.setItem('steward-lang', next);
  document.getElementById('langLabel').textContent = next === 'de' ? 'Deutsch' : 'English';
  applyTranslations();
  render();
  applyTheme(currentTheme);
  fetch('api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ language: next }) }).catch(() => {});
}

const DEFAULT_ROOMS   = [
  {id:'kitchen',name:'Kitchen',icon:'🍳'},{id:'living_room',name:'Living Room',icon:'🛋️'},
  {id:'bathroom',name:'Bathroom',icon:'🚿'},{id:'bedroom',name:'Bedroom',icon:'🛏️'},
  {id:'garden',name:'Garden',icon:'🌿'},{id:'general',name:'General',icon:'🏠'}
];

async function init() {
  const savedLang = localStorage.getItem('steward-lang') || browserLang();
  setLang(savedLang);
  document.getElementById('langLabel').textContent = savedLang === 'de' ? 'Deutsch' : 'English';
  applyTranslations();
  await loadSettings();
  await loadTasks();
  await loadStats();
  setInterval(loadTasks, 30000);
  setInterval(loadStats, 60000);
  initSwipe();
  initPullToRefresh();
  initModalDrag();
  initLongPress();
  _initSnoozeChips();
}

async function loadStats() {
  try {
    statsData = await (await fetch('api/stats')).json();
    gamificationEnabled = statsData.gamificationEnabled !== false;
    renderStatsBadges();
    if (currentView==='stats') renderStatsView();
  } catch(e){}
}

async function loadTasks() {
  const res = await fetch('api/tasks');
  vacationActive  = res.headers.get('X-Vacation-Active') === 'true';
  vacationToDate  = res.headers.get('X-Vacation-To') || null;
  tasks = await res.json();
  render();
}

async function loadSettings() {
  const s = await (await fetch('api/settings')).json();
  users = (s.users && s.users.length) ? s.users : [];
  rooms = (s.rooms && s.rooms.length) ? s.rooms : DEFAULT_ROOMS;
  if (!users.find(u => u.id === currentView)) { currentView = users.length === 1 ? users[0].id : 'alle'; }
  planningDays  = s.planningDays ?? 7;
  addonBaseUrl  = (s.addonUrl || s.haUrl || '').replace(/\/$/, '');
  if (s.theme) applyTheme(s.theme);
  if (s.language !== document.documentElement.lang) {
    fetch('api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ language: document.documentElement.lang }) }).catch(() => {});
  }
  renderPersonTabs();
  renderLogoSub();
}

function calNav(dir) { calMonth += dir; if(calMonth>11){calMonth=0;calYear++;} if(calMonth<0){calMonth=11;calYear--;} calSelectedDay=null; renderCalendar(); }

function renderCalendar() {
  const DAYS   = L('cal.days');
  const locale = document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB';
  const MONTHS = Array.from({length:12}, (_,i) => new Date(2000, i, 1).toLocaleDateString(locale, {month:'long'}));
  document.getElementById('calMonthLabel').textContent = `${MONTHS[calMonth]} ${calYear}`;
  const byDay = {};
  tasks.forEach(t => {
    if (!t.dueAtMs) return;
    const d = new Date(t.dueAtMs);
    if (d.getFullYear()===calYear && d.getMonth()===calMonth) { const day=d.getDate(); if(!byDay[day])byDay[day]=[]; byDay[day].push(t); }
  });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;
  const today = new Date();
  let html = DAYS.map(d=>`<div class="cal-day-header">${d}</div>`).join('');
  for (let i=0; i<startOffset; i++) html += `<div class="cal-day other-month"></div>`;
  for (let d=1; d<=daysInMonth; d++) {
    const isToday = d===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
    const isSelected = d===calSelectedDay;
    html += `<div class="cal-day${isToday?' today':''}${byDay[d]?' has-tasks':''}${isSelected?' selected':''}" onclick="selectCalDay(${d})">
      <div class="cal-day-num">${d}</div>
      ${(byDay[d]||[]).map(t=>`<span class="cal-dot" style="background:${t.isDue?'var(--red)':t.isSoon?'#facc15':'#5b9cf6'}"></span>`).join('')}
    </div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
  if (calSelectedDay) {
    const dayTasks = byDay[calSelectedDay] || [];
    document.getElementById('calTaskList').innerHTML = dayTasks.length
      ? `<div style="font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);margin:12px 0 8px">${MONTHS[calMonth]} ${calSelectedDay}</div>` +
        `<div class="task-list" style="border:1px solid var(--border);border-radius:var(--r);overflow:hidden">${dayTasks.map(taskCard).join('')}</div>` : '';
  }
  const calBar = document.getElementById('calIcalBar');
  if (addonBaseUrl) {
    document.getElementById('calIcalUrl').value = addonBaseUrl + '/api/calendar.ics';
    calBar.style.display = '';
  } else {
    calBar.style.display = 'none';
  }
}

function selectCalDay(d) { calSelectedDay = calSelectedDay===d ? null : d; renderCalendar(); }

function renderAchievements(userStats) {
  const sec = document.getElementById('achievementsSection');
  if (!gamificationEnabled || !userStats?.achievements) { sec.style.display='none'; return; }
  sec.style.display='';
  const target = currentView !== 'alle' && currentView !== 'stats'
    ? userStats.find(s=>s.userId===currentView)
    : [...userStats].sort((a,b)=>b.pointsTotal-a.pointsTotal)[0];
  if (!target) { sec.style.display='none'; return; }
  document.getElementById('achievementsLabel').textContent = L('stats.achievements', {name: target.name});
  document.getElementById('achievementGrid').innerHTML = (target.achievements||[]).map(a=>
    `<div class="achievement-card ${a.unlocked?'':'locked'}" title="${L('ach.'+a.id+'.desc')}"><div class="achievement-icon">${a.icon}</div><div class="achievement-title">${L('ach.'+a.id+'.title')}</div><div class="achievement-desc">${L('ach.'+a.id+'.desc')}</div></div>`
  ).join('');
}

function setStatsPeriod(period, btn) {
  statsPeriod = period;
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderStatsView();
}

function renderStatsView() {
  if (!statsData) return;
  const { stats, recent } = statsData;
  const ptKey = statsPeriod === 'week' ? 'pointsWeek' : statsPeriod === 'month' ? 'pointsMonth' : 'pointsTotal';
  const RANKS = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const sorted = [...stats].sort((a,b) => b[ptKey] - a[ptKey]);
  document.getElementById('leaderboard').innerHTML = sorted.map((s, i) => `
    <div class="leader-card" style="border-left:3px solid ${s.color}">
      <div class="leader-rank">${RANKS[i]||'·'}</div>
      <div class="leader-info">
        <div class="leader-name" style="color:${s.color}">${s.name}</div>
        <div class="leader-meta">${L('stats.tasks_done', {n: s.tasksDone})}${s.streak > 1 ? ` <span class="leader-streak">· ${L('stats.streak', {n: s.streak})}</span>` : ''}</div>
      </div>
      <div><div class="leader-points" style="color:${s.color}">${s[ptKey]}</div><div style="font-size:0.65rem;color:var(--text3);text-align:right;">${L('stats.points')}</div></div>
    </div>`
  ).join('') || `<div class="empty-state">${L('empty.no_stats')}</div>`;
  renderAchievements(stats);
  document.getElementById('recentList').innerHTML = recent.slice(0, 15).map(c => {
    const u = users.find(u => u.id === c.userId);
    const color = u?.color || '#7c819a';
    const d = new Date(c.date);
    const dateStr = d.toLocaleDateString('en-GB', {day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    return `<div class="recent-item"><div class="recent-pts" style="color:${color}">+${c.points}</div><div class="recent-info"><div class="recent-task">${c.taskName}</div><div class="recent-date">${c.userName} · ${dateStr}${c.comment?` · 💬 ${c.comment}`:''}</div></div></div>`;
  }).join('') || `<div style="color:var(--text3);font-size:0.8rem;padding:8px 0;">${L('empty.no_completions')}</div>`;
}

function renderLogoSub() { document.getElementById('logoSub').textContent = users.length ? ' ' + users.map(u => u.name).join(' & ') : ''; }

function renderPersonTabs() {
  const tabs = document.getElementById('personTabs');
  const weekPts = statsData?.stats || [];
  const hasMultipleTabs = users.length > 1 || gamificationEnabled;
  tabs.style.display = hasMultipleTabs ? '' : 'none';
  tabs.innerHTML = users.map(u => {
    const pts = gamificationEnabled ? (weekPts.find(s=>s.userId===u.id)?.pointsWeek || 0) : 0;
    const badge = pts > 0 ? `<span class="points-badge">${pts}</span>` : '';
    return `<button class="tab ${currentView===u.id?'active':''}" style="${currentView===u.id?'background:'+u.color:''}" onclick="setView('${u.id}')">${u.name}${badge}</button>`;
  }).join('') +
  (users.length > 1 ? `<button class="tab alle ${currentView==='alle'?'active':''}" onclick="setView('alle')">${L('tab.all')}</button>` : '') +
  (gamificationEnabled ? `<button class="tab ${currentView==='stats'?'active':''}" style="${currentView==='stats'?'background:#a78bfa':''}" onclick="setView('stats')">🏆</button>` : '');
}

function renderStatsBadges() { renderPersonTabs(); }

function setView(v) {
  currentView = v;
  planningOpen = archiveOpen = calendarOpen = false;
  ['planningView','archiveView','calendarView'].forEach(id => document.getElementById(id).style.display='none');
  document.getElementById('viewBackBar').classList.remove('visible');
  renderPersonTabs();
  const isStats = v === 'stats';
  document.getElementById('taskMain').style.display    = isStats ? 'none' : '';
  document.getElementById('showDoneBtn').style.display = isStats ? 'none' : '';
  document.getElementById('statsView').style.display   = isStats ? 'block' : 'none';
  document.getElementById('groupTabs').style.display   = isStats ? 'none' : '';
  if (isStats) renderStatsView(); else render();
}

function toggleSearch() {
  searchOpen = !searchOpen;
  document.getElementById('searchBar').classList.toggle('open', searchOpen);
  if (searchOpen) setTimeout(()=>document.getElementById('searchInput').focus(), 100);
  else { document.getElementById('searchInput').value=''; render(); }
}


function setOverlayView(which) {
  const views = { planning: planningOpen, archive: archiveOpen, calendar: calendarOpen };
  planningOpen = archiveOpen = calendarOpen = false;
  if (which && !views[which]) {
    if (which === 'planning') planningOpen = true;
    if (which === 'archive')  archiveOpen  = true;
    if (which === 'calendar') calendarOpen = true;
  }
  const isOverlay = planningOpen || archiveOpen || calendarOpen;
  const activeKey = planningOpen ? 'planning' : archiveOpen ? 'archive' : calendarOpen ? 'calendar' : null;
  document.getElementById('planningView').style.display  = planningOpen ? 'block' : 'none';
  document.getElementById('archiveView').style.display   = archiveOpen  ? 'block' : 'none';
  document.getElementById('calendarView').style.display  = calendarOpen ? 'block' : 'none';
  document.getElementById('taskMain').style.display      = isOverlay || currentView==='stats' ? 'none' : '';
  document.getElementById('showDoneBtn').style.display   = isOverlay || currentView==='stats' ? 'none' : '';
  document.getElementById('statsView').style.display     = isOverlay ? 'none' : (currentView==='stats' ? 'block' : 'none');
  document.getElementById('groupTabs').style.display     = isOverlay || currentView==='stats' ? 'none' : '';
  const backBar = document.getElementById('viewBackBar');
  backBar.classList.toggle('visible', isOverlay);
  if (activeKey) {
    const overlayLabels = { planning: `📋 ${L('menu.planning')}`, archive: `📦 ${L('menu.archive')}`, calendar: `📅 ${L('menu.calendar')}` };
    document.getElementById('viewBackLabel').textContent = overlayLabels[activeKey];
  }
  if (planningOpen) renderPlanningView();
  if (archiveOpen)  renderArchiveView();
  if (calendarOpen) renderCalendar();
}

function closeOverlayView() { setOverlayView(null); }
function togglePlanning() { setOverlayView('planning'); }
function toggleArchive()  { setOverlayView('archive'); }

function renderPlanningView() {
  const now = Date.now(), end = now + planningDays * 86400000;
  const upcoming = tasks.filter(t => t.dueAtMs > now && t.dueAtMs <= end && t.interval !== 'daily').sort((a, b) => a.dueAtMs - b.dueAtMs);
  if (!upcoming.length) { document.getElementById('planningView').innerHTML = `<div class="plan-empty">${L('empty.no_planning', {days: planningDays})}</div>`; return; }
  const byDay = {};
  upcoming.forEach(t => {
    const key = new Date(t.dueAtMs).toLocaleDateString('en-GB', {weekday:'long', day:'2-digit', month:'2-digit'});
    if (!byDay[key]) byDay[key] = []; byDay[key].push(t);
  });
  document.getElementById('planningView').innerHTML =
    `<div style="font-size:0.75rem;color:var(--text3);margin-bottom:12px;">${L('view.planning_title', {days: planningDays})}</div>` +
    Object.entries(byDay).map(([day, dayTasks]) => `
      <div class="plan-day">
        <div class="plan-day-header"><span>${day}</span><span class="plan-day-count">${dayTasks.length}</span></div>
        <div class="task-list" style="border:1px solid var(--border);border-radius:var(--r);overflow:hidden">${dayTasks.map(taskCard).join('')}</div>
      </div>`).join('');
}

async function renderArchiveView() {
  document.getElementById('archiveView').innerHTML = `<div class="plan-empty">${L('empty.archive_loading')}</div>`;
  const archive = await (await fetch('api/archive')).json();
  if (!archive.length) { document.getElementById('archiveView').innerHTML = `<div class="plan-empty">${L('empty.archive_empty')}</div>`; return; }
  const PRIORITY_ICON = { high:'🔴', normal:'⚪', low:'🔵' };
  document.getElementById('archiveView').innerHTML =
    `<div style="font-size:0.75rem;color:var(--text3);margin-bottom:12px;">${L('archive.count', {n: archive.length})}</div>` +
    archive.map(e => {
      const u = users.find(u => u.id === e.completedBy);
      const date = new Date(e.archivedAt).toLocaleDateString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric'});
      const room = rooms.find(r => r.id === e.room);
      return `<div class="archive-item"><div class="archive-icon">${PRIORITY_ICON[e.priority||'normal']}</div><div class="archive-info"><div class="archive-name">${e.name}</div><div class="archive-meta">${room ? room.icon+' '+room.name : e.room} · ${u ? u.name : e.completedBy} · ${date}</div>${e.comment ? `<div class="archive-comment">💬 ${e.comment}</div>` : ''}${e.photo ? `<img class="archive-photo" src="${e.photo}" alt="" loading="lazy">` : ''}</div></div>`;
    }).join('');
}

function toggleCalendar() { setOverlayView('calendar'); }
function setGroup(g) { currentGroup=g; render(); }
function toggleShowDone() { showDone=!showDone; render(); }
function toggleRoom(id) { collapsedRooms.has(id)?collapsedRooms.delete(id):collapsedRooms.add(id); const el=document.getElementById('sec-'+id); if(el)el.classList.toggle('collapsed',collapsedRooms.has(id)); }

function filteredTasks() {
  let ft = currentView==='alle' ? tasks : tasks.filter(t => t.assignee===currentView || t.assignee==='alle');
  if (currentGroup !== 'alle') ft = ft.filter(t => (t.room||'general') === currentGroup);
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  if (q) ft = ft.filter(t => t.name.toLowerCase().includes(q) || (t.room||'').toLowerCase().includes(q));
  return ft;
}

function render() {
  renderHeader();
  renderGroupTabs();
  renderTasks();
  const banner = document.getElementById('vacationBanner');
  banner.style.display = vacationActive ? '' : 'none';
  if (vacationActive && vacationToDate) {
    const d = new Date(vacationToDate + 'T23:59:59');
    const lang = document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB';
    document.getElementById('vacationBannerSub').textContent =
      ' · ' + L('vacation.banner') + ' ' + d.toLocaleDateString(lang, {day:'numeric', month:'short'});
  } else {
    document.getElementById('vacationBannerSub').textContent = '';
  }
}

function renderHeader() {
  const ft=filteredTasks(), due=ft.filter(t=>t.isDue||t.isSoon).length, done=ft.filter(t=>!t.isDue&&!t.isSoon&&t.lastCompleted).length;
  const bd=document.getElementById('hstatDue'), bk=document.getElementById('hstatDone');
  bd.style.display=due?'inline':'none'; bk.style.display=done?'inline':'none';
  bd.textContent=L('header.due_count', {n: due}); bk.textContent=L('header.done_count', {n: done});
}

function renderGroupTabs() {
  const tabs = [{id:'alle',name:L('tab.all'),icon:''}];
  rooms.forEach(r => { if(tasks.some(t=>(t.room||'general')===r.id)) tabs.push(r); });
  document.getElementById('groupTabs').innerHTML = tabs.map(t =>
    `<button class="group-tab ${currentGroup===t.id?'active':''}" onclick="setGroup('${t.id}')">${t.icon?t.icon+' ':''}${t.name}</button>`
  ).join('');
}

function renderTasks() {
  const ft=filteredTasks(), grouped={};
  rooms.forEach(r => grouped[r.id]=[]);
  ft.forEach(t => { const rid=t.room||'general'; if(!grouped[rid])grouped[rid]=[]; grouped[rid].push(t); });
  let html='', totalWaiting=0;
  rooms.forEach(r => {
    const group=grouped[r.id]; if(!group||!group.length) return;
    const due     = group.filter(t => t.isDue || t.isSoon);
    const waiting = group.filter(t => !t.isDue && !t.isSoon && t.lastCompleted && !t.dueDate);
    const future  = group.filter(t => !t.isDue && !t.isSoon && !(t.lastCompleted && !t.dueDate));
    due.sort((a,b)=>{ if(a.isDue!==b.isDue) return a.isDue?-1:1; return PRIORITY_ORDER[a.priority||'normal']-PRIORITY_ORDER[b.priority||'normal']; });
    const visible = [...due, ...(showDone ? [...waiting, ...future] : [])];
    if(!visible.length && !waiting.length) return;
    if(!showDone) totalWaiting+=waiting.length;
    const collapsed=collapsedRooms.has(r.id);
    html+=`<div class="section ${collapsed?'collapsed':''}" id="sec-${r.id}">
      <div class="section-header" onclick="toggleRoom('${r.id}')">
        <span class="section-icon">${r.icon}</span><span class="section-title">${r.name}</span>
        ${due.length?`<span class="section-due-count">${L('section.due_count', {n: due.length})}</span>`:''}
        <span class="section-chevron">▾</span>
      </div>
      <div class="section-body">${visible.length
        ? `<div class="task-list">${visible.map(taskCard).join('')}</div>`
        : `<div class="waiting-chips">${waiting.map(t=>`<span class="waiting-chip">${t.name}</span>`).join('')}</div>`
      }</div>
    </div>`;
  });
  document.getElementById('taskContainer').innerHTML = html || `<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">${L('empty.all_done')}</div><div class="empty-sub">${L('empty.sub')}</div></div>`;
  const btn=document.getElementById('showDoneBtn');
  if(showDone) btn.textContent=L('tasks.hide_future');
  else if(totalWaiting>0) btn.textContent=L('tasks.show_waiting_count', {n: totalWaiting});
  else btn.textContent=L('tasks.show_future');
}

function getUserById(id) { return users.find(u => u.id === id); }

function taskCard(t) {
  const isSnoozedNow = !!(t.snoozedUntil && new Date(t.snoozedUntil) > new Date());
  const isNow      = t.isDue;
  const isSoonFlag = !isNow && t.isSoon;
  const isWaiting  = !isNow && !isSoonFlag && t.lastCompleted && !t.dueDate;
  const isPostponed = !isNow && !isSoonFlag && !isWaiting && isSnoozedNow;
  const isDone     = !isNow && !isSoonFlag && !isWaiting && !isPostponed;
  const isTomorrow = isDone && t.nextDueData?.key === 'due.tomorrow';
  const cardClass  = isNow ? 'due-now' : isSoonFlag ? 'due-soon' : isTomorrow ? 'due-today' : (isWaiting || isPostponed) ? 'waiting' : 'done';
  const dueClass   = isNow ? 'red' : isSoonFlag ? 'yellow' : isTomorrow ? 'orange' : 'muted';

  let badgeHtml;
  if (t.assignee === 'alle') {
    badgeHtml = `<span class="badge" style="background:rgba(167,139,250,0.15);color:#a78bfa">${L('tab.all')}</span>`;
  } else {
    const u = getUserById(t.assignee);
    badgeHtml = `<span class="badge" style="background:${(u?.color||'#7c819a')}22;color:${u?.color||'#7c819a'}">${u ? u.name : t.assignee}</span>`;
  }

  const intervalLabel = t.dueDate ? L('interval.once') : (t.intervalCustomDays ? L('interval.custom', {days: t.intervalCustomDays}) : (L('interval.' + t.interval) || t.interval));
  const notifyHint    = t.notifyOffset > 0 ? ` <span class="meta-text">${t.notifyOffset < 60 ? L('notify.hint_min', {n: t.notifyOffset}) : L('notify.hint_hour', {n: Math.round(t.notifyOffset/60)})}</span>` : '';
  const priorityDot   = t.priority && t.priority !== 'normal' ? `<span class="priority-dot priority-${t.priority}"></span>` : '';
  const snoozeHint    = isSnoozedNow ? `<div class="snooze-hint" onclick="event.stopPropagation();openSnoozeModal('${t.id}')">${L('snooze.hint', {time: new Date(t.snoozedUntil).toLocaleTimeString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', {hour:'2-digit',minute:'2-digit'})})}</div>` : '';
  const commentLine   = t.lastComment ? `<div class="comment-text">💬 ${t.lastComment}</div>` : '';
  const checkIcon     = (isWaiting || isPostponed) ? '⏳' : '✓';
  const nextDueStr    = formatNextDue(t.nextDueData) || t.nextDue;
  const waitingLabel  = isWaiting ? `<span class="due-label muted">⏳ ${L('state.waiting')} · ${nextDueStr}</span>` : `<span class="due-label ${dueClass}">${nextDueStr}</span>`;

  const subtasks      = Array.isArray(t.subtasks) ? t.subtasks : [];
  const subtaskHint   = subtasks.length ? ` <span class="meta-dot">·</span><span class="meta-text">☑ ${subtasks.filter(s=>s.done).length}/${subtasks.length}</span>` : '';
  const subtaskList   = subtasks.length ? `<div class="subtask-list" onclick="event.stopPropagation()">${subtasks.map(s => `<label class="subtask-item ${s.done?'subtask-done':''}"><input type="checkbox" ${s.done?'checked':''} onchange="toggleSubtask('${t.id}','${s.id}',this)"><span>${s.name}</span></label>`).join('')}</div>` : '';

  return `<div class="task-card ${cardClass}" data-id="${t.id}">
    <button class="check-btn" onclick="toggleComplete('${t.id}')">${checkIcon}</button>
    <div class="task-info" onclick="onTaskInfoClick('${t.id}')" style="cursor:pointer">
      <div class="task-name">${priorityDot}${t.name}</div>
      <div class="task-meta">${badgeHtml}<span class="meta-dot">·</span><span class="meta-text">${intervalLabel}</span><span class="meta-dot">·</span>${waitingLabel}${notifyHint}${subtaskHint}</div>
      ${snoozeHint}${commentLine}${subtaskList}
    </div>
    <div class="task-actions"><button class="task-action-btn" onclick="openCtxMenu(event,'${t.id}')" title="${L('btn.more')}">···</button></div>
  </div>`;
}

async function toggleSubtask(taskId, subId, checkbox) {
  checkbox.disabled = true;
  try {
    const r = await fetch(`api/tasks/${taskId}/subtasks/${subId}/toggle`, { method: 'POST' });
    const res = await r.json();
    if (!r.ok || !res.success) throw new Error(res.error || 'Toggle failed');
    const task = tasks.find(t => t.id === taskId);
    const sub  = task?.subtasks?.find(s => s.id === subId);
    if (sub) sub.done = res.done;
    checkbox.closest('.subtask-item')?.classList.toggle('subtask-done', res.done);
  } catch(e) { checkbox.checked = !checkbox.checked; }
  checkbox.disabled = false;
}

async function toggleComplete(id) {
  const task=tasks.find(t=>t.id===id); if(!task) return;
  let userId = currentView==='alle' ? task.assignee : currentView;
  if (userId === 'alle') userId = users[0]?.id || 'unknown';
  if (task.isDue || task.isSoon) {
    const sel = document.getElementById('completedBySelect');
    sel.innerHTML = users.map(u => `<option value="${u.id}" ${u.id===userId?'selected':''}>${u.name}</option>`).join('');
    pendingCompleteId = id; pendingCompleteUserId = userId;
    document.getElementById('commentInput').value = '';
    document.getElementById('commentModal').classList.add('open');
    setTimeout(()=>document.getElementById('commentInput').focus(), 300);
  } else {
    const checkBtn = document.querySelector(`[data-id="${id}"] .check-btn`);
    btnLoading(checkBtn, true);
    try {
      await fetch(`api/tasks/${id}/reset`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId}) });
      await loadTasks();
    } finally { btnLoading(checkBtn, false); }
  }
}

async function submitComment(save) {
  document.getElementById('commentModal').classList.remove('open');
  if (!pendingCompleteId) return;
  const checkBtn = document.querySelector(`[data-id="${pendingCompleteId}"] .check-btn`);
  const rect = checkBtn?.getBoundingClientRect();
  btnLoading(checkBtn, true);
  const comment = save ? document.getElementById('commentInput').value.trim() : null;
  const userId  = document.getElementById('completedBySelect').value || pendingCompleteUserId;
  const photo   = pendingPhoto;
  clearPhoto();
  try {
    await fetch(`api/tasks/${pendingCompleteId}/complete`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, comment, photo }) });
    const completedId = pendingCompleteId;
    const completedName = tasks.find(t=>t.id===completedId)?.name || '';
    pendingCompleteId = null; pendingCompleteUserId = null;
    await loadTasks();
    lastCompletedId = completedId;
    showUndoToast(completedName);
    vibrate([50, 30, 50]);
    if (rect) {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      spawnPulseRing(cx, cy);
      spawnConfetti(cx, cy);
    }
  } finally { btnLoading(checkBtn, false); }
}

let actionInProgress = false;
function snoozeTask(id) {
  openSnoozeModal(id);
}

let snoozeTaskId = null;
function openSnoozeModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  snoozeTaskId = id;
  const infoEl = document.getElementById('snoozeCurrentInfo');
  const textEl = document.getElementById('snoozeCurrentText');
  const snoozedActive = task.snoozedUntil && new Date(task.snoozedUntil) > new Date();
  if (snoozedActive) {
    const time = new Date(task.snoozedUntil).toLocaleString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    textEl.textContent = L('snooze.current', { time });
    infoEl.style.display = '';
  } else {
    infoEl.style.display = 'none';
  }
  document.getElementById('snoozeMinutes').value = '120';
  document.getElementById('snoozeCustomAmount').value = '1';
  document.getElementById('snoozeCustomUnit').value = 'hours';
  document.getElementById('snoozeCustomRow').style.display = 'none';
  document.querySelectorAll('#snoozeChips .interval-chip').forEach(c => c.classList.toggle('active', c.dataset.value === '120'));
  document.getElementById('snoozeModal').classList.add('open');
}
function closeSnoozeModal() {
  document.getElementById('snoozeModal').classList.remove('open');
  snoozeTaskId = null;
}

async function openHistoryModal(id) {
  document.getElementById('historyModal').classList.add('open');
  const list = document.getElementById('historyList');
  list.innerHTML = `<div class="plan-empty">${L('empty.archive_loading')}</div>`;
  const history = await (await fetch(`api/tasks/${id}/history`)).json();
  if (!history.length) { list.innerHTML = `<div class="plan-empty">${L('empty.no_completions')}</div>`; return; }
  list.innerHTML =
    `<div style="font-size:0.75rem;color:var(--text3);margin-bottom:12px;">${L('history.count', {n: history.length})}</div>` +
    history.map(c => {
      const date = new Date(c.date).toLocaleString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div class="archive-item"><div class="archive-info"><div class="archive-meta">${c.userName} · ${date}</div>${c.comment ? `<div class="archive-comment">💬 ${c.comment}</div>` : ''}${c.photo ? `<img class="archive-photo" src="${c.photo}" alt="" loading="lazy">` : ''}</div></div>`;
    }).join('');
}
function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('open');
}

function _initSnoozeChips() {
  document.querySelectorAll('#snoozeChips .interval-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#snoozeChips .interval-chip').forEach(c => c.classList.toggle('active', c === chip));
      document.getElementById('snoozeMinutes').value = chip.dataset.value;
      document.getElementById('snoozeCustomRow').style.display = chip.dataset.value === 'custom' ? '' : 'none';
    });
  });
}

function _snoozeMinutesFromForm() {
  const val = document.getElementById('snoozeMinutes').value;
  if (val !== 'custom') return Number(val);
  const amount = Math.max(1, Number(document.getElementById('snoozeCustomAmount').value) || 1);
  const unit   = document.getElementById('snoozeCustomUnit').value;
  const factor = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
  return amount * factor;
}

async function submitSnooze() {
  if (!snoozeTaskId || actionInProgress) return;
  const minutes = _snoozeMinutesFromForm();
  if (!minutes || minutes < 1) return;
  actionInProgress = true;
  const btn = document.querySelector('#snoozeModal .btn-primary');
  btnLoading(btn, true);
  try {
    await fetch(`api/tasks/${snoozeTaskId}/snooze`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ minutes }) });
    closeSnoozeModal();
    await loadTasks();
  } finally { btnLoading(btn, false); actionInProgress = false; }
}

async function submitUnsnooze() {
  if (!snoozeTaskId || actionInProgress) return;
  actionInProgress = true;
  try {
    await fetch(`api/tasks/${snoozeTaskId}/unsnooze`, { method:'POST' });
    closeSnoozeModal();
    await loadTasks();
  } finally { actionInProgress = false; }
}

async function skipTask(id) {
  if (actionInProgress) return;
  actionInProgress = true;
  try {
    await fetch(`api/tasks/${id}/skip`, { method:'POST' });
    await loadTasks();
  } finally { actionInProgress = false; }
}

function duplicateTask(id) {
  openEditModal(id);
  editingTaskId = null;
  document.getElementById('modalTitle').textContent = L('modal.duplicate_task');
}

let activeCtxMenu = null;
function openCtxMenu(e, taskId) {
  e.stopPropagation();
  closeCtxMenu();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const isRecurring  = !task.dueDate;
  const isDueOrSoon  = task.isDue || task.isSoon;
  const isSnoozedNow = task.snoozedUntil && new Date(task.snoozedUntil) > new Date();
  const items = [
    `<button class="ctx-item" onclick="closeCtxMenu();openEditModal('${taskId}')">${L('btn.edit')}</button>`,
    (isDueOrSoon || isSnoozedNow) ? `<button class="ctx-item" onclick="closeCtxMenu();openSnoozeModal('${taskId}')">${L('btn.snooze')}</button>` : '',
    isRecurring  ? `<button class="ctx-item" onclick="closeCtxMenu();skipTask('${taskId}')">${L('btn.skip_task')}</button>` : '',
    isRecurring  ? `<button class="ctx-item" onclick="closeCtxMenu();openHistoryModal('${taskId}')">${L('btn.history')}</button>` : '',
    `<button class="ctx-item" onclick="closeCtxMenu();duplicateTask('${taskId}')">${L('btn.duplicate')}</button>`,
    `<button class="ctx-item ctx-item-danger" onclick="closeCtxMenu();deleteTask('${taskId}')">${L('btn.delete')}</button>`,
  ].filter(Boolean).join('');
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.innerHTML = items;
  menu.style.right = `${window.innerWidth - e.currentTarget.getBoundingClientRect().right}px`;
  menu.style.top = `${e.currentTarget.getBoundingClientRect().bottom + 4}px`;
  document.body.appendChild(menu);
  if (e.currentTarget.getBoundingClientRect().bottom + 4 + menu.offsetHeight > window.innerHeight - 8) {
    menu.style.top = `${e.currentTarget.getBoundingClientRect().top - menu.offsetHeight - 4}px`;
  }
  activeCtxMenu = menu;
  setTimeout(() => document.addEventListener('click', closeCtxMenu), 0);
}
function closeCtxMenu() {
  if (activeCtxMenu) { activeCtxMenu.remove(); activeCtxMenu = null; }
  document.removeEventListener('click', closeCtxMenu);
}

let deleteUndoTimeout = null, pendingDeleteId = null;
async function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (deleteUndoTimeout) { clearTimeout(deleteUndoTimeout); fetch(`api/tasks/${pendingDeleteId}`, {method:'DELETE'}); }
  pendingDeleteId = id;
  tasks = tasks.filter(t => t.id !== id);
  render();
  document.getElementById('deleteText').textContent = L('undo.deleted', {name: task.name});
  document.getElementById('deleteToast').classList.add('show');
  deleteUndoTimeout = setTimeout(async () => {
    hideDeleteToast();
    await fetch(`api/tasks/${pendingDeleteId}`, {method:'DELETE'});
    pendingDeleteId = null;
  }, 5000);
}
function hideDeleteToast() { document.getElementById('deleteToast').classList.remove('show'); deleteUndoTimeout = null; }
async function undoDelete() { clearTimeout(deleteUndoTimeout); hideDeleteToast(); pendingDeleteId = null; await loadTasks(); }

function updateIntervalUI() {
  const val = document.getElementById('taskInterval').value;
  document.getElementById('customIntervalRow').style.display = val === 'custom' ? '' : 'none';
  document.querySelectorAll('.interval-chip').forEach(c => c.classList.toggle('active', c.dataset.value === val));
}

function setDueType(type) {
  document.getElementById('taskInterval').value = document.getElementById('taskInterval').value || 'weekly';
  document.getElementById('dueBtnInterval').classList.toggle('active', type === 'interval');
  document.getElementById('dueBtnFixed').classList.toggle('active', type === 'fixed');
  document.getElementById('intervalRow').style.display      = type === 'interval' ? '' : 'none';
  document.getElementById('customIntervalRow').style.display = type === 'interval' && document.getElementById('taskInterval').value === 'custom' ? '' : 'none';
  document.getElementById('fixedDateRow').style.display     = type === 'fixed' ? '' : 'none';
  const panel = document.getElementById('moreOptionsPanel');
  if (panel.style.display !== 'none') {
    document.getElementById('scheduleModeRow').style.display = type === 'interval' ? '' : 'none';
    document.getElementById('startDateRow').style.display    = type === 'interval' ? '' : 'none';
  }
}

function updateNotifyVisibility() {
  const enabled = document.getElementById('notifEnabled').checked;
  document.getElementById('notifyTimingSection').style.display = enabled ? '' : 'none';
}

function toggleMoreOptions() {
  const panel   = document.getElementById('moreOptionsPanel');
  const chevron = document.getElementById('moreOptionsChevron');
  const label   = document.getElementById('moreOptionsLabel');
  const open    = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  chevron.textContent = open ? '▴' : '▾';
  label.textContent   = open ? L('more_options.hide') : L('more_options.show');
  if (open) {
    const isInterval = document.getElementById('dueBtnInterval').classList.contains('active');
    document.getElementById('scheduleModeRow').style.display = isInterval ? '' : 'none';
    document.getElementById('startDateRow').style.display    = isInterval ? '' : 'none';
    updateNotifyVisibility();
  }
}

// keep legacy alias used by saveTask
function updateDueModeUI() {
  const isInterval = document.getElementById('dueBtnInterval').classList.contains('active');
  setDueType(isInterval ? 'interval' : 'fixed');
}

function populateRoomSelect(sel) {
  document.getElementById('taskRoom').innerHTML = rooms.map(r => `<option value="${r.id}" ${r.id===sel?'selected':''}>${r.icon} ${r.name}</option>`).join('');
}

function populateAssigneeSelect(sel) {
  document.getElementById('taskAssignee').innerHTML =
    users.map(u => `<option value="${u.id}" ${u.id===sel?'selected':''}>${u.name}</option>`).join('') +
    `<option value="alle" ${sel==='alle'?'selected':''}>${L('tab.all')}</option>`;
}

function _initIntervalChips() {
  document.querySelectorAll('.interval-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('taskInterval').value = chip.dataset.value;
      updateIntervalUI();
    });
  });
}

function openAddModal() {
  editingTaskId=null;
  document.getElementById('modalTitle').textContent=L('modal.new_task');
  document.getElementById('taskName').value='';
  populateRoomSelect(currentGroup!=='alle'?currentGroup:'general');
  populateAssigneeSelect(currentView==='alle'?(users[0]?.id||'alle'):currentView);
  document.getElementById('taskPriority').value='normal';
  document.getElementById('taskInterval').value='weekly';
  document.getElementById('taskIntervalCustomDays').value='';
  document.getElementById('taskScheduleMode').value='strict';
  document.getElementById('taskStartDate').value='';
  document.getElementById('taskDueDate').value='';
  document.getElementById('taskDueTime').value='';
  document.getElementById('taskNotifyOffset').value='0';
  document.getElementById('taskNotifyTimeWeekday').value='';
  document.getElementById('taskNotifyTimeWeekend').value='';
  document.getElementById('notifEnabled').checked=true;
  updateNotifyVisibility();
  document.getElementById('subtaskInputList').innerHTML='';
  // reset progressive disclosure
  document.getElementById('moreOptionsPanel').style.display='none';
  document.getElementById('moreOptionsChevron').textContent='▾';
  document.getElementById('moreOptionsLabel').textContent=L('more_options.show');
  setDueType('interval');
  updateIntervalUI();
  _initIntervalChips();
  document.getElementById('taskModal').classList.add('open');
  setTimeout(()=>document.getElementById('taskName').focus(), 300);
}

function openEditModal(id) {
  const task=tasks.find(t=>t.id===id); if(!task) return;
  editingTaskId=id;
  document.getElementById('modalTitle').textContent=L('modal.edit_task');
  document.getElementById('taskName').value=task.name;
  populateRoomSelect(task.room||'general');
  populateAssigneeSelect(task.assignee);
  document.getElementById('taskPriority').value=task.priority||'normal';
  document.getElementById('taskScheduleMode').value=task.scheduleMode||'strict';
  const hasCustom = task.intervalCustomDays != null;
  const intervalVal = hasCustom ? 'custom' : (task.interval||'weekly');
  document.getElementById('taskInterval').value = intervalVal;
  document.getElementById('taskIntervalCustomDays').value = hasCustom ? task.intervalCustomDays : '';
  document.getElementById('taskStartDate').value=task.startDate||'';
  document.getElementById('taskDueDate').value=task.dueDate||'';
  document.getElementById('taskDueTime').value=task.dueTime||'';
  document.getElementById('taskNotifyOffset').value=String(task.notifyOffset||0);
  document.getElementById('taskNotifyTimeWeekday').value=task.notifyTimeWeekday||'';
  document.getElementById('taskNotifyTimeWeekend').value=task.notifyTimeWeekend||'';
  document.getElementById('notifEnabled').checked=task.notify !== false;
  updateNotifyVisibility();
  document.getElementById('subtaskInputList').innerHTML='';
  (task.subtasks||[]).forEach(s => addSubtaskInput(s.name, s.id, s.done));
  setDueType(task.dueDate ? 'fixed' : 'interval');
  updateIntervalUI();
  _initIntervalChips();
  document.getElementById('moreOptionsPanel').style.display = 'none';
  document.getElementById('moreOptionsChevron').textContent = '▾';
  document.getElementById('moreOptionsLabel').textContent = L('more_options.show');
  document.getElementById('taskModal').classList.add('open');
}

function closeTaskModal() { document.getElementById('taskModal').classList.remove('open'); }

function addSubtaskInput(name='', id=null, done=false) {
  const row = document.createElement('div');
  row.className = 'subtask-input-row';
  row.dataset.id = id || `sub_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  row.innerHTML = `<input type="checkbox" class="subtask-done-check" ${done?'checked':''}><input type="text" class="subtask-name-input" placeholder="${L('placeholder.subtask')}" value="${name.replace(/"/g,'&quot;')}"><button type="button" class="del-btn" onclick="this.closest('.subtask-input-row').remove()">✕</button>`;
  document.getElementById('subtaskInputList').appendChild(row);
}

function gatherSubtasks() {
  return [...document.querySelectorAll('#subtaskInputList .subtask-input-row')]
    .map(row => ({
      id:   row.dataset.id,
      name: row.querySelector('.subtask-name-input').value.trim(),
      done: row.querySelector('.subtask-done-check').checked
    }))
    .filter(s => s.name);
}

async function saveTask() {
  const mode = document.getElementById('dueBtnFixed').classList.contains('active') ? 'fixed' : 'interval';
  const body = {
    name:               document.getElementById('taskName').value.trim(),
    room:               document.getElementById('taskRoom').value,
    assignee:           document.getElementById('taskAssignee').value,
    priority:           document.getElementById('taskPriority').value,
    scheduleMode:       document.getElementById('taskScheduleMode').value,
    interval:           document.getElementById('taskInterval').value,
    intervalCustomDays: document.getElementById('taskInterval').value === 'custom' ? Number(document.getElementById('taskIntervalCustomDays').value)||null : null,
    startDate:          mode==='interval' ? document.getElementById('taskStartDate').value||null : null,
    dueDate:            mode==='fixed'    ? document.getElementById('taskDueDate').value||null    : null,
    dueTime:              document.getElementById('taskDueTime').value||null,
    notifyOffset:         Number(document.getElementById('taskNotifyOffset').value)||0,
    notifyTimeWeekday:    document.getElementById('taskNotifyTimeWeekday').value||null,
    notifyTimeWeekend:    document.getElementById('taskNotifyTimeWeekend').value||null,
    notify: document.getElementById('notifEnabled').checked,
    subtasks: gatherSubtasks()
  };
  if(!body.name) { alert(L('alert.no_name')); return; }
  const saveBtn = document.querySelector('#taskModal .btn-primary');
  btnLoading(saveBtn, true);
  try {
    await fetch(editingTaskId ? `api/tasks/${editingTaskId}` : 'api/tasks', { method: editingTaskId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    closeTaskModal();
    await loadTasks();
  } finally { btnLoading(saveBtn, false); }
}

function renderUserList() {
  document.getElementById('userList').innerHTML = users.map((u, i) => `
    <div class="user-card">
      <div class="user-card-top">
        <input type="color" value="${u.color}" oninput="users[${i}].color=this.value" title="Color" />
        <input class="user-name-input" type="text" value="${u.name}" placeholder="Name" oninput="users[${i}].name=this.value" />
        <button class="del-btn" onclick="removeUser(${i})">✕</button>
      </div>
      <div class="user-card-fields">
        <div class="user-field-row">
          <span class="user-field-label">Email</span>
          <input type="email" value="${u.email || ''}" placeholder="name@example.com" oninput="users[${i}].email=this.value" />
        </div>
        <div class="user-field-row">
          <span class="user-field-label">HA service</span>
          <input type="text" value="${u.haService || ''}" placeholder="mobile_app_phone" oninput="users[${i}].haService=this.value" />
        </div>
      </div>
    </div>`
  ).join('');
}

function addUserRow() { const color=USER_COLORS[users.length%USER_COLORS.length]; users.push({id:'user_'+Date.now(),name:'',email:'',haService:'',color}); renderUserList(); }
function removeUser(i) { users.splice(i,1); renderUserList(); }

async function importHaPersons() {
  try {
    const persons = await (await fetch('api/ha-persons')).json();
    if (persons.error) { alert('Error: ' + persons.error); return; }
    if (!persons.length) { alert('No person.* entities found in HA.'); return; }
    persons.forEach((p, idx) => { if (!users.find(u => u.id === p.id)) users.push({ id: p.id, name: p.name, email:'', haService:'', color: USER_COLORS[(users.length+idx)%USER_COLORS.length] }); });
    renderUserList();
    alert(`${persons.length} person(s) imported from HA. Please fill in the HA service field.`);
  } catch(e) { alert('Import error: ' + e.message); }
}

function renderRoomList() {
  document.getElementById('roomList').innerHTML = rooms.map((r,i) => `
    <div class="list-row">
      <input class="icon-input" type="text" value="${r.icon}" placeholder="🏠" oninput="rooms[${i}].icon=this.value" />
      <input class="flex1" type="text" value="${r.name}" placeholder="Room name" oninput="rooms[${i}].name=this.value" />
      <button class="del-btn" onclick="removeRoom(${i})">✕</button>
    </div>`).join('');
}

function addRoomRow() { rooms.push({id:'room_'+Date.now(),name:'',icon:'🏠'}); renderRoomList(); }
function removeRoom(i) { rooms.splice(i,1); renderRoomList(); }

function renderTriggerList() {
  document.getElementById('triggerList').innerHTML = triggers.map((t,i) => `
    <div class="trigger-card">
      <div class="trigger-header">
        <input type="checkbox" class="trigger-enabled" ${t.enabled?'checked':''} onchange="triggers[${i}].enabled=this.checked" title="Active" />
        <input type="text" value="${t.taskName||''}" placeholder="Task name (e.g. Empty dishwasher)"
          style="flex:1;padding:6px 9px;background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-sm);font-size:0.85rem;color:var(--text);outline:none;"
          oninput="triggers[${i}].taskName=this.value" />
        <button class="del-btn" onclick="removeTrigger(${i})">✕</button>
      </div>
      <div class="trigger-grid">
        <div><label>Entity ID</label><input type="text" list="entitySuggestions" value="${t.entityId||''}" placeholder="sensor.dishwasher" oninput="triggers[${i}].entityId=this.value" /></div>
        <div><label>On state</label><input type="text" value="${t.toState||''}" placeholder="e.g. on, done, 100" oninput="triggers[${i}].toState=this.value" /></div>
        <div><label>Room</label><select onchange="triggers[${i}].room=this.value">${rooms.map(r=>`<option value="${r.id}" ${r.id===t.room?'selected':''}>${r.icon} ${r.name}</option>`).join('')}</select></div>
        <div><label>Assigned to</label><select onchange="triggers[${i}].assignee=this.value">${users.map(u=>`<option value="${u.id}" ${u.id===t.assignee?'selected':''}>${u.name}</option>`).join('')}<option value="alle" ${'alle'===t.assignee?'selected':''}>All</option></select></div>
        <div><label>Due time</label><input type="time" value="${t.dueTime||''}" oninput="triggers[${i}].dueTime=this.value||null" /></div>
        <div><label>Notify</label><select onchange="triggers[${i}].notifyOffset=Number(this.value)"><option value="0" ${(t.notifyOffset||0)===0?'selected':''}>Immediately</option><option value="15" ${t.notifyOffset===15?'selected':''}>15 min before</option><option value="30" ${t.notifyOffset===30?'selected':''}>30 min before</option><option value="60" ${t.notifyOffset===60?'selected':''}>1 hr before</option></select></div>
      </div>
      <div style="display:flex;gap:12px;margin-top:8px;padding:0 2px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text2);cursor:pointer;"><input type="checkbox" ${t.notify!==false?'checked':''} onchange="triggers[${i}].notify=this.checked"> Notify</label>
      </div>
      ${t.lastState?`<div style="margin-top:6px;font-size:0.7rem;color:var(--text3);">Last state: <strong style="color:var(--text2)">${t.lastState}</strong></div>`:''}
    </div>`
  ).join('') || '<div style="font-size:0.8rem;color:var(--text3);padding:8px 0;">No triggers configured yet.</div>';
}

function addTriggerRow() {
  triggers.push({ id:'trigger_'+Date.now(), enabled:true, entityId:'', toState:'', taskName:'', assignee:'alle', room:'general', dueTime:null, notifyOffset:0, lastState:null, notify:true });
  renderTriggerList();
}
function removeTrigger(i) { triggers.splice(i,1); renderTriggerList(); }

async function loadHaEntities() {
  try {
    const entities = await (await fetch('api/ha-entities')).json();
    if (entities.error) { alert('Error: '+entities.error); return; }
    document.getElementById('entitySuggestions').innerHTML = entities.map(e => `<option value="${e.entityId}" label="${e.friendlyName} [${e.state}]">`).join('');
    alert(`${entities.length} entities loaded. Type in the Entity ID field to search.`);
  } catch(e) { alert('Error: '+e.message); }
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab-panel').forEach(p => { p.style.display = p.dataset.tab === tab ? '' : 'none'; });
  document.querySelectorAll('.settings-tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); });
}

async function openSettings() {
  const s = await (await fetch('api/settings')).json();
  users    = (s.users && s.users.length)    ? s.users    : users;
  rooms    = (s.rooms && s.rooms.length)    ? s.rooms    : rooms;
  triggers = s.haTriggers || [];
  document.getElementById('archiveDays').value  = s.archiveDays  ?? 180;
  document.getElementById('planningDays').value = s.planningDays ?? 7;
  document.getElementById('settingsTimezone').value = s.timezone || 'UTC';
  document.getElementById('timezoneDisplay').textContent = s.timezone || 'UTC';
  document.getElementById('gamificationToggle').checked = s.gamificationEnabled !== false;
  document.getElementById('weeklySummaryToggle').checked = s.weeklySummaryEnabled !== false;
  document.getElementById('completionNotifyToggle').checked = s.completionNotify !== false;
  document.getElementById('repeatNotifyHours').value = s.repeatNotifyHours ?? 24;
  document.getElementById('vacationToggle').checked = !!s.vacationEnabled;
  document.getElementById('vacationFrom').value = s.vacationFrom || '';
  document.getElementById('vacationTo').value   = s.vacationTo   || '';
  toggleVacationFields();
  document.getElementById('haUrl').value     = s.haUrl    || '';
  document.getElementById('haToken').value   = '';
  document.getElementById('addonUrl').value  = s.addonUrl || '';
  const baseUrl = (s.addonUrl || s.haUrl || '').replace(/\/$/, '');
  document.getElementById('icalUrl').value        = baseUrl ? baseUrl + '/api/calendar.ics' : '';
  document.getElementById('icalUrl').placeholder  = baseUrl ? '' : 'Set Addon URL above first';
  document.getElementById('icalCopyBtn').disabled = !baseUrl;
  document.getElementById('gmailUser').value = s.gmailUser || '';
  document.getElementById('gmailPass').value = '';
  renderUserList(); renderRoomList(); renderTriggerList();
  switchSettingsTab('general');
  document.getElementById('settingsModal').classList.add('open');
}

function toggleVacationFields() {
  const enabled = document.getElementById('vacationToggle').checked;
  document.getElementById('vacationFrom').disabled = !enabled;
  document.getElementById('vacationTo').disabled   = !enabled;
}

function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }

function copyIcalUrl() {
  const el = document.getElementById('icalUrl');
  if (navigator.clipboard) { navigator.clipboard.writeText(el.value); } else { el.select(); document.execCommand('copy'); }
}

function copyCalIcalUrl() {
  const el = document.getElementById('calIcalUrl');
  if (navigator.clipboard) { navigator.clipboard.writeText(el.value); } else { el.select(); document.execCommand('copy'); }
}

async function syncTimezoneFromHA() {
  try {
    const result = await fetch('/api/sync-timezone').then(r => r.json());
    document.getElementById('settingsTimezone').value = result.timezone;
    document.getElementById('timezoneDisplay').textContent = result.timezone;
    showNotification(`✓ Timezone synced: ${result.timezone}`);
  } catch(e) {
    showNotification('✗ Failed to sync timezone from HA', true);
  }
}

async function saveSettings() {
  const haTokenVal = document.getElementById('haToken').value;
  users = users.filter(u => u.name.trim()).map(u => ({ ...u, id: u.id.startsWith('user_') ? u.name.toLowerCase().replace(/[^a-z0-9]/g,'_') : u.id }));
  const body = {
    users,
    rooms:              rooms.filter(r => r.name.trim()),
    haTriggers:         triggers.filter(t => t.entityId.trim() && t.toState.trim()),
    archiveDays:        Number(document.getElementById('archiveDays').value)  || 180,
    planningDays:       Number(document.getElementById('planningDays').value) || 7,
    timezone:           document.getElementById('settingsTimezone').value || 'UTC',
    gamificationEnabled:  document.getElementById('gamificationToggle').checked,
    weeklySummaryEnabled: document.getElementById('weeklySummaryToggle').checked,
    completionNotify:     document.getElementById('completionNotifyToggle').checked,
    repeatNotifyHours:    Number(document.getElementById('repeatNotifyHours').value) || 24,
    vacationEnabled:      document.getElementById('vacationToggle').checked,
    vacationFrom:         document.getElementById('vacationFrom').value || null,
    vacationTo:           document.getElementById('vacationTo').value   || null,
    haUrl:              document.getElementById('haUrl').value.trim(),
    addonUrl:           document.getElementById('addonUrl').value.trim(),
    gmailUser:          document.getElementById('gmailUser').value.trim(),
    gmailAppPassword:   document.getElementById('gmailPass').value,
    ...(haTokenVal ? {haToken: haTokenVal} : {})
  };
  const saveBtn = document.querySelector('#settingsModal .btn-primary');
  btnLoading(saveBtn, true);
  try {
    await fetch('api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    closeSettings();
    await loadSettings();
    render();
  } finally { btnLoading(saveBtn, false); }
}

['taskModal','settingsModal','commentModal','nlpModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target !== e.currentTarget) return;
    if (id==='taskModal') closeTaskModal();
    else if (id==='settingsModal') closeSettings();
    else if (id==='nlpModal') closeNlpModal();
    else submitComment(false);
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeTaskModal(); closeSettings(); submitComment(false); closeNlpModal(); }
  if (e.key === 'Enter' && document.getElementById('commentModal').classList.contains('open')) submitComment(true);
});

async function exportData() {
  const res  = await fetch('api/export');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `steward-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

async function handleImport(input) {
  const file = input.files[0]; input.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch(e) { alert(L('alert.invalid_json')); return; }
  if (!confirm(L('confirm.import', {n: data.tasks?.length ?? '?'}))) return;
  let res, result;
  try {
    res    = await fetch('api/import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    result = await res.json();
  } catch(e) { alert(L('alert.import_failed', {error: e.message + (res ? ' (HTTP ' + res.status + ')' : '')})); return; }
  if (result.success) {
    alert(L('alert.import_success', {tasks: result.tasks, completions: result.completions}));
    closeSettings(); await loadSettings(); await loadTasks(); await loadStats();
  } else { alert('Import failed: ' + result.error); }
}

function showNotification(msg, isError = false) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${isError ? 'var(--red)' : 'var(--green)'};color:#fff;padding:9px 18px;border-radius:20px;font-size:0.84rem;font-weight:500;z-index:600;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.25);pointer-events:none;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Haptic & animation helpers ──────────────────────────────────────────────
function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

function spawnPulseRing(x, y) {
  const ring = document.createElement('div');
  ring.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:36px;height:36px;border-radius:50%;border:2.5px solid rgba(74,222,128,0.7);transform:translate(-50%,-50%);pointer-events:none;z-index:9999;animation:checkPulse 0.55s ease-out forwards;`;
  document.body.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove());
}

function spawnConfetti(x, y) {
  const colors = ['#5b9cf6','#f472b6','#a78bfa','#34d399','#fb923c','#f87171'];
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    const angle = (i / 14) * 360 + Math.random() * 26;
    const dist  = 35 + Math.random() * 55;
    dot.style.setProperty('--tx', (Math.cos(angle * Math.PI / 180) * dist).toFixed(1) + 'px');
    dot.style.setProperty('--ty', (Math.sin(angle * Math.PI / 180) * dist).toFixed(1) + 'px');
    dot.style.setProperty('--r',  (Math.random() * 720 - 360).toFixed(0) + 'deg');
    dot.style.background = colors[i % colors.length];
    dot.style.left = x + 'px';
    dot.style.top  = y + 'px';
    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }
}

// ── Photo capture ───────────────────────────────────────────────────────────
async function compressPhoto(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 240;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else       { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoInput(input) {
  const file = input.files[0]; if (!file) return;
  pendingPhoto = await compressPhoto(file);
  document.getElementById('photoPreview').src            = pendingPhoto;
  document.getElementById('photoPreview').style.display  = '';
  document.getElementById('photoClearBtn').style.display = '';
  const addBtn = document.getElementById('photoAddBtn');
  addBtn.dataset.i18n = 'photo.change';
  addBtn.textContent  = L('photo.change');
}

function clearPhoto() {
  pendingPhoto = null;
  document.getElementById('photoInput').value            = '';
  document.getElementById('photoPreview').style.display  = 'none';
  document.getElementById('photoClearBtn').style.display = 'none';
  const addBtn = document.getElementById('photoAddBtn');
  addBtn.dataset.i18n = 'photo.add';
  addBtn.textContent  = L('photo.add');
}

// ── NLP Quick-Add ───────────────────────────────────────────────────────────
const NLP_ORDINAL_DAYS = {
  zweiten:2, dritten:3, vierten:4, fünften:5, sechsten:6, siebten:7, achten:8, neunten:9, zehnten:10,
  second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7, eighth:8, ninth:9, tenth:10
};
const NLP_WEEKDAYS = {
  montag:1, dienstag:2, mittwoch:3, donnerstag:4, freitag:5, samstag:6, sonntag:0,
  monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0
};
const NLP_RELATIVE_DAYS = { heute:0, today:0, morgen:1, tomorrow:1, übermorgen:2 };
// Strip conversational lead-ins ("Ich möchte …", "I want to …") that carry no task info
const NLP_LEAD_IN = /^(?:ich\s+(?:möchte|will|muss|sollte)(?:\s+gerne)?|ich\s+würde\s+gerne|i\s+(?:want|need)\s+to|i'd\s+like\s+to|i\s+should)\s+/i;

function parseNLP(text) {
  const result = { name: text.trim(), interval: 'weekly', intervalCustomDays: null, dueDate: null, dueTime: null, startDate: null, assignee: null, room: null };
  const working = text.replace(NLP_LEAD_IN, '');

  // Time of day: "um 17:00 Uhr", "17 Uhr", "at 5pm"
  const timeMatch = working.match(/\b(?:um\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/i);
  const ampmMatch = !timeMatch && working.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    result.dueTime = `${timeMatch[1].padStart(2,'0')}:${(timeMatch[2]||'00').padStart(2,'0')}`;
  } else if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10) % 12;
    if (/pm/i.test(ampmMatch[3])) h += 12;
    result.dueTime = `${String(h).padStart(2,'0')}:${(ampmMatch[2]||'00').padStart(2,'0')}`;
  }
  const timeFullMatch = timeMatch || ampmMatch;

  // Recurrence / due-date detection — most specific wins
  const dateMatch     = working.match(/(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?(?!\s*uhr)/i);
  // Negative lookbehind excludes "jeden/jede/every Morgen" (= "every morning", a recurrence, not "tomorrow")
  const relMatch      = working.match(/(?<![\p{L}\p{N}_])(?<!jeden\s)(?<!jede\s)(?<!every\s)(übermorgen|morgen|heute|tomorrow|today)(?![\p{L}\p{N}_])/iu);
  const weekdayMatch  = working.match(/\b(?:jeden|jede|every)\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i)
                     || working.match(/\b(montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)\b/i);
  let customMatch = working.match(/\balle\s+(\d+)\s+tage\b/i) || working.match(/\bevery\s+(\d+)\s+days\b/i);
  let customDays  = customMatch ? parseInt(customMatch[1], 10) : null;
  if (!customDays) {
    const ordMatch = working.match(/\b(?:jeden|every)\s+(\w+)\s+(?:tag|day)\b/i);
    if (ordMatch && NLP_ORDINAL_DAYS[ordMatch[1].toLowerCase()]) { customDays = NLP_ORDINAL_DAYS[ordMatch[1].toLowerCase()]; customMatch = ordMatch; }
  }
  if (!customDays && /\bevery other day\b/i.test(working)) { customDays = 2; customMatch = working.match(/\bevery other day\b/i); }

  let recurrenceMatch = null;
  if (dateMatch) {
    const d = dateMatch[1].padStart(2, '0'), m = dateMatch[2].padStart(2, '0');
    const y = dateMatch[3] ? (dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3]) : new Date().getFullYear();
    result.dueDate = `${y}-${m}-${d}`; result.interval = 'once'; result.intervalCustomDays = null;
    recurrenceMatch = dateMatch;
  } else if (relMatch) {
    const days = NLP_RELATIVE_DAYS[relMatch[1].toLowerCase()];
    const d = new Date(); d.setDate(d.getDate() + days);
    result.dueDate = d.toISOString().slice(0, 10); result.interval = 'once'; result.intervalCustomDays = null;
    recurrenceMatch = relMatch;
  } else if (weekdayMatch) {
    const dow = NLP_WEEKDAYS[weekdayMatch[1].toLowerCase().replace(/s$/, '')];
    const d = new Date(); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
    result.startDate = d.toISOString().slice(0, 10); result.interval = 'weekly'; result.intervalCustomDays = null;
    recurrenceMatch = weekdayMatch;
  } else if (customDays >= 2) {
    result.interval = 'custom'; result.intervalCustomDays = customDays;
    recurrenceMatch = customMatch;
  }
  else if (/täglich|every day|daily|jeden\s+(?:tag|morgen|abend)|every\s+(?:morning|evening|night)/i.test(working)) result.interval = 'daily';
  else if (/zweiwöchentlich|every two weeks|biweekly|alle 2 wochen/i.test(working)) result.interval = 'biweekly';
  else if (/monatlich|every month|monthly/i.test(working))                  result.interval = 'monthly';
  else if (/vierteljährlich|quarterly/i.test(working))                      result.interval = 'quarterly';
  else if (/wöchentlich|every week|weekly/i.test(working))                  result.interval = 'weekly';

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let cleanName = working;
  users.forEach(u => { const re = new RegExp('\\b' + esc(u.name) + '\\b', 'gi'); if (re.test(working)) { result.assignee = u.id; cleanName = cleanName.replace(re, ''); } });
  rooms.forEach(r => { const re = new RegExp('\\b' + esc(r.name) + '\\b', 'gi'); if (re.test(working)) { result.room = r.id; cleanName = cleanName.replace(re, ''); } });
  cleanName = cleanName
    .replace(/täglich|every day|daily|jeden\s+(?:tag|morgen|abend)|every\s+(?:morning|evening|night)|zweiwöchentlich|every two weeks|biweekly|alle 2 wochen|monatlich|every month|monthly|vierteljährlich|quarterly|wöchentlich|every week|weekly/gi, '')
    .replace(recurrenceMatch ? recurrenceMatch[0] : /(?:)/, '')
    .replace(timeFullMatch ? timeFullMatch[0] : /(?:)/, '')
    .trim().replace(/\s+/g, ' ')
    .replace(/^(?:der|die|das|den|dem|the|a|an)\s+/i, '')
    .replace(/\s+(?:der|die|das|den|dem|the|a|an)$/i, '')
    .replace(/[.,;:]+\s*$/, '').trim()
    .replace(/\s+(?:am|an|um|on|at)$/i, '')
    .trim();
  if (cleanName) result.name = cleanName;
  return result;
}

function updateNlpTags() {
  const text = document.getElementById('nlpInput').value;
  if (!text.trim()) { document.getElementById('nlpTags').innerHTML = ''; return; }
  const p = parseNLP(text);
  const tags = [];
  if (p.interval === 'custom' && p.intervalCustomDays) tags.push(`<span class="nlp-tag">${L('interval.custom', {days: p.intervalCustomDays})}</span>`);
  else if (p.interval && p.interval !== 'once') tags.push(`<span class="nlp-tag">${L('interval.' + p.interval) || p.interval}</span>`);
  if (p.dueDate)  tags.push(`<span class="nlp-tag">${p.dueDate}${p.dueTime ? ' ' + p.dueTime : ''}</span>`);
  else if (p.startDate) tags.push(`<span class="nlp-tag">${p.startDate}${p.dueTime ? ' ' + p.dueTime : ''}</span>`);
  else if (p.dueTime) tags.push(`<span class="nlp-tag">${p.dueTime}</span>`);
  if (p.assignee) { const u = users.find(u => u.id === p.assignee); if (u) tags.push(`<span class="nlp-tag" style="border-color:${u.color};color:${u.color}">${u.name}</span>`); }
  if (p.room)     { const r = rooms.find(r => r.id === p.room); if (r) tags.push(`<span class="nlp-tag">${r.icon} ${r.name}</span>`); }
  document.getElementById('nlpTags').innerHTML = tags.join('');
}

function openNlpModal() {
  document.getElementById('nlpInput').value = '';
  document.getElementById('nlpTags').innerHTML = '';
  document.getElementById('nlpModal').classList.add('open');
  setTimeout(() => document.getElementById('nlpInput').focus(), 300);
}
function closeNlpModal() { document.getElementById('nlpModal').classList.remove('open'); }

async function submitNlp() {
  const text = document.getElementById('nlpInput').value.trim();
  if (!text) return;
  const p = parseNLP(text);
  const body = {
    name:      p.name || text,
    interval:  p.interval || 'weekly',
    intervalCustomDays: p.intervalCustomDays || null,
    dueDate:   p.dueDate  || null,
    dueTime:   p.dueTime  || null,
    startDate: p.startDate || null,
    assignee:  p.assignee || (currentView !== 'alle' ? currentView : (users[0]?.id || 'alle')),
    room:      p.room     || (currentGroup !== 'alle' ? currentGroup : 'general'),
    priority:  'normal',
    notify: true
  };
  const btn = document.querySelector('#nlpModal .btn-primary');
  btnLoading(btn, true);
  try {
    await fetch('api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    closeNlpModal();
    await loadTasks();
  } finally { btnLoading(btn, false); }
}

// ── Long-press context menu ─────────────────────────────────────────────────
function onTaskInfoClick(id) {
  if (wasLongPress) { wasLongPress = false; return; }
  openEditModal(id);
}

function initLongPress() {
  let lpTimer = null, lpActive = false;
  const container = document.getElementById('taskMain');
  container.addEventListener('touchstart', e => {
    const card = e.target.closest('[data-id]'); if (!card) return;
    if (!e.target.closest('.task-info')) return;
    const id = card.dataset.id;
    lpActive = false;
    lpTimer = setTimeout(() => {
      lpActive = true;
      wasLongPress = true;
      vibrate(40);
      const ctxBtn = card.querySelector('.task-action-btn');
      const fakeE  = { stopPropagation: () => {}, currentTarget: ctxBtn || e.target, target: ctxBtn || e.target };
      openCtxMenu(fakeE, id);
    }, 500);
  }, {passive: true});
  container.addEventListener('touchmove', () => { clearTimeout(lpTimer); lpTimer = null; }, {passive: true});
  container.addEventListener('touchend', () => {
    clearTimeout(lpTimer); lpTimer = null;
    if (lpActive) {
      lpActive = false;
      // intercept the synthetic click that fires after touchend so it doesn't immediately close the menu
      document.addEventListener('click', function killOnce(ev) {
        ev.stopPropagation();
        document.removeEventListener('click', killOnce, true);
      }, {capture: true, once: true});
    }
  }, {passive: true});
}

init();

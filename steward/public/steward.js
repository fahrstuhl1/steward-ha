let tasks=[], users=[], rooms=[], triggers=[], currentView='alle', currentGroup='alle';
let showDone=false, editingTaskId=null, collapsedRooms=new Set();
let pendingCompleteId=null, pendingCompleteUserId=null;
let statsData=null, statsPeriod='week';
let gamificationEnabled=true, searchOpen=false, calendarOpen=false;
let planningOpen=false, archiveOpen=false, planningDays=7;
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth(), calSelectedDay=null;

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
    if (dx > 0 && (task.isDue || task.isSoon)) toggleComplete(id);
    else if (dx < 0) snoozeTask(id);
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
}

async function loadStats() {
  try {
    statsData = await (await fetch('api/stats')).json();
    gamificationEnabled = statsData.gamificationEnabled !== false;
    renderStatsBadges();
    if (currentView==='stats') renderStatsView();
  } catch(e){}
}

async function loadTasks() { tasks = await (await fetch('api/tasks')).json(); render(); }

async function loadSettings() {
  const s = await (await fetch('api/settings')).json();
  users = (s.users && s.users.length) ? s.users : [];
  rooms = (s.rooms && s.rooms.length) ? s.rooms : DEFAULT_ROOMS;
  if (!users.find(u => u.id === currentView)) { currentView = users.length === 1 ? users[0].id : 'alle'; }
  planningDays = s.planningDays ?? 7;
  if (s.theme) applyTheme(s.theme);
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
      return `<div class="archive-item"><div class="archive-icon">${PRIORITY_ICON[e.priority||'normal']}</div><div class="archive-info"><div class="archive-name">${e.name}</div><div class="archive-meta">${room ? room.icon+' '+room.name : e.room} · ${u ? u.name : e.completedBy} · ${date}</div>${e.comment ? `<div class="archive-comment">💬 ${e.comment}</div>` : ''}</div></div>`;
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

function render() { renderHeader(); renderGroupTabs(); renderTasks(); }

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
      <div class="section-body">${visible.length ? `<div class="task-list">${visible.map(taskCard).join('')}</div>` : `<div class="waiting-placeholder">${L('section.waiting_hidden', {n: waiting.length})}</div>`}</div>
    </div>`;
  });
  document.getElementById('taskContainer').innerHTML = html || `<div class="empty-state">${L('empty.all_done')}</div>`;
  const btn=document.getElementById('showDoneBtn');
  if(showDone) btn.textContent=L('tasks.hide_future');
  else if(totalWaiting>0) btn.textContent=L('tasks.show_waiting_count', {n: totalWaiting});
  else btn.textContent=L('tasks.show_future');
}

function getUserById(id) { return users.find(u => u.id === id); }

function taskCard(t) {
  const isNow      = t.isDue;
  const isSoonFlag = !isNow && t.isSoon;
  const isWaiting  = !isNow && !isSoonFlag && t.lastCompleted && !t.dueDate;
  const isDone     = !isNow && !isSoonFlag && !isWaiting;
  const isTomorrow = isDone && t.nextDueData?.key === 'due.tomorrow';
  const cardClass  = isNow ? 'due-now' : isSoonFlag ? 'due-soon' : isTomorrow ? 'due-today' : isWaiting ? 'waiting' : 'done';
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
  const snoozeHint    = t.snoozedUntil && new Date(t.snoozedUntil) > new Date() ? `<div class="snooze-hint">${L('snooze.hint', {time: new Date(t.snoozedUntil).toLocaleTimeString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', {hour:'2-digit',minute:'2-digit'})})}</div>` : '';
  const commentLine   = t.lastComment ? `<div class="comment-text">💬 ${t.lastComment}</div>` : '';
  const snoozeBtn     = (isNow || isSoonFlag) ? `<button class="task-action-btn" onclick="snoozeTask('${t.id}')" title="Snooze">⏰</button>` : '';
  const skipBtn       = !t.dueDate ? `<button class="task-action-btn" onclick="skipTask('${t.id}')" title="${L('btn.skip_task')}">⏩</button>` : '';
  const dupeBtn       = `<button class="task-action-btn" onclick="duplicateTask('${t.id}')" title="${L('btn.duplicate')}">⧉</button>`;
  const checkIcon     = isWaiting ? '⏳' : '✓';
  const nextDueStr    = formatNextDue(t.nextDueData) || t.nextDue;
  const waitingLabel  = isWaiting ? `<span class="due-label muted">⏳ ${L('state.waiting')} · ${nextDueStr}</span>` : `<span class="due-label ${dueClass}">${nextDueStr}</span>`;

  return `<div class="task-card ${cardClass}" data-id="${t.id}">
    <button class="check-btn" onclick="toggleComplete('${t.id}')">${checkIcon}</button>
    <div class="task-info">
      <div class="task-name">${priorityDot}${t.name}</div>
      <div class="task-meta">${badgeHtml}<span class="meta-dot">·</span><span class="meta-text">${intervalLabel}</span><span class="meta-dot">·</span>${waitingLabel}${notifyHint}</div>
      ${snoozeHint}${commentLine}
    </div>
    <div class="task-actions">${snoozeBtn}${skipBtn}${dupeBtn}<button class="task-action-btn" onclick="openEditModal('${t.id}')">✏</button><button class="task-action-btn" onclick="deleteTask('${t.id}')">✕</button></div>
  </div>`;
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
    await fetch(`api/tasks/${id}/reset`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId}) });
    await loadTasks();
  }
}

async function submitComment(save) {
  document.getElementById('commentModal').classList.remove('open');
  if (!pendingCompleteId) return;
  const comment = save ? document.getElementById('commentInput').value.trim() : null;
  const userId  = document.getElementById('completedBySelect').value || pendingCompleteUserId;
  await fetch(`api/tasks/${pendingCompleteId}/complete`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, comment }) });
  const completedId = pendingCompleteId;
  const completedName = tasks.find(t=>t.id===completedId)?.name || '';
  pendingCompleteId = null; pendingCompleteUserId = null;
  await loadTasks();
  lastCompletedId = completedId;
  showUndoToast(completedName);
}

async function snoozeTask(id) {
  await fetch(`api/tasks/${id}/snooze`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({hours:2}) });
  await loadTasks();
}

async function skipTask(id) {
  await fetch(`api/tasks/${id}/skip`, { method:'POST' });
  await loadTasks();
}

function duplicateTask(id) {
  openEditModal(id);
  editingTaskId = null;
  document.getElementById('modalTitle').textContent = L('modal.duplicate_task');
}

async function deleteTask(id) {
  if(!confirm(L('confirm.delete_task'))) return;
  await fetch(`api/tasks/${id}`, {method:'DELETE'});
  await loadTasks();
}

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
  document.getElementById('notifHa').checked=true;
  document.getElementById('notifEmail').checked=false;
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
  document.getElementById('notifHa').checked=(task.notifications?.ha)||false;
  document.getElementById('notifEmail').checked=(task.notifications?.email)||false;
  // show advanced panel when editing (user expects all fields)
  document.getElementById('moreOptionsPanel').style.display='';
  document.getElementById('moreOptionsChevron').textContent='▴';
  document.getElementById('moreOptionsLabel').textContent=L('more_options.hide');
  setDueType(task.dueDate ? 'fixed' : 'interval');
  updateIntervalUI();
  _initIntervalChips();
  document.getElementById('taskModal').classList.add('open');
}

function closeTaskModal() { document.getElementById('taskModal').classList.remove('open'); }

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
    notifications: { ha: document.getElementById('notifHa').checked, email: document.getElementById('notifEmail').checked }
  };
  if(!body.name) { alert(L('alert.no_name')); return; }
  await fetch(editingTaskId ? `api/tasks/${editingTaskId}` : 'api/tasks', { method: editingTaskId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  closeTaskModal();
  await loadTasks();
}

function renderUserList() {
  document.getElementById('userList').innerHTML = users.map((u,i) => `
    <div class="list-row">
      <input type="color" value="${u.color}" oninput="users[${i}].color=this.value" title="Color" />
      <input class="flex1" type="text" value="${u.name}" placeholder="Name" oninput="users[${i}].name=this.value" />
      <input class="flex1" type="email" value="${u.email||''}" placeholder="Email" oninput="users[${i}].email=this.value" />
      <input class="flex1" type="text" value="${u.haService||''}" placeholder="HA service (e.g. mobile_app_phone)" oninput="users[${i}].haService=this.value" />
      <button class="del-btn" onclick="removeUser(${i})">✕</button>
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
        <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text2);cursor:pointer;"><input type="checkbox" ${t.notifications?.ha?'checked':''} onchange="triggers[${i}].notifications={...triggers[${i}].notifications,ha:this.checked}"> HA Push</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text2);cursor:pointer;"><input type="checkbox" ${t.notifications?.email?'checked':''} onchange="triggers[${i}].notifications={...triggers[${i}].notifications,email:this.checked}"> Email</label>
      </div>
      ${t.lastState?`<div style="margin-top:6px;font-size:0.7rem;color:var(--text3);">Last state: <strong style="color:var(--text2)">${t.lastState}</strong></div>`:''}
    </div>`
  ).join('') || '<div style="font-size:0.8rem;color:var(--text3);padding:8px 0;">No triggers configured yet.</div>';
}

function addTriggerRow() {
  triggers.push({ id:'trigger_'+Date.now(), enabled:true, entityId:'', toState:'', taskName:'', assignee:'alle', room:'general', dueTime:null, notifyOffset:0, lastState:null, notifications:{email:false,ha:true} });
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
  document.getElementById('haUrl').value     = s.haUrl    || '';
  document.getElementById('haToken').value   = '';
  document.getElementById('addonUrl').value  = s.addonUrl || '';
  document.getElementById('gmailUser').value = s.gmailUser || '';
  document.getElementById('gmailPass').value = '';
  renderUserList(); renderRoomList(); renderTriggerList();
  document.getElementById('settingsModal').classList.add('open');
}

function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }

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
    gamificationEnabled: document.getElementById('gamificationToggle').checked,
    haUrl:              document.getElementById('haUrl').value.trim(),
    addonUrl:           document.getElementById('addonUrl').value.trim(),
    gmailUser:          document.getElementById('gmailUser').value.trim(),
    gmailAppPassword:   document.getElementById('gmailPass').value,
    ...(haTokenVal ? {haToken: haTokenVal} : {})
  };
  await fetch('api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  closeSettings();
  await loadSettings();
  render();
}

['taskModal','settingsModal','commentModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target !== e.currentTarget) return;
    if (id==='taskModal') closeTaskModal();
    else if (id==='settingsModal') closeSettings();
    else submitComment(false);
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeTaskModal(); closeSettings(); submitComment(false); }
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

init();

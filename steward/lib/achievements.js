const ACHIEVEMENTS = [
  { id:'first_task',  icon:'🎯', title:'First Task',      desc:'First task completed',           check:(uc)=>uc.length>=1 },
  { id:'tasks_10',    icon:'✅', title:'Diligent',         desc:'10 tasks completed',              check:(uc)=>uc.length>=10 },
  { id:'tasks_50',    icon:'💪', title:'Persistent',       desc:'50 tasks completed',              check:(uc)=>uc.length>=50 },
  { id:'tasks_100',   icon:'🏆', title:'Household Pro',    desc:'100 tasks completed',             check:(uc)=>uc.length>=100 },
  { id:'streak_3',    icon:'🔥', title:'3-Day Streak',     desc:'3 consecutive days',              check:(uc,s)=>s>=3 },
  { id:'streak_7',    icon:'🔥', title:'One Week',         desc:'7-day streak',                    check:(uc,s)=>s>=7 },
  { id:'streak_30',   icon:'🔥', title:'Month Streak',     desc:'30-day streak',                   check:(uc,s)=>s>=30 },
  { id:'points_100',  icon:'⭐', title:'100 Points',       desc:'100 points collected',            check:(uc)=>uc.reduce((s,c)=>s+c.points,0)>=100 },
  { id:'points_500',  icon:'⭐', title:'500 Points',       desc:'500 points collected',            check:(uc)=>uc.reduce((s,c)=>s+c.points,0)>=500 },
  { id:'points_1000', icon:'🌟', title:'1000 Points',      desc:'1000 points collected',           check:(uc)=>uc.reduce((s,c)=>s+c.points,0)>=1000 },
  { id:'high_10',     icon:'🎖️', title:'Priority Hunter', desc:'10 high-priority tasks',          check:(uc)=>uc.filter(c=>c.points===3).length>=10 },
  { id:'speed_day',   icon:'⚡', title:'Turbo Day',        desc:'5 tasks in one day',              check:(uc)=>{ const d={}; uc.forEach(c=>{const k=c.date.slice(0,10);d[k]=(d[k]||0)+1;}); return Object.values(d).some(v=>v>=5); }},
  { id:'variety',     icon:'🗺️', title:'Explorer',        desc:'Tasks in 5+ different rooms',     check:(uc,s,tasks)=>{ const rooms=new Set(tasks.filter(t=>uc.some(c=>c.taskId===t.id)).map(t=>t.room||'general')); return rooms.size>=5; }},
];

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcStreak(completions) {
  if (!completions.length) return 0;
  const days = new Set(completions.map(c => localDateStr(new Date(c.date))));
  let streak = 0;
  const d = new Date();
  if (!days.has(localDateStr(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDateStr(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function calcAchievements(uc, streak, tasks) {
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(uc, streak, tasks) }));
}

module.exports = { ACHIEVEMENTS, localDateStr, calcStreak, calcAchievements };

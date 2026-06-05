const express = require('express');
const router  = express.Router();

const { readData } = require('../lib/data');
const { calcStreak, calcAchievements } = require('../lib/achievements');

router.get('/stats', (req, res) => {
  const data        = readData();
  const completions = data.completions || [];
  const users       = data.settings.users || [];
  const now         = new Date();

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const stats = users.map(user => {
    const uc           = completions.filter(c => c.userId === user.id);
    const pointsWeek   = uc.filter(c => new Date(c.date) >= weekStart).reduce((s,c) => s + c.points, 0);
    const pointsMonth  = uc.filter(c => new Date(c.date) >= monthStart).reduce((s,c) => s + c.points, 0);
    const pointsTotal  = uc.reduce((s,c) => s + c.points, 0);
    const streak       = calcStreak(uc);
    const achievements = calcAchievements(uc, streak, data.tasks);
    return { userId: user.id, name: user.name, color: user.color, pointsWeek, pointsMonth, pointsTotal, streak, tasksDone: uc.length, achievements };
  });

  const recent = [...completions].reverse().slice(0, 30).map(c => ({
    ...c, userName: users.find(u => u.id === c.userId)?.name || c.userId
  }));

  res.json({ stats, recent, gamificationEnabled: data.settings.gamificationEnabled !== false });
});

module.exports = router;

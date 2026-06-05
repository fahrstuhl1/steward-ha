const express = require('express');
const path    = require('path');

const { applyHaOptions }                           = require('./lib/data');
const { restoreTimers }                            = require('./lib/notifications');
const { updateHaSensors, startHaEventSubscription } = require('./lib/ha');
const taskRouter                                   = require('./routes/tasks');
const settingsRouter                               = require('./routes/settings');
const statsRouter                                  = require('./routes/stats');
require('./cron');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/tasks', taskRouter);
app.use('/api',       settingsRouter);
app.use('/api',       statsRouter);

applyHaOptions();
app.listen(PORT, () => {
  console.log(`🏠 Steward running on port ${PORT}`);
  restoreTimers();
  updateHaSensors();
  startHaEventSubscription();
});

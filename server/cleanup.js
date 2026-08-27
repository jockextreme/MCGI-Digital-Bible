const db = require('./db');

// How long an account can sit untouched before it's deleted. Configurable
// via env var since "inactive" means different things for different
// congregations; 90 days is a reasonable default for a free/open-signup app.
const INACTIVITY_DELETE_DAYS = parseInt(process.env.INACTIVITY_DELETE_DAYS, 10) || 90;

function runCleanup() {
  const result = db.prepare(`
    DELETE FROM operators
    WHERE last_active_at < datetime('now', '-' || ? || ' days')
  `).run(INACTIVITY_DELETE_DAYS);

  if (result.changes > 0) {
    console.log(`[cleanup] Removed ${result.changes} operator account(s) inactive for ${INACTIVITY_DELETE_DAYS}+ days.`);
  }
  return result.changes;
}

function touchActivity(username) {
  db.prepare(`UPDATE operators SET last_active_at = datetime('now') WHERE username = ?`).run(username);
}

function startCleanupSchedule() {
  runCleanup(); // once on boot
  const DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(runCleanup, DAY_MS);
}

module.exports = { runCleanup, touchActivity, startCleanupSchedule, INACTIVITY_DELETE_DAYS };

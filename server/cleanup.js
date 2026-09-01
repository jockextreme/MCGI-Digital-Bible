const db = require('./db');

// Operator accounts are temporary by design — they exist for the duration
// of a service, not as permanent logins. Configurable via env var, but the
// spec calls for 1 hour of inactivity by default. The Control Panel sends a
// periodic heartbeat (POST /api/auth/heartbeat) while it's open, so an
// operator who's just sitting on the page mid-service doesn't get swept.
const INACTIVITY_DELETE_MINUTES = parseInt(process.env.INACTIVITY_DELETE_MINUTES, 10) || 60;

// Runs every 5 minutes rather than once a day — with only a 1-hour TTL,
// a daily sweep would leave expired accounts lingering for most of the day.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function runCleanup() {
  const result = db.prepare(`
    DELETE FROM operators
    WHERE last_active_at < datetime('now', '-' || ? || ' minutes')
  `).run(INACTIVITY_DELETE_MINUTES);

  if (result.changes > 0) {
    console.log(`[cleanup] Removed ${result.changes} operator account(s) inactive for ${INACTIVITY_DELETE_MINUTES}+ minutes.`);
  }
  return result.changes;
}

// Accepts an operator's numeric id (their locale/operator-name identity is
// mutable in principle — the id is the stable key to update by).
function touchActivity(operatorId) {
  db.prepare(`UPDATE operators SET last_active_at = datetime('now') WHERE id = ?`).run(operatorId);
}

function startCleanupSchedule() {
  runCleanup(); // once on boot
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

module.exports = { runCleanup, touchActivity, startCleanupSchedule, INACTIVITY_DELETE_MINUTES };

const express = require('express');
const db = require('../db');
const liveState = require('../liveState');

const router = express.Router();

function buildPreview(row) {
  const payload = liveState.getCurrentPayload(row.username);
  return {
    locale: row.username,
    online: liveState.isOperatorOnline(row.username),
    viewerCount: liveState.getViewerCount(row.username),
    preview: payload ? {
      reference: `${payload.tagalogName || payload.book} ${payload.chapter}:${payload.verse}`,
      versionDisplayName: payload.versionDisplayName,
      text: payload.text
    } : null
  };
}

// GET /api/operators/online — PUBLIC operators whose console is currently
// connected, each with a small live preview of what they're showing (like a
// video thumbnail). This powers the homepage directory.
router.get('/online', (req, res) => {
  const usernames = liveState.listOnlineUsernames();
  if (!usernames.length) return res.json([]);

  const placeholders = usernames.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT username, display_name AS displayName FROM operators
    WHERE username IN (${placeholders}) AND is_public = 1
  `).all(...usernames);

  res.json(rows.map(buildPreview));
});

module.exports = router;

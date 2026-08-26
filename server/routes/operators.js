const express = require('express');
const db = require('../db');
const liveState = require('../liveState');

const router = express.Router();

// GET /api/operators/online — operators whose console is currently connected.
router.get('/online', (req, res) => {
  const usernames = liveState.listOnlineUsernames();
  if (!usernames.length) return res.json([]);

  const placeholders = usernames.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT username, display_name AS displayName FROM operators
    WHERE username IN (${placeholders})
  `).all(...usernames);

  res.json(rows);
});

module.exports = router;

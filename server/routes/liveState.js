const express = require('express');
const db = require('../db');
const liveState = require('../liveState');
const { touchActivity } = require('../cleanup');

const router = express.Router();

function usernameForSession(req) {
  if (!req.session.operatorId) return null;
  const row = db.prepare('SELECT username FROM operators WHERE id = ?').get(req.session.operatorId);
  return row ? row.username : null;
}

// GET /api/live-state?operator=someusername — current reference for that
// operator's room. Used by a viewer/presenter page that loads before its
// WebSocket connects, or as a fallback if WS is unavailable.
router.get('/', (req, res) => {
  const { operator } = req.query;
  if (!operator) return res.status(400).json({ error: 'operator is required' });
  res.json(liveState.getCurrentPayload(operator));
});

// POST /api/live-state — body: { version, book, chapter, verse }
// Requires login. Updates the logged-in operator's own room and broadcasts
// it to every viewer currently watching that operator, plus their own
// console (other tabs) for consistency. Also saves this as their resume point.
router.post('/', (req, res) => {
  const username = usernameForSession(req);
  if (!username) return res.status(401).json({ error: 'Not logged in' });

  const { version, book, chapter, verse } = req.body || {};
  if (!book || !chapter || !verse) {
    return res.status(400).json({ error: 'book, chapter, and verse are required' });
  }
  const payload = liveState.setReference(username, { version, book, chapter, verse });
  touchActivity(username);

  db.prepare(`
    UPDATE operators SET last_version = ?, last_book = ?, last_chapter = ?, last_verse = ?
    WHERE id = ?
  `).run(payload.version, payload.book, payload.chapter, payload.verse, req.session.operatorId);

  res.json(payload);
});

module.exports = router;

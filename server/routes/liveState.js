const express = require('express');
const db = require('../db');
const liveState = require('../liveState');
const { touchActivity } = require('../cleanup');

const router = express.Router();

function localeForSession(req) {
  if (!req.session.operatorId) return null;
  const row = db.prepare('SELECT locale FROM operators WHERE id = ?').get(req.session.operatorId);
  return row ? row.locale : null;
}

// GET /api/live-state?locale=Ugong — current reference for that locale's
// room. Used by a viewer/presenter page that loads before its WebSocket
// connects, or as a fallback if WS is unavailable.
router.get('/', (req, res) => {
  const { locale } = req.query;
  if (!locale) return res.status(400).json({ error: 'locale is required' });
  res.json(liveState.getCurrentPayload(locale));
});

// POST /api/live-state — body: { version, book, chapter, verse, background, safeMargin }
// Requires login. Updates the logged-in operator's locale room and
// broadcasts it to every viewer currently watching that locale, plus every
// operator console signed in under the same locale (multiple operators can
// share one locale — the room is shared, not per-account). Also saves this
// as this operator account's own resume point.
router.post('/', (req, res) => {
  const locale = localeForSession(req);
  if (!locale) return res.status(401).json({ error: 'Not logged in' });

  const { version, book, chapter, verse, background, safeMargin } = req.body || {};
  if (!book || !chapter || !verse) {
    return res.status(400).json({ error: 'book, chapter, and verse are required' });
  }
  const payload = liveState.setReference(locale, { version, book, chapter, verse, background, safeMargin });
  touchActivity(req.session.operatorId);

  db.prepare(`
    UPDATE operators
    SET last_version = ?, last_book = ?, last_chapter = ?, last_verse = ?,
        last_background = ?, last_safe_margin = ?
    WHERE id = ?
  `).run(payload.version, payload.book, payload.chapter, payload.verse,
         payload.background, payload.safeMargin, req.session.operatorId);

  res.json(payload);
});

// POST /api/live-state/blank — body: { blank: true|false }
// Emergency blank screen — doesn't touch the current verse reference, just
// toggles whether the presenter shows it or goes to plain black. Not
// persisted across restarts on purpose — it's a live-only safety control,
// not something you'd want silently re-applied next time you log in.
router.post('/blank', (req, res) => {
  const locale = localeForSession(req);
  if (!locale) return res.status(401).json({ error: 'Not logged in' });

  const { blank } = req.body || {};
  const payload = liveState.setBlank(locale, !!blank);
  touchActivity(req.session.operatorId);
  res.json(payload);
});

module.exports = router;

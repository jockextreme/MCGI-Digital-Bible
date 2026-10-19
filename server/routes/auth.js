const express = require('express');
const db = require('../db');
const { issueWsToken } = require('../wsTokens');
const { touchActivity } = require('../cleanup');

const router = express.Router();

// Locales are place names ("Ugong", "San Juan"); operator names are people
// ("Bro. Juan", "Sis. Maria") — both allow spaces/accents/hyphens/periods/
// apostrophes rather than a tight username-style character set.
const NAME_RE = /^[\p{L}0-9'.\- ]{2,40}$/u;

function publicOperator(row) {
  if (!row) return null;
  return {
    id: row.id,
    locale: row.locale,
    operatorName: row.operator_name,
    label: `${row.locale} · ${row.operator_name}`,
    isPublic: !!row.is_public,
    lastVersion: row.last_version,
    lastBook: row.last_book,
    lastChapter: row.last_chapter,
    lastVerse: row.last_verse,
    lastBackground: row.last_background,
    lastSafeMargin: row.last_safe_margin
  };
}

function cleanName(s) {
  return (s || '').trim().replace(/\s+/g, ' ');
}

// GET /api/auth/check-operator?locale=Ugong&operatorName=Bro.%20Juan
// Informational only — there's no password gate anymore, so this just tells
// the form whether that locale+name pair is already an active room (so a
// second person typing the same thing knows they'd be taking it over, not
// creating a conflict).
router.get('/check-operator', (req, res) => {
  const locale = cleanName(req.query.locale);
  const operatorName = cleanName(req.query.operatorName);
  if (!locale || !NAME_RE.test(locale) || !operatorName || !NAME_RE.test(operatorName)) {
    return res.json({ valid: false, available: false });
  }
  const existing = db.prepare(
    'SELECT id FROM operators WHERE locale = ? COLLATE NOCASE AND operator_name = ? COLLATE NOCASE'
  ).get(locale, operatorName);
  res.json({ valid: true, available: !existing });
});

// POST /api/auth/start — { locale, operatorName, isPublic }
// No account, no password: entering a locale + operator name either creates
// that room (first time) or re-enters it (if it already exists) — same
// "whoever connects most recently is the active broadcaster" model the rest
// of the app already uses. This is deliberately not a credential-gated login.
router.post('/start', (req, res) => {
  const locale = cleanName(req.body && req.body.locale);
  const operatorName = cleanName(req.body && req.body.operatorName);
  const { isPublic } = req.body || {};

  if (!locale || !NAME_RE.test(locale)) {
    return res.status(400).json({ error: 'Locale should be 2-40 characters — letters, numbers, spaces, hyphens.' });
  }
  if (!operatorName || !NAME_RE.test(operatorName)) {
    return res.status(400).json({ error: 'Operator name should be 2-40 characters — letters, numbers, spaces, hyphens.' });
  }

  let row = db.prepare(
    'SELECT * FROM operators WHERE locale = ? COLLATE NOCASE AND operator_name = ? COLLATE NOCASE'
  ).get(locale, operatorName);

  if (row) {
    // Re-entering an existing room — refresh visibility if provided, keep everything else (resume point) as-is.
    if (typeof isPublic !== 'undefined') {
      db.prepare('UPDATE operators SET is_public = ? WHERE id = ?').run(isPublic === false ? 0 : 1, row.id);
    }
    row = db.prepare('SELECT * FROM operators WHERE id = ?').get(row.id);
  } else {
    const info = db.prepare(`
      INSERT INTO operators (locale, operator_name, is_public)
      VALUES (?, ?, ?)
    `).run(locale, operatorName, isPublic === false ? 0 : 1);
    row = db.prepare('SELECT * FROM operators WHERE id = ?').get(info.lastInsertRowid);
  }

  req.session.operatorId = row.id;
  touchActivity(row.id);
  res.json(publicOperator(row));
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me — current session, or null if not logged in
router.get('/me', (req, res) => {
  if (!req.session.operatorId) return res.json(null);
  const row = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.session.operatorId);
  if (!row) return res.json(null);
  res.json(publicOperator(row));
});

// POST /api/auth/heartbeat — called periodically by an open Control Panel so
// a live-but-idle session doesn't get swept by the inactivity cleanup.
router.post('/heartbeat', (req, res) => {
  if (!req.session.operatorId) return res.status(401).json({ error: 'Not logged in' });
  touchActivity(req.session.operatorId);
  res.json({ ok: true });
});

// PUT /api/auth/visibility — { isPublic } — toggle public/private anytime
router.put('/visibility', (req, res) => {
  if (!req.session.operatorId) return res.status(401).json({ error: 'Not logged in' });
  const { isPublic } = req.body || {};
  db.prepare('UPDATE operators SET is_public = ? WHERE id = ?').run(isPublic ? 1 : 0, req.session.operatorId);
  const row = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.session.operatorId);
  res.json(publicOperator(row));
});

// GET /api/auth/ws-token — a short-lived, single-use token so the operator's
// browser can open an authenticated WebSocket connection (raw `ws` sockets
// don't get the session cookie parsed automatically the way REST routes do).
router.get('/ws-token', (req, res) => {
  if (!req.session.operatorId) return res.status(401).json({ error: 'Not logged in' });
  touchActivity(req.session.operatorId);
  res.json({ token: issueWsToken(req.session.operatorId) });
});

module.exports = router;

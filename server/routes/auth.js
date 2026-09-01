const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../auth');
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
// Real-time availability check while filling out the registration form.
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

// POST /api/auth/register — { locale, operatorName, password, isPublic }
router.post('/register', (req, res) => {
  const { password, isPublic } = req.body || {};
  const locale = cleanName(req.body && req.body.locale);
  const operatorName = cleanName(req.body && req.body.operatorName);

  if (!locale || !NAME_RE.test(locale)) {
    return res.status(400).json({ error: 'Locale should be 2-40 characters — letters, numbers, spaces, hyphens.' });
  }
  if (!operatorName || !NAME_RE.test(operatorName)) {
    return res.status(400).json({ error: 'Operator name should be 2-40 characters — letters, numbers, spaces, hyphens.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare(
    'SELECT id FROM operators WHERE locale = ? COLLATE NOCASE AND operator_name = ? COLLATE NOCASE'
  ).get(locale, operatorName);
  if (existing) {
    return res.status(409).json({ error: `"${operatorName}" is already registered under "${locale}" — try a different operator name.` });
  }

  const { hash, salt } = hashPassword(password);
  const info = db.prepare(`
    INSERT INTO operators (locale, operator_name, password_hash, password_salt, is_public)
    VALUES (?, ?, ?, ?, ?)
  `).run(locale, operatorName, hash, salt, isPublic === false ? 0 : 1);

  const row = db.prepare('SELECT * FROM operators WHERE id = ?').get(info.lastInsertRowid);
  req.session.operatorId = row.id;
  res.json(publicOperator(row));
});

// POST /api/auth/login — { locale, operatorName, password }
router.post('/login', (req, res) => {
  const locale = cleanName(req.body && req.body.locale);
  const operatorName = cleanName(req.body && req.body.operatorName);
  const { password } = req.body || {};

  const row = db.prepare(
    'SELECT * FROM operators WHERE locale = ? COLLATE NOCASE AND operator_name = ? COLLATE NOCASE'
  ).get(locale, operatorName);
  if (!row || !verifyPassword(password || '', row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect locale, operator name, or password.' });
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
// a live-but-idle session doesn't get swept by the 1-hour inactivity cleanup.
router.post('/heartbeat', (req, res) => {
  if (!req.session.operatorId) return res.status(401).json({ error: 'Not logged in' });
  touchActivity(req.session.operatorId);
  res.json({ ok: true });
});

// PUT /api/auth/visibility — { isPublic } — toggle public/private after signup
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

const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../auth');
const { issueWsToken } = require('../wsTokens');
const { touchActivity } = require('../cleanup');

const router = express.Router();

// Locales are place names ("Ugong", "San Juan"), so allow spaces/accents/
// hyphens/apostrophes, not just the tight username-style character set.
const LOCALE_RE = /^[\p{L}0-9'.\- ]{2,40}$/u;

function publicOperator(row) {
  if (!row) return null;
  return {
    id: row.id,
    locale: row.username,
    isPublic: !!row.is_public,
    lastVersion: row.last_version,
    lastBook: row.last_book,
    lastChapter: row.last_chapter,
    lastVerse: row.last_verse,
    lastBackground: row.last_background,
    lastSafeMargin: row.last_safe_margin
  };
}

// POST /api/auth/register — { locale, password, isPublic }
// GET /api/auth/check-locale?locale=Ugong — real-time availability check
// while someone's typing on the registration form.
router.get('/check-locale', (req, res) => {
  const cleanLocale = (req.query.locale || '').trim().replace(/\s+/g, ' ');
  if (!cleanLocale || !LOCALE_RE.test(cleanLocale)) {
    return res.json({ valid: false, available: false });
  }
  const existing = db.prepare('SELECT id FROM operators WHERE username = ? COLLATE NOCASE').get(cleanLocale);
  res.json({ valid: true, available: !existing });
});

router.post('/register', (req, res) => {
  const { locale, password, isPublic } = req.body || {};
  const cleanLocale = (locale || '').trim().replace(/\s+/g, ' ');

  if (!cleanLocale || !LOCALE_RE.test(cleanLocale)) {
    return res.status(400).json({ error: 'Locale should be 2-40 characters — letters, numbers, spaces, hyphens.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM operators WHERE username = ? COLLATE NOCASE').get(cleanLocale);
  if (existing) return res.status(409).json({ error: `"${cleanLocale}" is already taken — try another locale name.` });

  const { hash, salt } = hashPassword(password);
  const info = db.prepare(`
    INSERT INTO operators (username, display_name, password_hash, password_salt, is_public)
    VALUES (?, ?, ?, ?, ?)
  `).run(cleanLocale, cleanLocale, hash, salt, isPublic === false ? 0 : 1);

  const row = db.prepare('SELECT * FROM operators WHERE id = ?').get(info.lastInsertRowid);
  req.session.operatorId = row.id;
  res.json(publicOperator(row));
});

// POST /api/auth/login — { locale, password }
router.post('/login', (req, res) => {
  const { locale, password } = req.body || {};
  const cleanLocale = (locale || '').trim();
  const row = db.prepare('SELECT * FROM operators WHERE username = ? COLLATE NOCASE').get(cleanLocale);
  if (!row || !verifyPassword(password || '', row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect locale or password.' });
  }
  req.session.operatorId = row.id;
  touchActivity(row.username);
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
  const row = db.prepare('SELECT username FROM operators WHERE id = ?').get(req.session.operatorId);
  if (row) touchActivity(row.username);
  res.json({ token: issueWsToken(req.session.operatorId) });
});

module.exports = router;

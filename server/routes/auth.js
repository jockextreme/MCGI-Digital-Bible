const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../auth');
const { issueWsToken } = require('../wsTokens');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

function publicOperator(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    lastVersion: row.last_version,
    lastBook: row.last_book,
    lastChapter: row.last_chapter,
    lastVerse: row.last_verse
  };
}

// POST /api/auth/register — { username, password, displayName }
router.post('/register', (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, _ or -' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = db.prepare('SELECT id FROM operators WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That username is already taken' });

  const { hash, salt } = hashPassword(password);
  const info = db.prepare(`
    INSERT INTO operators (username, display_name, password_hash, password_salt)
    VALUES (?, ?, ?, ?)
  `).run(username, displayName || username, hash, salt);

  const row = db.prepare('SELECT * FROM operators WHERE id = ?').get(info.lastInsertRowid);
  req.session.operatorId = row.id;
  res.json(publicOperator(row));
});

// POST /api/auth/login — { username, password }
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM operators WHERE username = ?').get(username || '');
  if (!row || !verifyPassword(password || '', row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.operatorId = row.id;
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

// GET /api/auth/ws-token — a short-lived, single-use token so the operator's
// browser can open an authenticated WebSocket connection (raw `ws` sockets
// don't get the session cookie parsed automatically the way REST routes do).
router.get('/ws-token', (req, res) => {
  if (!req.session.operatorId) return res.status(401).json({ error: 'Not logged in' });
  res.json({ token: issueWsToken(req.session.operatorId) });
});

module.exports = router;

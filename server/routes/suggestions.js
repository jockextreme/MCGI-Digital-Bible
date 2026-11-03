const express = require('express');
const db = require('../db');

const router = express.Router();

// Minimal in-memory per-IP throttle — no new dependency needed for this.
// Resets on server restart, which is fine: the goal is just to stop a single
// bad actor from spamming, not to be a durable rate-limit store.
const lastSubmitByIp = new Map();
const MIN_SECONDS_BETWEEN_SUBMITS = 15;

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

// POST /api/suggestions — { message, name? }
// Open to anyone (operator or viewer) — no login required. This is meant to
// be an easy, low-friction way for people actually using the app to leave
// feedback or request a feature.
router.post('/', (req, res) => {
  const message = ((req.body && req.body.message) || '').trim();
  const name = ((req.body && req.body.name) || '').trim().slice(0, 60);

  if (!message) {
    return res.status(400).json({ error: 'Please write a suggestion before sending.' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Keep it under 2000 characters.' });
  }

  const ip = clientIp(req);
  const now = Date.now();
  const last = lastSubmitByIp.get(ip) || 0;
  if (now - last < MIN_SECONDS_BETWEEN_SUBMITS * 1000) {
    return res.status(429).json({ error: 'Please wait a few seconds before sending another one.' });
  }
  lastSubmitByIp.set(ip, now);

  db.prepare('INSERT INTO suggestions (message, name) VALUES (?, ?)').run(message, name || null);
  res.json({ ok: true });
});

// GET /api/suggestions?key=<ADMIN_KEY> — simple owner-only view of what's
// been submitted. There's no operator login gating this app's public pages
// anymore, so this is deliberately a separate, server-only secret rather
// than tied to any session. Set ADMIN_KEY in the environment to enable it —
// without it, this route is disabled entirely.
router.get('/', (req, res) => {
  const key = process.env.ADMIN_KEY;
  if (!key || req.query.key !== key) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const rows = db.prepare(
    'SELECT id, message, name, created_at AS createdAt FROM suggestions ORDER BY id DESC LIMIT 300'
  ).all();
  res.json(rows);
});

module.exports = router;

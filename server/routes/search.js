const express = require('express');
const db = require('../db');

const router = express.Router();
const MAX_RESULTS = 60;

// GET /api/search?version=ADB&q=love
router.get('/', (req, res) => {
  const { version, q } = req.query;
  if (!version) return res.status(400).json({ error: 'version is required' });
  if (!q || q.trim().length < 2) {
    return res.json({ query: q || '', results: [], total: 0 });
  }

  const versionInfo = db.prepare('SELECT * FROM versions WHERE code = ?').get(version);
  if (!versionInfo || !versionInfo.has_data) {
    return res.json({ query: q, results: [], total: 0, noData: true });
  }

  // FTS5 match syntax needs quoting for phrases with spaces / punctuation safety.
  const ftsQuery = '"' + q.trim().replace(/"/g, '""') + '"';

  let rows;
  try {
    rows = db.prepare(`
      SELECT v.book_key AS bookKey, b.tagalog_name AS tagalogName,
             v.chapter AS chapter, v.verse AS verse, v.text AS text
      FROM verses_fts
      JOIN verses v ON v.id = verses_fts.rowid
      JOIN books b ON b.key = v.book_key
      WHERE verses_fts MATCH ? AND v.version_code = ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, version, MAX_RESULTS);
  } catch (err) {
    // Fallback to plain LIKE search if FTS query syntax fails on unusual input.
    rows = db.prepare(`
      SELECT v.book_key AS bookKey, b.tagalog_name AS tagalogName,
             v.chapter AS chapter, v.verse AS verse, v.text AS text
      FROM verses v
      JOIN books b ON b.key = v.book_key
      WHERE v.version_code = ? AND v.text LIKE ?
      LIMIT ?
    `).all(version, `%${q.trim()}%`, MAX_RESULTS);
  }

  res.json({
    query: q,
    results: rows,
    total: rows.length,
    truncated: rows.length >= MAX_RESULTS
  });
});

module.exports = router;

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/books — full book list in canonical order, with Tagalog display names.
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT key, tagalog_name AS tagalogName, chapter_count AS chapterCount
    FROM books
    ORDER BY sort_order ASC
  `).all();
  res.json(rows);
});

module.exports = router;
